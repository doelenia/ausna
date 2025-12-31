import { createServiceClient } from '@/lib/supabase/service'
import { processPortfolioDescriptionTopics } from './portfolio-topics'
import { Topic } from '@/types/indexing'

/**
 * Update user interests based on topic IDs and weight
 * - Subtracts 0.1 from memory_score for ALL topics with positive memory_score for this user
 * - For each topicId: adds weight to aggregate_score and memory_score
 */
export async function updateUserInterests(
  userId: string,
  topicIds: string[],
  weight: number
): Promise<void> {
  if (topicIds.length === 0) {
    // Still need to perform memory score decay even if no new topics
    await decayMemoryScores(userId)
    return
  }

  const supabase = createServiceClient()

  // First, decay memory scores for all topics with positive memory_score
  await decayMemoryScores(userId)

  // Then, update or create interests for the new topics
  for (const topicId of topicIds) {
    // Check if interest already exists
    const { data: existingInterest } = await supabase
      .from('user_interests')
      .select('*')
      .eq('user_id', userId)
      .eq('topic_id', topicId)
      .single()

    if (existingInterest) {
      // Update existing interest
      const currentAggregate = parseFloat(existingInterest.aggregate_score) || 0
      const currentMemory = parseFloat(existingInterest.memory_score) || 0
      
      await supabase
        .from('user_interests')
        .update({
          aggregate_score: (currentAggregate + weight).toString(),
          memory_score: (currentMemory + weight).toString(),
        })
        .eq('user_id', userId)
        .eq('topic_id', topicId)
    } else {
      // Create new interest
      await supabase.from('user_interests').insert({
        user_id: userId,
        topic_id: topicId,
        aggregate_score: weight.toString(),
        memory_score: weight.toString(),
      })
    }
  }
}

/**
 * Decay memory scores: subtract 0.1 from ALL topics with positive memory_score
 */
async function decayMemoryScores(userId: string): Promise<void> {
  const supabase = createServiceClient()

  // Update all interests with positive memory_score
  const { error } = await supabase.rpc('decay_user_memory_scores', {
    p_user_id: userId,
    p_decay_amount: '0.1', // Pass as string for numeric type
  })

  if (error) {
    console.error('Failed to decay memory scores:', error)
    // Fallback: manually update if RPC fails
    const { data: interests } = await supabase
      .from('user_interests')
      .select('*')
      .eq('user_id', userId)

    if (interests) {
      for (const interest of interests) {
        const currentMemory = parseFloat(interest.memory_score) || 0
        // Only decay if memory_score is positive
        if (currentMemory > 0) {
          await supabase
            .from('user_interests')
            .update({
              memory_score: (currentMemory - 0.1).toString(),
            })
            .eq('id', interest.id)
        }
      }
    }
  }
}

/**
 * Process portfolio description for interests
 * - Extracts topics from portfolio description
 * - Processes portfolio description topics (updates topic database)
 * - Updates user interests with appropriate weight
 */
export async function processPortfolioDescriptionForInterests(
  portfolioId: string,
  userId: string,
  isPersonalPortfolio: boolean,
  description?: string | null // Optional: pass description directly to avoid reading from DB
): Promise<void> {
  const supabase = createServiceClient()

  // Get portfolio description if not provided
  let finalDescription = description
  if (finalDescription === undefined) {
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('metadata')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      console.error('Portfolio not found for interest tracking:', portfolioError)
      return
    }

    const metadata = (portfolio.metadata as any) || {}
    finalDescription = metadata.basic?.description || ''
  }

  // Process portfolio description topics (this updates the topics table and portfolio metadata)
  let topicIds: string[] = []
  try {
    topicIds = await processPortfolioDescriptionTopics(
      portfolioId,
      finalDescription || null,
      userId
    )
    if (process.env.NODE_ENV === 'development') {
      console.log('Processed portfolio description topics:', {
        portfolioId,
        topicCount: topicIds.length,
        topicIds,
      })
    }
  } catch (error: any) {
    console.error('Failed to process portfolio description topics:', error)
    throw error // Re-throw to be caught by caller
  }

  // Determine weight based on portfolio type
  const weight = isPersonalPortfolio ? 3 : 0.1

  if (process.env.NODE_ENV === 'development') {
    console.log('Updating user interests:', {
      userId,
      topicCount: topicIds.length,
      weight,
      isPersonalPortfolio,
    })
  }

  // Update user interests
  await updateUserInterests(userId, topicIds, weight)
  
  if (process.env.NODE_ENV === 'development') {
    console.log('Successfully updated user interests')
  }
}

/**
 * Get top N interested topics for a user, ordered by memory_score
 * Returns topics with their interest data
 * Can be used with either service client (server-side) or regular client (client-side with RLS)
 */
export async function getTopInterestedTopics(
  userId: string,
  limit: number = 5,
  supabaseClient?: any // Optional: pass a client if calling from client-side
): Promise<Array<{ topic: Topic; memory_score: number; aggregate_score: number }>> {
  const supabase = supabaseClient || createServiceClient()

  // Get top interests ordered by memory_score descending
  const { data: interests, error } = await supabase
    .from('user_interests')
    .select('topic_id, memory_score, aggregate_score')
    .eq('user_id', userId)
    .order('memory_score', { ascending: false })
    .limit(limit)

  if (error || !interests || interests.length === 0) {
    return []
  }

  // Fetch topic details for each interest
  const topicIds = interests.map((i: any) => i.topic_id)
  const { data: topics, error: topicsError } = await supabase
    .from('topics')
    .select('*')
    .in('id', topicIds)

  if (topicsError || !topics) {
    return []
  }

  // Combine interests with topics, maintaining order by memory_score
  const topicMap = new Map(topics.map((t: any) => [t.id, t]))
  const result: Array<{ topic: Topic; memory_score: number; aggregate_score: number }> = []

  for (const interest of interests) {
    const topic = topicMap.get(interest.topic_id)
    if (topic) {
      result.push({
        topic: topic as Topic,
        memory_score: parseFloat(interest.memory_score) || 0,
        aggregate_score: parseFloat(interest.aggregate_score) || 0,
      })
    }
  }

  return result
}
