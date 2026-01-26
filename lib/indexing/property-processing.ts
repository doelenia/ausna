import { createServiceClient } from '@/lib/supabase/service'
import { extractFromPropertyText, extractFromCompoundText } from './extraction'
import {
  generateEmbedding,
  storeAtomicKnowledge,
  createOrUpdateTopic,
  extractAdditionalTopicsFromAsks,
} from './vectors'
import { updateUserInterests } from './interest-tracking'
import { ProjectPortfolioMetadata, HumanPortfolioMetadata } from '@/types/portfolio'

/**
 * Cleanup atomic knowledge entries matching source_info before reprocessing
 */
export async function cleanupPropertyIndexes(
  sourceType: 'note' | 'human_description' | 'project_description' | 'project_property',
  sourceId: string,
  propertyName?: 'goals' | 'timelines' | 'asks'
): Promise<void> {
  const supabase = createServiceClient()

  // Build query to match source_info
  let query = supabase
    .from('atomic_knowledge')
    .delete()
    .eq('source_info->>source_type', sourceType)
    .eq('source_info->>source_id', sourceId)

  // If property_name is provided, also match that
  if (propertyName) {
    query = query.eq('source_info->>property_name', propertyName)
  }

  const { error } = await query

  if (error) {
    throw new Error(`Failed to cleanup property indexes: ${error.message}`)
  }
}

/**
 * Build context string with project/human info for AI
 */
export async function buildPropertyContext(
  portfolioId: string,
  propertyType: 'human_description' | 'project_description' | 'project_property'
): Promise<{
  projectDescription?: string
  humanDescription?: string
  projectName?: string
  humanName?: string
}> {
  const supabase = createServiceClient()

  // Fetch the portfolio
  const { data: portfolio, error } = await supabase
    .from('portfolios')
    .select('type, metadata, user_id')
    .eq('id', portfolioId)
    .single()

  if (error || !portfolio) {
    throw new Error(`Portfolio not found: ${portfolioId}`)
  }

  const context: {
    projectDescription?: string
    humanDescription?: string
    projectName?: string
    humanName?: string
  } = {}

  if (portfolio.type === 'projects') {
    const metadata = portfolio.metadata as ProjectPortfolioMetadata
    context.projectName = metadata.basic?.name
    context.projectDescription = metadata.basic?.description

    // Get human portfolio of project owner
    const { data: humanPortfolio } = await supabase
      .from('portfolios')
      .select('metadata')
      .eq('type', 'human')
      .eq('user_id', portfolio.user_id)
      .single()

    if (humanPortfolio) {
      const humanMetadata = humanPortfolio.metadata as HumanPortfolioMetadata
      context.humanName = humanMetadata.basic?.name
      context.humanDescription = humanMetadata.basic?.description
    }
  } else if (portfolio.type === 'human') {
    const metadata = portfolio.metadata as HumanPortfolioMetadata
    context.humanName = metadata.basic?.name
    context.humanDescription = metadata.basic?.description
  }

  return context
}

/**
 * Process human portfolio description
 */
export async function processHumanDescription(
  portfolioId: string,
  userId: string,
  description?: string | null
): Promise<void> {
  const supabase = createServiceClient()

  // Get description if not provided
  let finalDescription = description
  if (finalDescription === undefined) {
    const { data: portfolio, error } = await supabase
      .from('portfolios')
      .select('metadata')
      .eq('id', portfolioId)
      .eq('type', 'human')
      .single()

    if (error || !portfolio) {
      throw new Error(`Human portfolio not found: ${portfolioId}`)
    }

    const metadata = portfolio.metadata as HumanPortfolioMetadata
    finalDescription = metadata.basic?.description || ''
  }

  if (!finalDescription || finalDescription.trim().length === 0) {
    // No description to process
    return
  }

  // Cleanup existing indexes
  await cleanupPropertyIndexes('human_description', portfolioId)

  // Build context
  const context = await buildPropertyContext(portfolioId, 'human_description')

  // Extract information
  const extraction = await extractFromPropertyText(finalDescription, {
    propertyType: 'human_description',
    humanName: context.humanName,
    humanDescription: context.humanDescription,
  })

  // Process topics
  const topicIds: string[] = []
  if (extraction.topics && extraction.topics.length > 0) {
    for (const topic of extraction.topics) {
      try {
        const topicId = await createOrUpdateTopic(topic.name, topic.description, null)
        topicIds.push(topicId)
      } catch (error) {
        console.error(`Failed to process topic ${topic.name}:`, error)
        // Continue with other topics
      }
    }
  }

  // Store atomic knowledge (not asks)
  const allKnowledge = extraction.atomicKnowledge || []
  if (allKnowledge.length > 0) {
    await storeAtomicKnowledge(allKnowledge, {
      noteId: null,
      isAsks: new Array(allKnowledge.length).fill(false),
      assignedHuman: [portfolioId],
      assignedProjects: [],
      topics: topicIds,
      sourceInfo: {
        source_type: 'human_description',
        source_id: portfolioId,
      },
    })
  }

  // Store asks
  const allAsks = extraction.asks || []
  if (allAsks.length > 0) {
    // First, extract additional topics from asks
    const asksWithTopics = allAsks.map((ask) => ({
      ask,
      topics: extraction.topics || [],
    }))

    let additionalTopics: Array<{ name: string; description: string }> = []
    try {
      additionalTopics = await extractAdditionalTopicsFromAsks(asksWithTopics)
    } catch (error) {
      console.error('Failed to extract additional topics from asks:', error)
      // Continue without additional topics
    }

    // Process additional topics
    const additionalTopicIds: string[] = []
    for (const topic of additionalTopics) {
      try {
        const topicId = await createOrUpdateTopic(topic.name, topic.description, null)
        additionalTopicIds.push(topicId)
      } catch (error) {
        console.error(`Failed to process additional topic ${topic.name}:`, error)
        // Continue with other topics
      }
    }

    // Combine original topics with additional topics
    const allTopicIds = [...topicIds, ...additionalTopicIds]

    await storeAtomicKnowledge(allAsks, {
      noteId: null,
      isAsks: new Array(allAsks.length).fill(true),
      assignedHuman: [portfolioId],
      assignedProjects: [],
      topics: allTopicIds,
      sourceInfo: {
        source_type: 'human_description',
        source_id: portfolioId,
      },
    })
  }

  // Update user interests
  if (topicIds.length > 0) {
    const isPersonalPortfolio = true // Human description is always personal
    const weight = isPersonalPortfolio ? 3 : 0.1
    await updateUserInterests(userId, topicIds, weight)
  }
}

/**
 * Process project portfolio description
 */
export async function processProjectDescription(
  portfolioId: string,
  userId: string,
  description?: string | null
): Promise<void> {
  const supabase = createServiceClient()

  // Get description if not provided
  let finalDescription = description
  if (finalDescription === undefined) {
    const { data: portfolio, error } = await supabase
      .from('portfolios')
      .select('metadata, user_id')
      .eq('id', portfolioId)
      .eq('type', 'projects')
      .single()

    if (error || !portfolio) {
      throw new Error(`Project portfolio not found: ${portfolioId}`)
    }

    const metadata = portfolio.metadata as ProjectPortfolioMetadata
    finalDescription = metadata.basic?.description || ''
  }

  if (!finalDescription || finalDescription.trim().length === 0) {
    // No description to process
    return
  }

  // Get project owner's human portfolio
  const { data: projectPortfolio } = await supabase
    .from('portfolios')
    .select('user_id')
    .eq('id', portfolioId)
    .single()

  if (!projectPortfolio) {
    throw new Error(`Project portfolio not found: ${portfolioId}`)
  }

  const { data: humanPortfolio } = await supabase
    .from('portfolios')
    .select('id')
    .eq('type', 'human')
    .eq('user_id', projectPortfolio.user_id)
    .single()

  const humanPortfolioId = humanPortfolio?.id

  // Cleanup existing indexes
  await cleanupPropertyIndexes('project_description', portfolioId)

  // Build context
  const context = await buildPropertyContext(portfolioId, 'project_description')

  // Extract information
  const extraction = await extractFromPropertyText(finalDescription, {
    propertyType: 'project_description',
    projectName: context.projectName,
    projectDescription: context.projectDescription,
    humanDescription: context.humanDescription,
  })

  // Process topics
  const topicIds: string[] = []
  if (extraction.topics && extraction.topics.length > 0) {
    for (const topic of extraction.topics) {
      try {
        const topicId = await createOrUpdateTopic(topic.name, topic.description, null)
        topicIds.push(topicId)
      } catch (error) {
        console.error(`Failed to process topic ${topic.name}:`, error)
        // Continue with other topics
      }
    }
  }

  // Store atomic knowledge (not asks)
  const allKnowledge = extraction.atomicKnowledge || []
  if (allKnowledge.length > 0) {
    await storeAtomicKnowledge(allKnowledge, {
      noteId: null,
      isAsks: new Array(allKnowledge.length).fill(false),
      assignedHuman: humanPortfolioId ? [humanPortfolioId] : [],
      assignedProjects: [portfolioId],
      topics: topicIds,
      sourceInfo: {
        source_type: 'project_description',
        source_id: portfolioId,
      },
    })
  }

  // Store asks
  const allAsks = extraction.asks || []
  if (allAsks.length > 0) {
    // First, extract additional topics from asks
    const asksWithTopics = allAsks.map((ask) => ({
      ask,
      topics: extraction.topics || [],
    }))

    let additionalTopics: Array<{ name: string; description: string }> = []
    try {
      additionalTopics = await extractAdditionalTopicsFromAsks(asksWithTopics)
    } catch (error) {
      console.error('Failed to extract additional topics from asks:', error)
      // Continue without additional topics
    }

    // Process additional topics
    const additionalTopicIds: string[] = []
    for (const topic of additionalTopics) {
      try {
        const topicId = await createOrUpdateTopic(topic.name, topic.description, null)
        additionalTopicIds.push(topicId)
      } catch (error) {
        console.error(`Failed to process additional topic ${topic.name}:`, error)
        // Continue with other topics
      }
    }

    // Combine original topics with additional topics
    const allTopicIds = [...topicIds, ...additionalTopicIds]

    await storeAtomicKnowledge(allAsks, {
      noteId: null,
      isAsks: new Array(allAsks.length).fill(true),
      assignedHuman: humanPortfolioId ? [humanPortfolioId] : [],
      assignedProjects: [portfolioId],
      topics: allTopicIds,
      sourceInfo: {
        source_type: 'project_description',
        source_id: portfolioId,
      },
    })
  }

  // Update user interests
  if (topicIds.length > 0) {
    const isPersonalPortfolio = false // Project description is not personal
    const weight = isPersonalPortfolio ? 3 : 0.1
    await updateUserInterests(userId, topicIds, weight)
  }
}

/**
 * Process individual project property (goals, timelines, asks)
 */
export async function processProjectProperty(
  portfolioId: string,
  userId: string,
  propertyName: 'goals' | 'timelines' | 'asks',
  propertyValue?: string | null
): Promise<void> {
  const supabase = createServiceClient()

  // Get property value if not provided
  let finalValue = propertyValue
  if (finalValue === undefined) {
    const { data: portfolio, error } = await supabase
      .from('portfolios')
      .select('metadata, user_id')
      .eq('id', portfolioId)
      .eq('type', 'projects')
      .single()

    if (error || !portfolio) {
      throw new Error(`Project portfolio not found: ${portfolioId}`)
    }

    const metadata = portfolio.metadata as ProjectPortfolioMetadata
    if (propertyName === 'asks') {
      // For asks, it's an array of objects
      const asks = metadata.properties?.asks || []
      finalValue = asks.map((ask) => `${ask.title}: ${ask.description}`).join('\n\n')
    } else {
      finalValue = metadata.properties?.[propertyName] || ''
    }
  }

  if (!finalValue || finalValue.trim().length === 0) {
    // No value to process
    return
  }

  // Get project owner's human portfolio
  const { data: projectPortfolio } = await supabase
    .from('portfolios')
    .select('user_id')
    .eq('id', portfolioId)
    .single()

  if (!projectPortfolio) {
    throw new Error(`Project portfolio not found: ${portfolioId}`)
  }

  const { data: humanPortfolio } = await supabase
    .from('portfolios')
    .select('id')
    .eq('type', 'human')
    .eq('user_id', projectPortfolio.user_id)
    .single()

  const humanPortfolioId = humanPortfolio?.id

  // Cleanup existing indexes
  await cleanupPropertyIndexes('project_property', portfolioId, propertyName)

  // Build context
  const context = await buildPropertyContext(portfolioId, 'project_property')

  // Extract information
  const extraction = await extractFromPropertyText(finalValue, {
    propertyType: 'project_property',
    propertyName,
    projectName: context.projectName,
    projectDescription: context.projectDescription,
    humanDescription: context.humanDescription,
  })

  // Process topics
  const topicIds: string[] = []
  if (extraction.topics && extraction.topics.length > 0) {
    for (const topic of extraction.topics) {
      try {
        const topicId = await createOrUpdateTopic(topic.name, topic.description, null)
        topicIds.push(topicId)
      } catch (error) {
        console.error(`Failed to process topic ${topic.name}:`, error)
        // Continue with other topics
      }
    }
  }

  // Store atomic knowledge (not asks)
  const allKnowledge = extraction.atomicKnowledge || []
  if (allKnowledge.length > 0) {
    await storeAtomicKnowledge(allKnowledge, {
      noteId: null,
      isAsks: new Array(allKnowledge.length).fill(false),
      assignedHuman: humanPortfolioId ? [humanPortfolioId] : [],
      assignedProjects: [portfolioId],
      topics: topicIds,
      sourceInfo: {
        source_type: 'project_property',
        source_id: portfolioId,
        property_name: propertyName,
      },
    })
  }

  // Store asks
  const allAsks = extraction.asks || []
  if (allAsks.length > 0) {
    // First, extract additional topics from asks
    const asksWithTopics = allAsks.map((ask) => ({
      ask,
      topics: extraction.topics || [],
    }))

    let additionalTopics: Array<{ name: string; description: string }> = []
    try {
      additionalTopics = await extractAdditionalTopicsFromAsks(asksWithTopics)
    } catch (error) {
      console.error('Failed to extract additional topics from asks:', error)
      // Continue without additional topics
    }

    // Process additional topics
    const additionalTopicIds: string[] = []
    for (const topic of additionalTopics) {
      try {
        const topicId = await createOrUpdateTopic(topic.name, topic.description, null)
        additionalTopicIds.push(topicId)
      } catch (error) {
        console.error(`Failed to process additional topic ${topic.name}:`, error)
        // Continue with other topics
      }
    }

    // Combine original topics with additional topics
    const allTopicIds = [...topicIds, ...additionalTopicIds]

    await storeAtomicKnowledge(allAsks, {
      noteId: null,
      isAsks: new Array(allAsks.length).fill(true),
      assignedHuman: humanPortfolioId ? [humanPortfolioId] : [],
      assignedProjects: [portfolioId],
      topics: allTopicIds,
      sourceInfo: {
        source_type: 'project_property',
        source_id: portfolioId,
        property_name: propertyName,
      },
    })
  }

  // Update user interests
  if (topicIds.length > 0) {
    const isPersonalPortfolio = false // Project properties are not personal
    const weight = isPersonalPortfolio ? 3 : 0.1
    await updateUserInterests(userId, topicIds, weight)
  }
}

