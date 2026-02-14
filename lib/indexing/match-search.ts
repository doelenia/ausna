import { openai } from '@/lib/openai/client'
import { createServiceClient } from '@/lib/supabase/service'
import { generateEmbedding } from './vectors'

function normalizeVector(vector: unknown): number[] | null {
  if (!vector) return null
  if (Array.isArray(vector)) {
    const nums = vector.map((v) => (typeof v === 'number' ? v : Number(v))).filter((n) => Number.isFinite(n))
    return nums.length > 0 ? nums : null
  }
  if (typeof vector === 'string') {
    // Postgres vector often comes back as "[0.1,0.2,...]"
    const trimmed = vector.trim()
    const jsonish = trimmed.startsWith('[') ? trimmed : `[${trimmed}]`
    try {
      const parsed = JSON.parse(jsonish) as unknown
      return normalizeVector(parsed)
    } catch {
      return null
    }
  }
  return null
}

/**
 * Generate asks from a search keyword using AI
 */
export async function generateAsksFromKeyword(keyword: string): Promise<string[]> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at understanding search intent. Generate 3-5 single-sentence asks that represent what someone searching for a keyword might be looking for.

Each ask should be a complete sentence describing what is being sought (resources, people, help, services, tools, information, or opportunities).

Return a JSON object with a field "asks" containing an array of ask strings.`,
        },
        {
          role: 'user',
          content: `Generate asks for someone searching for: "${keyword}"`,
        },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 500,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from AI')
    }

    const result = JSON.parse(content) as { asks?: string[] }

    if (Array.isArray(result.asks)) {
      return result.asks.filter((ask) => ask && ask.trim().length > 0)
    }

    return []
  } catch (error) {
    console.error('Failed to generate asks from keyword:', error)
    throw error
  }
}

/**
 * Get all asks from a user's atomic knowledge
 */
export async function getUserAsks(userId: string): Promise<string[]> {
  const supabase = createServiceClient()

  // First, get the user's human portfolio ID
  const { data: humanPortfolio, error: portfolioError } = await supabase
    .from('portfolios')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'human')
    .maybeSingle()

  if (portfolioError || !humanPortfolio) {
    return []
  }

  // Get all asks from this user's portfolio
  // assigned_human is an array, so we check if it contains the portfolio ID
  // Supabase .contains() checks if the array column contains all values in the provided array
  const { data: asks, error: asksError } = await supabase
    .from('atomic_knowledge')
    .select('knowledge_text')
    .eq('is_asks', true)
    .contains('assigned_human', [humanPortfolio.id])

  if (asksError) {
    console.error('Error fetching user asks:', asksError)
    return []
  }

  return (asks || []).map((ask) => ask.knowledge_text)
}

/**
 * Get all non-asks from a user's atomic knowledge
 */
export async function getUserNonAsks(userId: string): Promise<string[]> {
  const supabase = createServiceClient()

  // First, get the user's human portfolio ID
  const { data: humanPortfolio, error: portfolioError } = await supabase
    .from('portfolios')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'human')
    .maybeSingle()

  if (portfolioError || !humanPortfolio) {
    return []
  }

  // Get all non-asks from this user's portfolio
  const { data: nonAsks, error: nonAsksError } = await supabase
    .from('atomic_knowledge')
    .select('knowledge_text')
    .eq('is_asks', false)
    .contains('assigned_human', [humanPortfolio.id])

  if (nonAsksError) {
    console.error('Error fetching user non-asks:', nonAsksError)
    return []
  }

  return (nonAsks || []).map((nonAsk) => nonAsk.knowledge_text)
}

/**
 * Get all asks with stored vectors from a user's atomic knowledge
 */
export async function getUserAskVectors(
  userId: string
): Promise<Array<{ id: string; text: string; embedding: number[]; topicIds: string[] }>> {
  const supabase = createServiceClient()

  const { data: humanPortfolio, error: portfolioError } = await supabase
    .from('portfolios')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'human')
    .maybeSingle()

  if (portfolioError || !humanPortfolio) return []

  const { data: asks, error: asksError } = await supabase
    .from('atomic_knowledge')
    .select('id, knowledge_text, knowledge_vector, topics')
    .eq('is_asks', true)
    .contains('assigned_human', [humanPortfolio.id])
    .not('knowledge_vector', 'is', null)

  if (asksError) {
    console.error('Error fetching user ask vectors:', asksError)
    return []
  }

  const result = (asks || [])
    .map((ask: any) => ({
      id: ask.id as string,
      text: ask.knowledge_text as string,
      embedding: normalizeVector(ask.knowledge_vector),
      topicIds: Array.isArray(ask.topics) ? (ask.topics as string[]) : [],
    }))
    .filter(
      (x): x is { id: string; text: string; embedding: number[]; topicIds: string[] } =>
        Boolean(x.id) && Boolean(x.text) && Array.isArray(x.embedding)
    )

  return result
}

/**
 * Get all non-asks with stored vectors from a user's atomic knowledge
 */
export async function getUserNonAskVectors(
  userId: string
): Promise<Array<{ id: string; text: string; embedding: number[]; topicIds: string[] }>> {
  const supabase = createServiceClient()

  const { data: humanPortfolio, error: portfolioError } = await supabase
    .from('portfolios')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'human')
    .maybeSingle()

  if (portfolioError || !humanPortfolio) return []

  const { data: nonAsks, error: nonAsksError } = await supabase
    .from('atomic_knowledge')
    .select('id, knowledge_text, knowledge_vector, topics')
    .eq('is_asks', false)
    .contains('assigned_human', [humanPortfolio.id])
    .not('knowledge_vector', 'is', null)

  if (nonAsksError) {
    console.error('Error fetching user non-ask vectors:', nonAsksError)
    return []
  }

  return (nonAsks || [])
    .map((nonAsk: any) => ({
      id: nonAsk.id as string,
      text: nonAsk.knowledge_text as string,
      embedding: normalizeVector(nonAsk.knowledge_vector),
      topicIds: Array.isArray(nonAsk.topics) ? (nonAsk.topics as string[]) : [],
    }))
    .filter(
      (x): x is { id: string; text: string; embedding: number[]; topicIds: string[] } =>
        Boolean(x.id) && Boolean(x.text) && Array.isArray(x.embedding)
    )
}

type TopicSimilarity = { id: string; similarity: number; sourceSearcherTopicId?: string }

async function getExpandedTopicsWithSimilarity(
  assignedTopicIds: string[]
): Promise<TopicSimilarity[]> {
  if (!assignedTopicIds || assignedTopicIds.length === 0) return []

  const supabase = createServiceClient()

  // Load assigned topics with their stored vectors
  const { data: topics, error } = await supabase
    .from('topics')
    .select('id, description_vector')
    .in('id', assignedTopicIds)
    .not('description_vector', 'is', null)

  if (error) {
    console.error('Error fetching assigned topics for expansion:', error)
    return assignedTopicIds.map((id) => ({ id, similarity: 1, sourceSearcherTopicId: id }))
  }

  const vectors = (topics || [])
    .map((t: any) => ({
      id: t.id as string,
      embedding: normalizeVector(t.description_vector),
    }))
    .filter((t): t is { id: string; embedding: number[] } => Boolean(t.id) && Array.isArray(t.embedding))

  // Map: topicId -> { similarity, sourceSearcherTopicId }
  // For each topic, we track the highest similarity and which searcher topic it came from
  const similarityMap = new Map<string, { similarity: number; sourceSearcherTopicId: string }>()

  // Originals always have similarity 1 and come from themselves
  assignedTopicIds.forEach((id) => {
    similarityMap.set(id, { similarity: 1, sourceSearcherTopicId: id })
  })

  // Call match_topics in parallel for each assigned topic and record similarities
  await Promise.all(
    vectors.map(async (t) => {
      const searcherTopicId = t.id
      const { data: similar, error: matchError } = await supabase.rpc('match_topics', {
        query_embedding: t.embedding,
        match_threshold: 0.2, // 80% similarity threshold (1 - 0.2 = 0.8)
        // Take only the top 3 similar topics per original topic
        match_count: 3,
      })

      if (matchError) {
        console.error('Error matching similar topics:', matchError)
        return
      }

      ;(similar || []).forEach((s: any) => {
        const id = s.id as string
        const sim = typeof s.similarity === 'number' ? s.similarity : 0
        const existing = similarityMap.get(id)
        // Keep the highest similarity, and track which searcher topic it came from
        if (!existing || sim > existing.similarity) {
          similarityMap.set(id, { similarity: sim, sourceSearcherTopicId: searcherTopicId })
        }
      })
    })
  )

  return Array.from(similarityMap.entries()).map(([id, data]) => ({ 
    id, 
    similarity: data.similarity,
    sourceSearcherTopicId: data.sourceSearcherTopicId
  }))
}

/**
 * Get user's human portfolio ID
 */
export async function getUserHumanPortfolioId(userId: string): Promise<string | null> {
  const supabase = createServiceClient()

  const { data: humanPortfolio, error } = await supabase
    .from('portfolios')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'human')
    .maybeSingle()

  if (error || !humanPortfolio) {
    return null
  }

  return humanPortfolio.id
}

/**
 * Search for matching atomic knowledge for a single ask
 * Returns array of matches with user IDs, max similarity, and matched knowledge text per user for this ask
 */
export async function searchMatchesForAsk(
  askText: string,
  excludePortfolioIds: string[],
  askEmbedding?: number[],
  _filterTopicIds?: string[]
): Promise<
  Array<{
    userId: string
    portfolioId: string
    similarity: number
    matchedKnowledgeText: string
    matchedKnowledgeId: string
  }>
> {
  const supabase = createServiceClient()

  // Generate embedding for the ask
  const embedding = askEmbedding || (await generateEmbedding(askText))

  // Search for matching non-ask atomic knowledge
  const { data: matches, error } = await supabase.rpc('match_atomic_knowledge', {
    query_embedding: embedding,
    exclude_human_portfolio_ids: excludePortfolioIds.length > 0 ? excludePortfolioIds : null,
    is_asks_filter: false, // We want non-asks
    match_count: 100, // Get top 100 matches per ask
    filter_topic_ids: null, // no topic filtering at the knowledge level
  })

  if (error) {
    console.error('Error searching matches for ask:', error)
    return []
  }

  // Group matches by user (via assigned_human portfolio IDs)
  // We need to map portfolio IDs to user IDs
  const portfolioToUserMap = new Map<string, string>()
  const portfolioIds = new Set<string>()

  // Collect all unique portfolio IDs from matches
  matches?.forEach((match: any) => {
    if (match.assigned_human && Array.isArray(match.assigned_human)) {
      match.assigned_human.forEach((portfolioId: string) => {
        portfolioIds.add(portfolioId)
      })
    }
  })

  // Fetch user IDs for all portfolios
  if (portfolioIds.size > 0) {
    const { data: portfolios, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, user_id')
      .in('id', Array.from(portfolioIds))
      .eq('type', 'human')

    if (!portfolioError && portfolios) {
      portfolios.forEach((portfolio) => {
        portfolioToUserMap.set(portfolio.id, portfolio.user_id)
      })
    }
  }

  // Build result array with user IDs and max similarity per user for this ask
  // Group by user and take the maximum similarity (not accumulate)
  const userMaxScores = new Map<
    string,
    {
      userId: string
      portfolioId: string
      similarity: number
      matchedKnowledgeText: string
      matchedKnowledgeId: string
    }
  >()

  matches?.forEach((match: any) => {
    if (match.assigned_human && Array.isArray(match.assigned_human)) {
      match.assigned_human.forEach((portfolioId: string) => {
        const userId = portfolioToUserMap.get(portfolioId)
        if (userId) {
          const key = `${userId}:${portfolioId}`
          const existing = userMaxScores.get(key)
          if (existing) {
            // Take the maximum similarity for this user, update matched text if higher
            if (match.similarity > existing.similarity) {
              existing.similarity = match.similarity
              existing.matchedKnowledgeText = match.knowledge_text
              existing.matchedKnowledgeId = match.id
            }
          } else {
            userMaxScores.set(key, {
              userId,
              portfolioId,
              similarity: match.similarity,
              matchedKnowledgeText: match.knowledge_text,
              matchedKnowledgeId: match.id,
            })
          }
        }
      })
    }
  })

  return Array.from(userMaxScores.values())
}

/**
 * Search for matching asks for a single non-ask (backward match)
 * Returns array of matches with user IDs, max similarity, and matched ask text per user for this non-ask
 */
export async function searchMatchesForNonAsk(
  nonAskText: string,
  excludePortfolioIds: string[],
  nonAskEmbedding?: number[],
  _filterTopicIds?: string[]
): Promise<
  Array<{
    userId: string
    portfolioId: string
    similarity: number
    matchedAskText: string
    matchedKnowledgeId: string
  }>
> {
  const supabase = createServiceClient()

  // Generate embedding for the non-ask
  const embedding = nonAskEmbedding || (await generateEmbedding(nonAskText))

  // Search for matching ask atomic knowledge
  const { data: matches, error } = await supabase.rpc('match_atomic_knowledge', {
    query_embedding: embedding,
    exclude_human_portfolio_ids: excludePortfolioIds.length > 0 ? excludePortfolioIds : null,
    is_asks_filter: true, // We want asks
    match_count: 100, // Get top 100 matches per non-ask
    filter_topic_ids: null, // no topic filtering at the knowledge level
  })

  if (error) {
    console.error('Error searching matches for non-ask:', error)
    return []
  }

  // Group matches by user (via assigned_human portfolio IDs)
  const portfolioToUserMap = new Map<string, string>()
  const portfolioIds = new Set<string>()

  // Collect all unique portfolio IDs from matches
  matches?.forEach((match: any) => {
    if (match.assigned_human && Array.isArray(match.assigned_human)) {
      match.assigned_human.forEach((portfolioId: string) => {
        portfolioIds.add(portfolioId)
      })
    }
  })

  // Fetch user IDs for all portfolios
  if (portfolioIds.size > 0) {
    const { data: portfolios, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, user_id')
      .in('id', Array.from(portfolioIds))
      .eq('type', 'human')

    if (!portfolioError && portfolios) {
      portfolios.forEach((portfolio) => {
        portfolioToUserMap.set(portfolio.id, portfolio.user_id)
      })
    }
  }

  // Build result array with user IDs and max similarity per user for this non-ask
  const userMaxScores = new Map<
    string,
    {
      userId: string
      portfolioId: string
      similarity: number
      matchedAskText: string
      matchedKnowledgeId: string
    }
  >()

  matches?.forEach((match: any) => {
    if (match.assigned_human && Array.isArray(match.assigned_human)) {
      match.assigned_human.forEach((portfolioId: string) => {
        const userId = portfolioToUserMap.get(portfolioId)
        if (userId) {
          const key = `${userId}:${portfolioId}`
          const existing = userMaxScores.get(key)
          if (existing) {
            // Take the maximum similarity for this user, update matched text if higher
            if (match.similarity > existing.similarity) {
              existing.similarity = match.similarity
              existing.matchedAskText = match.knowledge_text
              existing.matchedKnowledgeId = match.id
            }
          } else {
            userMaxScores.set(key, {
              userId,
              portfolioId,
              similarity: match.similarity,
              matchedAskText: match.knowledge_text,
              matchedKnowledgeId: match.id,
            })
          }
        }
      })
    }
  })

  return Array.from(userMaxScores.values())
}

/**
 * Calculate match scores for a user based on their asks (forward match)
 * Returns map of userId -> final score (80% max + 20% average) and detailed match info
 */
export async function calculateMatchScores(
  asks: Array<{ id: string; text: string; embedding?: number[]; topicIds?: string[] }>,
  searcherPortfolioId: string
): Promise<{
  scores: Map<string, number>
  details: Map<
    string,
    Array<{
      searchingAsk: string
      maxSimilarity: number
      matchedKnowledgeText: string
    }>
  >
}> {
  // Track max similarity and all similarities per user across all asks
  const userStats = new Map<
    string,
    {
      maxSimilarity: number
      allSimilarities: number[]
    }
  >()

  // Track detailed matches per user
  const userDetails = new Map<
    string,
    Array<{
      searchingAsk: string
      searchingAskId?: string // Atomic knowledge ID for the searching ask
      maxSimilarity: number
      matchedKnowledgeText: string
      matchedKnowledgeId: string // Atomic knowledge ID for the matched knowledge
    }>
  >()

  // For each ask, search for matches and track max per user
  for (const ask of asks) {
    const matches = await searchMatchesForAsk(
      ask.text,
      [searcherPortfolioId],
      ask.embedding
    )

    // For each user, track their max similarity for this ask
    matches.forEach((match) => {
      const existing = userStats.get(match.userId)
      if (existing) {
        // Update max if this ask has a higher similarity
        existing.maxSimilarity = Math.max(existing.maxSimilarity, match.similarity)
        // Add this ask's similarity to the list
        existing.allSimilarities.push(match.similarity)
      } else {
        // First match for this user
        userStats.set(match.userId, {
          maxSimilarity: match.similarity,
          allSimilarities: [match.similarity],
        })
      }

      // Track detailed match info
      const userDetail = userDetails.get(match.userId) || []
      const existingDetail = userDetail.find((d) => d.searchingAsk === ask.text)
      if (existingDetail) {
        // Update if this match has higher similarity
        if (match.similarity > existingDetail.maxSimilarity) {
          existingDetail.maxSimilarity = match.similarity
          existingDetail.matchedKnowledgeText = match.matchedKnowledgeText
          existingDetail.matchedKnowledgeId = match.matchedKnowledgeId
        }
      } else {
        userDetail.push({
          searchingAsk: ask.text,
          searchingAskId: ask.id || '', // Atomic knowledge ID for the searching ask (empty string if AI-suggested)
          maxSimilarity: match.similarity,
          matchedKnowledgeText: match.matchedKnowledgeText,
          matchedKnowledgeId: match.matchedKnowledgeId,
        })
        userDetails.set(match.userId, userDetail)
      }
    })
  }

  // Calculate final score: 80% max + 20% average
  const finalScores = new Map<string, number>()
  userStats.forEach((stats, userId) => {
    const averageSimilarity =
      stats.allSimilarities.reduce((sum, sim) => sum + sim, 0) / stats.allSimilarities.length
    const finalScore = 0.8 * stats.maxSimilarity + 0.2 * averageSimilarity
    finalScores.set(userId, finalScore)
  })

  return { scores: finalScores, details: userDetails }
}

/**
 * Calculate backward match scores (non-asks -> asks)
 * Returns map of userId -> final score (80% max + 20% average) and detailed match info
 */
export async function calculateBackwardMatchScores(
  nonAsks: Array<{ id: string; text: string; embedding?: number[]; topicIds?: string[] }>,
  searcherPortfolioId: string
): Promise<{
  scores: Map<string, number>
  details: Map<
    string,
    Array<{
      searchingNonAsk: string
      searchingNonAskId: string // Atomic knowledge ID for the searching non-ask
      maxSimilarity: number
      matchedAskText: string
      matchedKnowledgeId: string // Atomic knowledge ID for the matched ask
    }>
  >
}> {
  // Track max similarity and all similarities per user across all non-asks
  const userStats = new Map<
    string,
    {
      maxSimilarity: number
      allSimilarities: number[]
    }
  >()

  // Track detailed matches per user
  const userDetails = new Map<
    string,
    Array<{
      searchingNonAsk: string
      searchingNonAskId: string // Atomic knowledge ID for the searching non-ask
      maxSimilarity: number
      matchedAskText: string
      matchedKnowledgeId: string // Atomic knowledge ID for the matched ask
    }>
  >()

  // For each non-ask, search for matching asks and track max per user
  for (const nonAsk of nonAsks) {
    const matches = await searchMatchesForNonAsk(
      nonAsk.text,
      [searcherPortfolioId],
      nonAsk.embedding
    )

    // For each user, track their max similarity for this non-ask
    matches.forEach((match) => {
      const existing = userStats.get(match.userId)
      if (existing) {
        // Update max if this non-ask has a higher similarity
        existing.maxSimilarity = Math.max(existing.maxSimilarity, match.similarity)
        // Add this non-ask's similarity to the list
        existing.allSimilarities.push(match.similarity)
      } else {
        // First match for this user
        userStats.set(match.userId, {
          maxSimilarity: match.similarity,
          allSimilarities: [match.similarity],
        })
      }

      // Track detailed match info
      const userDetail = userDetails.get(match.userId) || []
      const existingDetail = userDetail.find((d) => d.searchingNonAsk === nonAsk.text)
      if (existingDetail) {
        // Update if this match has higher similarity
        if (match.similarity > existingDetail.maxSimilarity) {
          existingDetail.maxSimilarity = match.similarity
          existingDetail.matchedAskText = match.matchedAskText
          existingDetail.matchedKnowledgeId = match.matchedKnowledgeId
        }
      } else {
        userDetail.push({
          searchingNonAsk: nonAsk.text,
          searchingNonAskId: nonAsk.id || '', // Atomic knowledge ID for the searching non-ask (empty string if AI-suggested)
          maxSimilarity: match.similarity,
          matchedAskText: match.matchedAskText,
          matchedKnowledgeId: match.matchedKnowledgeId,
        })
        userDetails.set(match.userId, userDetail)
      }
    })
  }

  // Calculate final score: 80% max + 20% average
  const finalScores = new Map<string, number>()
  userStats.forEach((stats, userId) => {
    const averageSimilarity =
      stats.allSimilarities.reduce((sum, sim) => sum + sim, 0) / stats.allSimilarities.length
    const finalScore = 0.8 * stats.maxSimilarity + 0.2 * averageSimilarity
    finalScores.set(userId, finalScore)
  })

  return { scores: finalScores, details: userDetails }
}

/**
 * Perform match search (no keyword) - uses all user's asks (forward) and non-asks (backward)
 * Returns final scores with forward * sqrt(1 + backward) formula
 */
export async function performMatchSearch(userId: string): Promise<{
  scores: Map<string, number>
  forwardDetails: Map<
    string,
    Array<{
      searchingAsk: string
      searchingAskId: string
      maxSimilarity: number
      matchedKnowledgeText: string
      matchedKnowledgeId: string
    }>
  >
  backwardDetails: Map<
    string,
    Array<{
      searchingNonAsk: string
      searchingNonAskId: string
      maxSimilarity: number
      matchedAskText: string
      matchedKnowledgeId: string
    }>
  >
  topicDetails: Map<
    string,
    Array<{
      searcherTopicId: string
      searcherTopicName: string
      targetTopicId: string
      targetTopicName: string
      similarity: number
      multiplier: number
    }>
  >
}> {
  // Use stored vectors to avoid regenerating embeddings
  let asks = await getUserAskVectors(userId)
  let nonAsks = await getUserNonAskVectors(userId)

  // Always ask AI to suggest missing important asks / non-asks
  // based on profile, projects, and existing asks/non-asks.
  try {
    const supabase = createServiceClient()

    // Load human portfolio metadata for the searcher
    const { data: humanPortfolio } = await supabase
      .from('portfolios')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('type', 'human')
      .maybeSingle()

    const profileMetadata = (humanPortfolio?.metadata as any) || {}
    const basic = profileMetadata.basic || {}
    const profileDescription =
      basic.description ||
      basic.summary ||
      basic.bio ||
      ''

    // Load projects the user owns or is involved in
    const { data: allProjects } = await supabase
      .from('portfolios')
      .select('id, metadata, user_id')
      .eq('type', 'projects')

    const relatedProjects =
      allProjects?.filter((p: any) => {
        const meta = (p.metadata as any) || {}
        const managers = meta.managers || []
        const members = meta.members || []
        return (
          p.user_id === userId ||
          (Array.isArray(managers) && managers.includes(userId)) ||
          (Array.isArray(members) && members.includes(userId))
        )
      }) || []

    const projectSummaries = relatedProjects.map((p: any) => {
      const meta = (p.metadata as any) || {}
      const basicMeta = meta.basic || {}
      const name = basicMeta.name || 'Unnamed Project'
      const description =
        basicMeta.description ||
        meta.description ||
        ''
      return `Project: ${name}\nDescription: ${description}`
    })

    const existingAsksText = asks.map((a) => `- ${a.text}`).join('\n')
    const existingNonAsksText = nonAsks.map((n) => `- ${n.text}`).join('\n')

    // Ask AI to suggest *additional* important asks and non-asks
    const { openai } = await import('@/lib/openai/client')

    const prompt = `
You are helping build a professional matching system.

Given:
- A user's profile description
- A list of their projects (name + description)
- Existing asks (what they are already asking for)
- Existing non-asks (what they already offer: skills, resources, experience)

Task:
- Carefully read the profile, projects, and existing asks/non-asks.
- Identify important missing asks (things they *should* be asking for but didn't state).
- Identify important missing non-asks (skills, resources, or offerings that are implied but not yet listed).

Rules:
- Do NOT repeat any existing asks or non-asks.
- Each ask/non-ask should be a clear, single-sentence statement.
- It's OK if there are no obvious missing items; then return empty arrays.

Return ONLY valid JSON:
{
  "asks": string[],      // NEW missing asks only
  "nonAsks": string[]    // NEW missing non-asks only
}

User profile description:
${profileDescription || '(none)'}

User projects:
${projectSummaries.join('\n\n') || '(none)'}

Existing asks:
${existingAsksText || '(none)'}

Existing non-asks:
${existingNonAsksText || '(none)'}
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You suggest additional missing asks and offers (non-asks) for a professional matching system. Respond ONLY with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 600,
    })

    const content = completion.choices[0]?.message?.content
    if (content) {
      try {
        const parsed = JSON.parse(content) as { asks?: string[]; nonAsks?: string[] }

        const generatedAsks =
          (parsed.asks || [])
            .map((t) => (t || '').trim())
            .filter((t) => t.length > 0) || []

        const generatedNonAsks =
          (parsed.nonAsks || [])
            .map((t) => (t || '').trim())
            .filter((t) => t.length > 0) || []

        if (generatedAsks.length > 0) {
          const existingAskTexts = new Set(asks.map((a) => a.text))
          const extras = generatedAsks.filter((text) => !existingAskTexts.has(text))
          asks = asks.concat(
            extras.map((text) => ({
              id: '', // AI-suggested asks don't have atomic knowledge IDs
              text,
              embedding: undefined as any,
              topicIds: [],
            }))
          )
        }

        if (generatedNonAsks.length > 0) {
          const existingNonAskTexts = new Set(nonAsks.map((n) => n.text))
          const extras = generatedNonAsks.filter((text) => !existingNonAskTexts.has(text))
          nonAsks = nonAsks.concat(
            extras.map((text) => ({
              id: '', // AI-suggested non-asks don't have atomic knowledge IDs
              text,
              embedding: undefined as any,
              topicIds: [],
            }))
          )
        }
      } catch (e) {
        console.error('Failed to parse generated asks/non-asks JSON:', e)
      }
    }
  } catch (e) {
    console.error('Failed to augment asks/non-asks from AI:', e)
  }

  const searcherPortfolioId = await getUserHumanPortfolioId(userId)
  if (!searcherPortfolioId) {
    return {
      scores: new Map(),
      forwardDetails: new Map(),
      backwardDetails: new Map(),
      topicDetails: new Map(),
    }
  }

  // Forward match: asks -> non-asks
  const forwardResult = asks.length > 0 ? await calculateMatchScores(asks, searcherPortfolioId) : {
    scores: new Map<string, number>(),
    details: new Map(),
  }

  // Backward match: non-asks -> asks
  const backwardResult = nonAsks.length > 0
    ? await calculateBackwardMatchScores(nonAsks, searcherPortfolioId)
    : {
        scores: new Map<string, number>(),
        details: new Map(),
      }

  // Combine: forward_score * sqrt(1 + backward_score)
  const baseScores = new Map<string, number>()
  const allUserIds = new Set([...forwardResult.scores.keys(), ...backwardResult.scores.keys()])

  allUserIds.forEach((uid) => {
    const forwardScore = forwardResult.scores.get(uid) || 0
    const backwardScore = backwardResult.scores.get(uid) || 0
    const combined = forwardScore * Math.sqrt(1 + backwardScore)
    baseScores.set(uid, combined)
  })

  // Interest-based multiplier:
  // 1) Collect all unique topic IDs from searcher's asks and non-asks
  const assignedTopicIdsSet = new Set<string>()
  asks.forEach((ask) => ask.topicIds.forEach((id) => id && assignedTopicIdsSet.add(id)))
  nonAsks.forEach((nonAsk) => nonAsk.topicIds.forEach((id) => id && assignedTopicIdsSet.add(id)))

  console.log('[Topic Match] Searcher topic IDs:', Array.from(assignedTopicIdsSet))
  console.log('[Topic Match] Candidate user IDs:', Array.from(allUserIds))

  let finalScores = baseScores
  const topicDetails = new Map<
    string,
    Array<{
      searcherTopicId: string
      searcherTopicName: string
      targetTopicId: string
      targetTopicName: string
      similarity: number
      multiplier: number
    }>
  >()

  if (assignedTopicIdsSet.size > 0 && allUserIds.size > 0) {
    const supabase = createServiceClient()

    // Fetch searcher's topic names
    const { data: searcherTopics, error: searcherTopicsError } = await supabase
      .from('topics')
      .select('id, name')
      .in('id', Array.from(assignedTopicIdsSet))

    const searcherTopicNameMap = new Map<string, string>()
    if (!searcherTopicsError && searcherTopics) {
      searcherTopics.forEach((t: any) => {
        searcherTopicNameMap.set(t.id, t.name || 'Unknown Topic')
      })
      console.log('[Topic Match] Searcher topics:', Array.from(searcherTopicNameMap.entries()).map(([id, name]) => ({ id, name })))
    }

    const expandedTopics = await getExpandedTopicsWithSimilarity(Array.from(assignedTopicIdsSet))
    console.log('[Topic Match] Expanded topics count:', expandedTopics.length)
    console.log('[Topic Match] Expanded topics:', expandedTopics.map(t => ({ id: t.id, similarity: t.similarity, sourceSearcherTopicId: t.sourceSearcherTopicId })))
    
    // Map: topicId -> { similarity, sourceSearcherTopicId }
    // This tracks the best similarity for each topic and which searcher topic it came from
    const topicSimilarityMap = new Map<string, { similarity: number; sourceSearcherTopicId: string }>()
    const searcherTopicToExpandedMap = new Map<string, Map<string, number>>() // Map searcher topic -> (expanded topic -> similarity)

    // Build mapping from searcher topics to expanded topics with their similarities
    assignedTopicIdsSet.forEach((searcherTopicId) => {
      searcherTopicToExpandedMap.set(searcherTopicId, new Map([[searcherTopicId, 1]]))
    })

    expandedTopics.forEach((t) => {
      const existing = topicSimilarityMap.get(t.id)
      // Keep the highest similarity
      if (!existing || t.similarity > existing.similarity) {
        topicSimilarityMap.set(t.id, { 
          similarity: t.similarity, 
          sourceSearcherTopicId: t.sourceSearcherTopicId || t.id 
        })
      }

      // Track which searcher topic this expanded topic came from
      const sourceSearcherTopicId = t.sourceSearcherTopicId || t.id
      if (assignedTopicIdsSet.has(sourceSearcherTopicId)) {
        const expandedMap = searcherTopicToExpandedMap.get(sourceSearcherTopicId)
        if (expandedMap) {
          expandedMap.set(t.id, t.similarity)
        }
      }
    })

    if (topicSimilarityMap.size > 0) {
      // Fetch user interests for all candidate users and relevant topics
      const { data: interests, error } = await supabase
        .from('user_interests')
        .select('user_id, topic_id')
        .in('user_id', Array.from(allUserIds))
        .in('topic_id', Array.from(topicSimilarityMap.keys()))

      console.log('[Topic Match] User interests found:', interests?.length || 0)
      if (interests && interests.length > 0) {
        console.log('[Topic Match] User interests:', interests.map((r: any) => ({ userId: r.user_id, topicId: r.topic_id })))
      }

      // Fetch target user topic names
      const targetTopicIds = new Set<string>()
      interests?.forEach((row: any) => {
        targetTopicIds.add(row.topic_id)
      })

      const { data: targetTopics, error: targetTopicsError } = await supabase
        .from('topics')
        .select('id, name')
        .in('id', Array.from(targetTopicIds))

      const targetTopicNameMap = new Map<string, string>()
      if (!targetTopicsError && targetTopics) {
        targetTopics.forEach((t: any) => {
          targetTopicNameMap.set(t.id, t.name || 'Unknown Topic')
        })
        console.log('[Topic Match] Target user topics:', Array.from(targetTopicNameMap.entries()).map(([id, name]) => ({ id, name })))
      }

      if (!error && interests) {
        const interestSums = new Map<string, number>()
        const userTopicMatches = new Map<
          string,
          Map<
            string,
            {
              searcherTopicId: string
              targetTopicId: string
              similarity: number
            }
          >
        >()

        interests.forEach((row: any) => {
          const uid = row.user_id as string
          const targetTopicId = row.topic_id as string
          const topicData = topicSimilarityMap.get(targetTopicId)
          if (topicData && topicData.similarity > 0) {
            const sim = topicData.similarity
            const prev = interestSums.get(uid) ?? 0
            interestSums.set(uid, prev + sim)

            // Track which searcher topics match this target topic
            if (!userTopicMatches.has(uid)) {
              userTopicMatches.set(uid, new Map())
            }
            const userMatches = userTopicMatches.get(uid)!

            // Find which searcher topic(s) this target topic matches
            // Use the expanded map to find which searcher topics have this target topic
            assignedTopicIdsSet.forEach((searcherTopicId) => {
              const expandedMap = searcherTopicToExpandedMap.get(searcherTopicId)
              const topicSimilarity = expandedMap?.get(targetTopicId)
              if (topicSimilarity !== undefined && topicSimilarity > 0) {
                const key = `${searcherTopicId}:${targetTopicId}`
                const existing = userMatches.get(key)
                // Use the similarity from the expanded map, which is specific to this searcher topic
                if (!existing || topicSimilarity > existing.similarity) {
                  userMatches.set(key, {
                    searcherTopicId,
                    targetTopicId,
                    similarity: topicSimilarity,
                  })
                }
              }
            })
          }
        })

        // Build topic details for each user
        userTopicMatches.forEach((matches, uid) => {
          const userTopicDetails: Array<{
            searcherTopicId: string
            searcherTopicName: string
            targetTopicId: string
            targetTopicName: string
            similarity: number
            multiplier: number
          }> = []

          matches.forEach((match) => {
            const searcherTopicName = searcherTopicNameMap.get(match.searcherTopicId) || 'Unknown Topic'
            const targetTopicName = targetTopicNameMap.get(match.targetTopicId) || 'Unknown Topic'
            const sumSim = interestSums.get(uid) ?? 0
            const multiplier = Math.sqrt(sumSim + 1)

            userTopicDetails.push({
              searcherTopicId: match.searcherTopicId,
              searcherTopicName,
              targetTopicId: match.targetTopicId,
              targetTopicName,
              similarity: match.similarity,
              multiplier,
            })
          })

          // Sort by similarity descending
          userTopicDetails.sort((a, b) => b.similarity - a.similarity)
          topicDetails.set(uid, userTopicDetails)
          
          console.log(`[Topic Match] User ${uid} topic matches (${userTopicDetails.length}):`, 
            userTopicDetails.map(d => ({
              searcherTopic: d.searcherTopicName,
              targetTopic: d.targetTopicName,
              similarity: d.similarity.toFixed(4),
              multiplier: d.multiplier.toFixed(4)
            }))
          )
        })

        // Apply multiplier: sqrt(sum(similarity) + 1)
        finalScores = new Map<string, number>()
        allUserIds.forEach((uid) => {
          const base = baseScores.get(uid) || 0
          const sumSim = interestSums.get(uid) ?? 0
          const multiplier = Math.sqrt(sumSim + 1)
          finalScores.set(uid, base * multiplier)
        })
      }
    }
  }

  console.log('[Topic Match] Final topic details summary:', {
    totalUsers: topicDetails.size,
    usersWithMatches: Array.from(topicDetails.entries()).map(([uid, details]) => ({
      userId: uid,
      matchCount: details.length
    }))
  })

  return {
    scores: finalScores,
    forwardDetails: forwardResult.details,
    backwardDetails: backwardResult.details,
    topicDetails,
  }
}

/**
 * Perform specific search (with keyword) - generates asks from keyword
 * Returns scores and detailed match info
 */
export async function performSpecificSearch(
  userId: string,
  keyword: string
): Promise<{
  scores: Map<string, number>
  details: Map<
    string,
    Array<{
      searchingAsk: string
      maxSimilarity: number
      matchedKnowledgeText: string
    }>
  >
}> {
  const asks = await generateAsksFromKeyword(keyword)
  if (asks.length === 0) {
    return {
      scores: new Map(),
      details: new Map(),
    }
  }

  const searcherPortfolioId = await getUserHumanPortfolioId(userId)
  if (!searcherPortfolioId) {
    return {
      scores: new Map(),
      details: new Map(),
    }
  }

  // Keyword-generated asks don't exist in atomic_knowledge yet, so we must generate embeddings
  const askItems = asks.map((text) => ({ id: '', text })) // Empty ID for keyword-generated asks
  return await calculateMatchScores(askItems, searcherPortfolioId)
}

/**
 * Combine match search and specific search scores
 * Returns final scores: 80% specific + 20% match
 */
export function combineSearchScores(
  specificScores: Map<string, number>,
  matchScores: Map<string, number>
): Map<string, number> {
  const combined = new Map<string, number>()

  // Get all user IDs from both maps
  const allUserIds = new Set([...specificScores.keys(), ...matchScores.keys()])

  allUserIds.forEach((userId) => {
    const specificScore = specificScores.get(userId) || 0
    const matchScore = matchScores.get(userId) || 0
    const combinedScore = 0.8 * specificScore + 0.2 * matchScore
    combined.set(userId, combinedScore)
  })

  return combined
}

