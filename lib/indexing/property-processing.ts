import { createServiceClient } from '@/lib/supabase/service'
import { extractFromPropertyText, extractFromCompoundText } from './extraction'
import {
  generateEmbedding,
  storeAtomicKnowledge,
  createOrUpdateTopic,
  extractAdditionalTopicsFromAsks,
} from './vectors'
import { updateUserInterests } from './interest-tracking'
import { ProjectPortfolioMetadata, HumanPortfolioMetadata, ActivityPortfolioMetadata } from '@/types/portfolio'

/**
 * Cleanup atomic knowledge entries matching source_info before reprocessing
 */
export async function cleanupPropertyIndexes(
  sourceType: 'note' | 'human_description' | 'project_description' | 'project_property' | 'activity_description',
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
  propertyType: 'human_description' | 'project_description' | 'project_property' | 'activity_description',
  propertyName?: 'goals' | 'timelines' | 'asks'
): Promise<{
  projectDescription?: string
  humanDescription?: string
  projectName?: string
  humanName?: string
  projectGoals?: string
  projectAsks?: string
  activityName?: string
  externalLink?: string
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
    projectGoals?: string
    projectAsks?: string
    activityName?: string
    externalLink?: string
  } = {}

  if (portfolio.type === 'activities') {
    const metadata = portfolio.metadata as Record<string, unknown>
    const basic = (metadata?.basic as Record<string, unknown>) || {}
    const properties = (metadata?.properties as Record<string, unknown>) || {}
    context.activityName = basic.name as string
    context.externalLink = properties.external_link as string | undefined
  } else if (portfolio.type === 'projects') {
    const metadata = portfolio.metadata as ProjectPortfolioMetadata
    context.projectName = metadata.basic?.name
    context.projectDescription = metadata.basic?.description

    // Include other project properties for context when processing goals or asks
    // This helps AI infer missing information
    if (propertyType === 'project_property' && metadata.properties) {
      if (propertyName === 'asks' && metadata.properties.goals) {
        // When processing asks, include goals for context
        context.projectGoals = metadata.properties.goals
      }
      if (propertyName === 'goals' && metadata.properties.asks) {
        // When processing goals, include asks for context
        const asks = metadata.properties.asks || []
        if (asks.length > 0) {
          context.projectAsks = asks.map((ask) => `${ask.title}: ${ask.description}`).join('\n\n')
        }
      }
    }

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
  let additionalTopicIds: string[] = []
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
    additionalTopicIds = []
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

  // Combined topic IDs for creator interests and portfolio metadata (topicIds + additionalTopicIds when we had asks)
  const combinedTopicIds = topicIds.length > 0 || (extraction.asks && extraction.asks.length > 0)
    ? (extraction.asks && extraction.asks.length > 0
        ? [...topicIds, ...additionalTopicIds]
        : topicIds)
    : []

  // Persist description_topics on portfolio for join-flow interest updates
  if (combinedTopicIds.length > 0) {
    const { data: currentPortfolio } = await supabase
      .from('portfolios')
      .select('metadata')
      .eq('id', portfolioId)
      .single()
    if (currentPortfolio) {
      const meta = (currentPortfolio.metadata as Record<string, unknown>) || {}
      await supabase
        .from('portfolios')
        .update({
          metadata: { ...meta, description_topics: combinedTopicIds },
        })
        .eq('id', portfolioId)
    }
  }

  // Update user interests (use combined topic IDs, weight 0.1 for project)
  if (combinedTopicIds.length > 0) {
    const isPersonalPortfolio = false // Project description is not personal
    const weight = isPersonalPortfolio ? 3 : 0.1
    await updateUserInterests(userId, combinedTopicIds, weight)
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

  // For goals and asks, process even if empty to allow AI inference based on context
  // For timelines, skip if empty as there's no inference needed
  if (propertyName === 'timelines' && (!finalValue || finalValue.trim().length === 0)) {
    // No timeline value to process
    return
  }
  
  // For goals and asks, if empty, use empty string to trigger inference
  if (!finalValue || finalValue.trim().length === 0) {
    finalValue = ''
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

  // Build context (include property name to get related properties for inference)
  const context = await buildPropertyContext(portfolioId, 'project_property', propertyName)

  // Extract information (include related properties for inference)
  const extraction = await extractFromPropertyText(finalValue, {
    propertyType: 'project_property',
    propertyName,
    projectName: context.projectName,
    projectDescription: context.projectDescription,
    humanDescription: context.humanDescription,
    projectGoals: context.projectGoals,
    projectAsks: context.projectAsks,
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

/**
 * Process activity portfolio description.
 * Same flow as project: extract atomic knowledge, asks, topics; use web search model.
 * External activities: assigned_human empty; topics and atomic knowledge still indexed; no creator interest update.
 * Non-external: tied to creator's human portfolio; creator gets interest update (weight 0.1).
 */
export async function processActivityDescription(
  portfolioId: string,
  userId: string,
  description?: string | null,
  externalLink?: string | null
): Promise<void> {
  const supabase = createServiceClient()

  let finalDescription = description
  let isExternal = false
  let resolvedExternalLink = externalLink ?? null

  if (finalDescription === undefined || resolvedExternalLink === undefined) {
    const { data: portfolio, error } = await supabase
      .from('portfolios')
      .select('metadata, user_id')
      .eq('id', portfolioId)
      .eq('type', 'activities')
      .single()

    if (error || !portfolio) {
      throw new Error(`Activity portfolio not found: ${portfolioId}`)
    }

    const metadata = portfolio.metadata as ActivityPortfolioMetadata
    if (finalDescription === undefined) {
      finalDescription = metadata.basic?.description ?? ''
    }
    const properties = metadata.properties as { external?: boolean; external_link?: string } | undefined
    if (resolvedExternalLink === undefined) {
      isExternal = properties?.external === true
      resolvedExternalLink = isExternal ? (properties?.external_link ?? null) : null
    } else {
      isExternal = Boolean(resolvedExternalLink)
    }
  } else {
    isExternal = Boolean(resolvedExternalLink)
  }

  if (!finalDescription || finalDescription.trim().length === 0) {
    if (!resolvedExternalLink) {
      return
    }
    finalDescription = '' // Allow extraction from external link only
  }

  await cleanupPropertyIndexes('activity_description', portfolioId)

  const context = await buildPropertyContext(portfolioId, 'activity_description')

  const extraction = await extractFromPropertyText(finalDescription, {
    propertyType: 'activity_description',
    activityName: context.activityName,
    externalLink: resolvedExternalLink ?? undefined,
  })

  const topicIds: string[] = []
  if (extraction.topics && extraction.topics.length > 0) {
    for (const topic of extraction.topics) {
      try {
        const topicId = await createOrUpdateTopic(topic.name, topic.description, null)
        topicIds.push(topicId)
      } catch (error) {
        console.error(`Failed to process topic ${topic.name}:`, error)
      }
    }
  }

  let additionalTopicIds: string[] = []
  const allAsks = extraction.asks || []
  if (allAsks.length > 0) {
    const asksWithTopics = allAsks.map((ask) => ({
      ask,
      topics: extraction.topics || [],
    }))
    let additionalTopics: Array<{ name: string; description: string }> = []
    try {
      additionalTopics = await extractAdditionalTopicsFromAsks(asksWithTopics)
    } catch (error) {
      console.error('Failed to extract additional topics from asks:', error)
    }
    for (const topic of additionalTopics) {
      try {
        const topicId = await createOrUpdateTopic(topic.name, topic.description, null)
        additionalTopicIds.push(topicId)
      } catch (error) {
        console.error(`Failed to process additional topic ${topic.name}:`, error)
      }
    }
  }

  const combinedTopicIds = topicIds.length > 0 || allAsks.length > 0
    ? (allAsks.length > 0 ? [...topicIds, ...additionalTopicIds] : topicIds)
    : []

  const humanPortfolioId = isExternal
    ? null
    : (await supabase
        .from('portfolios')
        .select('id')
        .eq('type', 'human')
        .eq('user_id', userId)
        .maybeSingle()
      ).data?.id ?? null

  const assignedHuman = humanPortfolioId ? [humanPortfolioId] : []

  const allKnowledge = extraction.atomicKnowledge || []
  if (allKnowledge.length > 0) {
    await storeAtomicKnowledge(allKnowledge, {
      noteId: null,
      isAsks: new Array(allKnowledge.length).fill(false),
      assignedHuman,
      assignedProjects: [],
      topics: topicIds,
      sourceInfo: {
        source_type: 'activity_description',
        source_id: portfolioId,
      },
    })
  }

  if (allAsks.length > 0) {
    await storeAtomicKnowledge(allAsks, {
      noteId: null,
      isAsks: new Array(allAsks.length).fill(true),
      assignedHuman,
      assignedProjects: [],
      topics: combinedTopicIds,
      sourceInfo: {
        source_type: 'activity_description',
        source_id: portfolioId,
      },
    })
  }

  if (combinedTopicIds.length > 0) {
    const { data: currentPortfolio } = await supabase
      .from('portfolios')
      .select('metadata')
      .eq('id', portfolioId)
      .single()
    if (currentPortfolio) {
      const meta = (currentPortfolio.metadata as Record<string, unknown>) || {}
      await supabase
        .from('portfolios')
        .update({
          metadata: { ...meta, description_topics: combinedTopicIds },
        })
        .eq('id', portfolioId)
    }
  }

  if (!isExternal && combinedTopicIds.length > 0) {
    await updateUserInterests(userId, combinedTopicIds, 0.1)
  }
}

