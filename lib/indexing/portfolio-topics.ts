import { createServiceClient } from '@/lib/supabase/service'
import { extractFromCompoundText } from './extraction'
import { createOrUpdateTopic } from './vectors'

/**
 * Extract topics from portfolio description
 * Uses the same extraction logic as notes but only returns topics
 */
export async function extractTopicsFromDescription(
  description: string
): Promise<Array<{ name: string; description: string }>> {
  if (!description || description.trim().length === 0) {
    return []
  }

  try {
    const extraction = await extractFromCompoundText(description)
    return extraction.topics || []
  } catch (error) {
    console.error('Failed to extract topics from portfolio description:', error)
    return []
  }
}

/**
 * Process portfolio description topics
 * - Extracts topics from description
 * - Handles old topics (decrements mention_count)
 * - Processes new topics (similarity check at 80%, create/update in topics table)
 * - Updates portfolio metadata with new topic IDs
 * - Returns topic IDs for interest tracking
 */
export async function processPortfolioDescriptionTopics(
  portfolioId: string,
  description: string | null | undefined,
  userId: string
): Promise<string[]> {
  const supabase = createServiceClient()

  // Get current portfolio to access existing topics
  const { data: portfolio, error: portfolioError } = await supabase
    .from('portfolios')
    .select('metadata')
    .eq('id', portfolioId)
    .single()

  if (portfolioError || !portfolio) {
    throw new Error(`Portfolio not found: ${portfolioError?.message}`)
  }

  const metadata = (portfolio.metadata as any) || {}
  const oldTopicIds: string[] = metadata.description_topics || []

  // If description is empty, remove all old topics and return empty array
  if (!description || description.trim().length === 0) {
    // Decrement mention_count for old topics
    if (oldTopicIds.length > 0) {
      await supabase.rpc('decrement_topic_mention_counts', {
        topic_ids: oldTopicIds,
      })
    }

    // Update portfolio metadata to remove description_topics
    await supabase
      .from('portfolios')
      .update({
        metadata: {
          ...metadata,
          description_topics: [],
        },
      })
      .eq('id', portfolioId)

    return []
  }

  // Extract topics from description
  const extractedTopics = await extractTopicsFromDescription(description)

  if (extractedTopics.length === 0) {
    // No topics extracted, but still need to clean up old topics
    if (oldTopicIds.length > 0) {
      await supabase.rpc('decrement_topic_mention_counts', {
        topic_ids: oldTopicIds,
      })
    }

    // Update portfolio metadata
    await supabase
      .from('portfolios')
      .update({
        metadata: {
          ...metadata,
          description_topics: [],
        },
      })
      .eq('id', portfolioId)

    return []
  }

  // Process new topics (using a placeholder note ID since createOrUpdateTopic requires it)
  // We'll use a special UUID that represents portfolio descriptions
  // Note: This is a workaround since the current system expects note IDs
  const placeholderNoteId = '00000000-0000-0000-0000-000000000000'
  const newTopicIds: string[] = []

  for (const topic of extractedTopics) {
    try {
      // createOrUpdateTopic handles similarity matching at 80% threshold
      const topicId = await createOrUpdateTopic(
        topic.name,
        topic.description,
        placeholderNoteId
      )
      newTopicIds.push(topicId)
    } catch (error) {
      console.error(`Failed to process topic ${topic.name}:`, error)
      // Continue with other topics
    }
  }

  // Find topics that were removed (in old but not in new)
  const removedTopicIds = oldTopicIds.filter((id) => !newTopicIds.includes(id))

  // Decrement mention_count for removed topics
  if (removedTopicIds.length > 0) {
    await supabase.rpc('decrement_topic_mention_counts', {
      topic_ids: removedTopicIds,
    })
  }

  // Update portfolio metadata with new topic IDs
  await supabase
    .from('portfolios')
    .update({
      metadata: {
        ...metadata,
        description_topics: newTopicIds,
      },
    })
    .eq('id', portfolioId)

  return newTopicIds
}

