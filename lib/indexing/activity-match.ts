/**
 * Activity explore match: score activities for a user using trustworthy × alignment.
 * - Trustworthy: boolean signals based on friends/hosts/membership.
 * - Alignment: topic/interest overlap for activity, hosts, and members.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { getTopicIdsForPortfolio } from './interest-tracking'
import {
  getUserAskVectors,
  getUserNonAskVectors,
  getExpandedTopicsWithSimilarity,
} from './match-search'

/** Time decay: weight = 1 / (1 + k * days_old). k=0.1 => ~0.5 at 10 days. Applied to matched (activity-side) atomic knowledge. */
const TIME_DECAY_K = 0.1

function timeDecayWeight(createdAt: string | Date): number {
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  const daysOld = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)
  return 1 / (1 + TIME_DECAY_K * Math.max(0, daysOld))
}

interface ParentTopic {
  id: string
  parentId: string
  similarityFromParent: number
  aggregate: number
  memory: number
  nameVector: number[] | null
}

function normalizeTopicVector(vector: unknown): number[] | null {
  if (!vector) return null
  if (Array.isArray(vector)) {
    const nums = vector
      .map((v) => (typeof v === 'number' ? v : Number(v)))
      .filter((n) => Number.isFinite(n))
    return nums.length > 0 ? nums : null
  }
  if (typeof vector === 'string') {
    const trimmed = vector.trim()
    const jsonish = trimmed.startsWith('[') ? trimmed : `[${trimmed}]`
    try {
      const parsed = JSON.parse(jsonish) as unknown
      return normalizeTopicVector(parsed)
    } catch {
      return null
    }
  }
  return null
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i += 1) {
    const va = a[i]
    const vb = b[i]
    dot += va * vb
    normA += va * va
    normB += vb * vb
  }
  if (normA === 0 || normB === 0) return 0
  return dot / Math.sqrt(normA * normB)
}

function bestParentForTopic(
  topicVector: number[],
  parents: ParentTopic[]
): {
  parent: ParentTopic | null
  similarity: number
} {
  let bestParent: ParentTopic | null = null
  let bestSim = 0
  for (const parent of parents) {
    if (!parent.nameVector) continue
    const sim = cosineSimilarity(topicVector, parent.nameVector)
    if (sim > bestSim) {
      bestSim = sim
      bestParent = parent
    }
  }
  return { parent: bestParent, similarity: bestSim }
}

export interface ActivityMetadata {
  /** Host project portfolio IDs (type = 'projects'). */
  hostProjectIds: string[]
  /** Host community portfolio IDs (type = 'community'). */
  hostCommunityIds: string[]
  /** Member user IDs (including managers, excluding owner). */
  memberIds: string[]
  /** Manager user IDs. */
  managerIds: string[]
  /** Activity owner user ID. */
  ownerId: string
  /** Whether the activity is external. */
  external: boolean
}

export interface RunActivityMatchInput {
  userId: string
  activityIds: string[]
  activityMetadata: Map<string, ActivityMetadata>
  /** Portfolios the user is subscribed to (projects only). */
  subscribedProjectIds: Set<string>
  /** Project portfolios the user has joined or owns. */
  joinedProjectIds: Set<string>
  /** Community portfolios the user has joined or owns. */
  joinedCommunityIds: Set<string>
  friendIds: string[]
}

export interface RankedActivity {
  activityId: string
  score: number
  /** Dev only: match criteria for expandable card. */
  details?: ActivityMatchDetails
}

export interface ActivityMatchDetails {
  /** Trustworthy multiplier and its component booleans. */
  trustworthy: {
    value: number
    friendGoing: boolean
    multipleFriendsGoing: boolean
    friendIsOwnerOrManager: boolean
    hostHasSubscribedProject: boolean
    hostHasJoinedProject: boolean
    hostHasJoinedCommunity: boolean
  }
  /** Alignment score and breakdowns. */
  alignment: {
    value: number
    activityScore: number
    hostScore: number
    memberScore: number
    /** User's full interest topics (global, same for all activities). */
    /** User interest tags relevant to this activity. */
    userInterestTopics: Array<{
      topicId: string
      topicName: string
      aggregate: number
      memory: number
    }>
    /** Expanded topics from user interests (via topic-name similarity). */
    expandedTopics: Array<{
      topicId: string
      topicName: string
      similarity: number
      sourceTopicId: string
      sourceTopicName: string
    }>
    /** Top 3 topic contributions for the activity itself. */
    activityTopTopics: Array<{
      topicId: string
      topicName: string
      similarity: number
      aggregate: number
      memory: number
    }>
    hosts: Array<{
      portfolioId: string
      score: number
      rawAgg: number
      rawMem: number
      topTopics: Array<{
        topicId: string
        topicName: string
        similarity: number
        aggregate: number
        memory: number
      }>
    }>
    members: Array<{
      userId: string
      score: number
      rawAgg: number
      rawMem: number
      topTopics: Array<{
        topicId: string
        topicName: string
        similarity: number
        aggregate: number
        memory: number
      }>
    }>
  }
}

/** Enrich user asks and non-asks with AI-suggested items (same prompt as admin match). */
async function enrichAsksAndNonAsks(userId: string): Promise<{
  asks: Array<{ id: string; text: string; embedding?: number[]; topicIds: string[] }>
  nonAsks: Array<{ id: string; text: string; embedding?: number[]; topicIds: string[] }>
}> {
  let asks = await getUserAskVectors(userId)
  let nonAsks = await getUserNonAskVectors(userId)

  try {
    const supabase = createServiceClient()
    const { data: humanPortfolio } = await supabase
      .from('portfolios')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('type', 'human')
      .maybeSingle()

    const profileMetadata = (humanPortfolio?.metadata as any) || {}
    const basic = profileMetadata.basic || {}
    const profileDescription = basic.description || basic.summary || basic.bio || ''

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
      const description = basicMeta.description || meta.description || ''
      return `Project: ${name}\nDescription: ${description}`
    })

    const existingAsksText = asks.map((a) => `- ${a.text}`).join('\n')
    const existingNonAsksText = nonAsks.map((n) => `- ${n.text}`).join('\n')

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
  "asks": string[],
  "nonAsks": string[]
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
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 600,
    })

    const content = completion.choices[0]?.message?.content
    if (content) {
      try {
        const parsed = JSON.parse(content) as { asks?: string[]; nonAsks?: string[] }
        const generatedAsks = (parsed.asks || []).map((t) => (t || '').trim()).filter((t) => t.length > 0)
        const generatedNonAsks = (parsed.nonAsks || []).map((t) => (t || '').trim()).filter((t) => t.length > 0)

        if (generatedAsks.length > 0) {
          const existingAskTexts = new Set(asks.map((a) => a.text))
          const extras = generatedAsks.filter((text) => !existingAskTexts.has(text))
          asks = asks.concat(
            extras.map((text) => ({
              id: '',
              text,
              embedding: undefined as any,
              topicIds: [] as string[],
            }))
          )
        }
        if (generatedNonAsks.length > 0) {
          const existingNonAskTexts = new Set(nonAsks.map((n) => n.text))
          const extras = generatedNonAsks.filter((text) => !existingNonAskTexts.has(text))
          nonAsks = nonAsks.concat(
            extras.map((text) => ({
              id: '',
              text,
              embedding: undefined as any,
              topicIds: [] as string[],
            }))
          )
        }
      } catch (e) {
        console.error('Failed to parse AI asks/non-asks JSON:', e)
      }
    }
  } catch (e) {
    console.error('Failed to augment asks/non-asks from AI:', e)
  }

  return { asks, nonAsks }
}

/**
 * Run the full activity match pipeline:
 * - Compute trustworthy multiplier from boolean signals.
 * - Compute alignment score from topic/interest overlap.
 * - Final score = trustworthy * alignment.
 */
export async function runActivityMatchPipeline(input: RunActivityMatchInput): Promise<RankedActivity[]> {
  const {
    userId,
    activityIds,
    activityMetadata,
    subscribedProjectIds,
    joinedProjectIds,
    joinedCommunityIds,
    friendIds,
  } = input

  if (activityIds.length === 0) return []

  const { asks, nonAsks } = await enrichAsksAndNonAsks(userId)
  const friendSet = new Set(friendIds)

  // --- New trustworthy multiplier (section 1 of plan) ---
  const trustworthyByActivity = new Map<string, number>()
  const trustworthySignalsByActivity = new Map<
    string,
    {
      friendGoing: boolean
      multipleFriendsGoing: boolean
      friendIsOwnerOrManager: boolean
      hostHasSubscribedProject: boolean
      hostHasJoinedProject: boolean
      hostHasJoinedCommunity: boolean
    }
  >()

  activityIds.forEach((activityId) => {
    const meta = activityMetadata.get(activityId)
    if (!meta) {
      trustworthyByActivity.set(activityId, 1)
      trustworthySignalsByActivity.set(activityId, {
        friendGoing: false,
        multipleFriendsGoing: false,
        friendIsOwnerOrManager: false,
        hostHasSubscribedProject: false,
        hostHasJoinedProject: false,
        hostHasJoinedCommunity: false,
      })
      return
    }

    // Friend going: any explicit activity member (not owner) is a friend.
    const explicitMembers = meta.memberIds
    let memberFriendCount = 0
    let friendGoing = false
    let multipleFriendsGoing = false
    if (explicitMembers.length > 0) {
      memberFriendCount = explicitMembers.filter((id) => friendSet.has(id)).length
      friendGoing = memberFriendCount >= 1
      multipleFriendsGoing = memberFriendCount >= 2
    }

    const friendIsOwnerOrManager =
      !meta.external &&
      (friendSet.has(meta.ownerId) || meta.managerIds.some((id) => friendSet.has(id)))

    const hostHasSubscribedProject = meta.hostProjectIds.some((id) => subscribedProjectIds.has(id))
    const hostHasJoinedProject = meta.hostProjectIds.some((id) => joinedProjectIds.has(id))
    const hostHasJoinedCommunity = meta.hostCommunityIds.some((id) => joinedCommunityIds.has(id))

    const bools = [
      friendGoing,
      multipleFriendsGoing,
      friendIsOwnerOrManager,
      hostHasSubscribedProject,
      hostHasJoinedProject,
      hostHasJoinedCommunity,
    ]
    const nTrue = bools.reduce((acc, b) => acc + (b ? 1 : 0), 0)
    const trustworthy = 1 + 0.1 * nTrue

    trustworthyByActivity.set(activityId, trustworthy)
    trustworthySignalsByActivity.set(activityId, {
      friendGoing,
      multipleFriendsGoing,
      friendIsOwnerOrManager,
      hostHasSubscribedProject,
      hostHasJoinedProject,
      hostHasJoinedCommunity,
    })
  })

  // --- New alignment score (section 2 of plan) ---

  // Collect searcher topic similarities (expanded topics) - we already computed expandedTopics and topicSimilarityMap,
  // but now we need a similarity map with sourceSearcherTopicId for alignment.
  const assignedTopicIdsForAlignment = new Set<string>()
  asks.forEach((a) => a.topicIds.forEach((id) => id && assignedTopicIdsForAlignment.add(id)))
  nonAsks.forEach((n) => n.topicIds.forEach((id) => id && assignedTopicIdsForAlignment.add(id)))

  const alignmentByActivity = new Map<string, number>()
  const alignmentComponentsByActivity = new Map<
    string,
    {
      activityScore: number
      hostScore: number
      memberScore: number
      activityTopTopics: Array<{
        topicId: string
        similarity: number
        aggregate: number
        memory: number
      }>
      hosts: Array<{
        portfolioId: string
        score: number
        rawAgg: number
        rawMem: number
        topTopics: Array<{
          topicId: string
          similarity: number
          aggregate: number
          memory: number
        }>
      }>
      members: Array<{
        userId: string
        score: number
        rawAgg: number
        rawMem: number
        topTopics: Array<{
          topicId: string
          similarity: number
          aggregate: number
          memory: number
        }>
      }>
    }
  >()
  const searcherInterestScores = new Map<string, { aggregate: number; memory: number }>()
  const alignmentTopicIdsForNames = new Set<string>()
  let expandedTopicsForUser: Array<{
    topicId: string
    similarity: number
    sourceSearcherTopicId?: string
  }> = []

  if (assignedTopicIdsForAlignment.size > 0) {
    const supabase = createServiceClient()
    // Load searcher's interests
    const { data: searcherInterests } = await supabase
      .from('user_interests')
      .select('topic_id, aggregate_score, memory_score')
      .eq('user_id', userId)

    ;(searcherInterests || []).forEach(
      (row: { topic_id: string; aggregate_score: string; memory_score: string }) => {
        const agg = parseFloat(row.aggregate_score) || 0
        const mem = parseFloat(row.memory_score) || 0
        searcherInterestScores.set(row.topic_id, { aggregate: agg, memory: mem })
        alignmentTopicIdsForNames.add(row.topic_id)
      }
    )

    // Collect expanded topics (by name-vector similarity) for this user's interests
    const expandedTopics = await getExpandedTopicsWithSimilarity(
      Array.from(assignedTopicIdsForAlignment)
    )

    // Keep raw expanded topics so we can surface them in dev UI later
    expandedTopicsForUser = expandedTopics.map((t) => ({
      topicId: t.id,
      similarity: t.similarity,
      sourceSearcherTopicId: t.sourceSearcherTopicId,
    }))

    // Build parent topic graph: original interests + expanded topics inheriting from their parent interest
    const interestTopicIds = new Set<string>()
    searcherInterestScores.forEach((_, tid) => {
      interestTopicIds.add(tid)
    })

    const expandedTopicIds = new Set<string>()
    expandedTopics.forEach((t) => {
      expandedTopicIds.add(t.id)
    })

    const allParentTopicIds = new Set<string>([...interestTopicIds, ...expandedTopicIds])

    const parentTopics: ParentTopic[] = []
    if (allParentTopicIds.size > 0) {
      const { data: parentTopicRows } = await supabase
        .from('topics')
        .select('id, name_vector')
        .in('id', Array.from(allParentTopicIds))

      const parentVectorMap = new Map<string, number[] | null>()
      ;(parentTopicRows || []).forEach((row: { id: string; name_vector: unknown }) => {
        parentVectorMap.set(row.id, normalizeTopicVector(row.name_vector))
        alignmentTopicIdsForNames.add(row.id)
      })

      // Original interests: similarityFromParent = 1, parentId = self
      interestTopicIds.forEach((tid) => {
        const scores = searcherInterestScores.get(tid)
        if (!scores) return
        parentTopics.push({
          id: tid,
          parentId: tid,
          similarityFromParent: 1,
          aggregate: scores.aggregate,
          memory: scores.memory,
          nameVector: parentVectorMap.get(tid) ?? null,
        })
      })

      // Expanded topics: inherit agg/mem from their parent interest
      expandedTopics.forEach((t) => {
        const parentId = t.sourceSearcherTopicId || t.id
        const parentScores = searcherInterestScores.get(parentId)
        if (!parentScores) return
        parentTopics.push({
          id: t.id,
          parentId,
          similarityFromParent: t.similarity,
          aggregate: parentScores.aggregate,
          memory: parentScores.memory,
          nameVector: parentVectorMap.get(t.id) ?? null,
        })
      })
    }

    // Helper to compute normalized score parts
    // Helper to compute normalized score parts
    const normToHalf = (x: number): number => 0.5 * (1 - Math.exp(-1 * Math.max(0, x)))

    const computeTypeScore = (
      topicIds: string[]
    ): {
      rawAgg: number
      rawMem: number
      score: number
      topTopics: Array<{
        topicId: string
        similarity: number
        aggregate: number
        memory: number
      }>
    } => {
      let rawAgg = 0
      let rawMem = 0
      const perTopic: Array<{
        topicId: string
        similarity: number
        aggregateFromParent: number
        memoryFromParent: number
        totalContribution: number
      }> = []
      topicIds.forEach((tid) => {
        const topicVector = descriptionTopicVectorMap.get(tid)
        let similarity = 0
        let aggregateFromParent = 0
        let memoryFromParent = 0
        let contribAgg = 0
        let contribMem = 0

        if (topicVector && parentTopics.length > 0) {
          const { parent, similarity: sim } = bestParentForTopic(topicVector, parentTopics)
          if (parent && sim > 0.1) {
            similarity = sim
            aggregateFromParent = parent.aggregate
            memoryFromParent = parent.memory
            contribAgg = similarity * aggregateFromParent
            contribMem = similarity * memoryFromParent
            rawAgg += contribAgg
            rawMem += contribMem
          }
        }

        perTopic.push({
          topicId: tid,
          similarity,
          aggregateFromParent,
          memoryFromParent,
          totalContribution: contribAgg + contribMem,
        })
        alignmentTopicIdsForNames.add(tid)
      })
      const aggPart = normToHalf(rawAgg)
      const memPart = normToHalf(rawMem)
      const topTopics = perTopic
        .sort((a, b) => b.totalContribution - a.totalContribution)
        .map((t) => ({
          topicId: t.topicId,
          similarity: t.similarity,
          aggregate: t.aggregateFromParent,
          memory: t.memoryFromParent,
        }))
      return {
        rawAgg,
        rawMem,
        score: aggPart + memPart,
        topTopics,
      }
    }

    // Activity topics
    const activityTopicResults = await Promise.all(
      activityIds.map(async (activityId) => ({
        activityId,
        topicIds: await getTopicIdsForPortfolio(activityId),
      }))
    )
    const activityTopicsById = new Map<string, string[]>()
    activityTopicResults.forEach(({ activityId, topicIds }) => {
      activityTopicsById.set(activityId, topicIds)
    })

    // Host topics
    const allHostPortfolioIds = new Set<string>()
    activityIds.forEach((activityId) => {
      const meta = activityMetadata.get(activityId)
      if (!meta) return
      meta.hostProjectIds.forEach((id) => allHostPortfolioIds.add(id))
      meta.hostCommunityIds.forEach((id) => allHostPortfolioIds.add(id))
    })

    const hostTopicResults = await Promise.all(
      Array.from(allHostPortfolioIds).map(async (pid) => ({
        portfolioId: pid,
        topicIds: await getTopicIdsForPortfolio(pid),
      }))
    )
    const hostTopicsByPortfolioId = new Map<string, string[]>()
    hostTopicResults.forEach(({ portfolioId, topicIds }) => {
      hostTopicsByPortfolioId.set(portfolioId, topicIds)
    })

    // Member topics (from user_interests per member)
    const allMemberIds = new Set<string>()
    activityIds.forEach((activityId) => {
      const meta = activityMetadata.get(activityId)
      if (!meta) return
      ;[...meta.memberIds, ...meta.managerIds].forEach((uid) => {
        if (uid !== meta.ownerId) {
          allMemberIds.add(uid)
        }
      })
    })

    let memberTopicsByUserId = new Map<string, string[]>()
    if (allMemberIds.size > 0) {
      const { data: memberInterests } = await supabase
        .from('user_interests')
        .select('user_id, topic_id')
        .in('user_id', Array.from(allMemberIds))

      memberTopicsByUserId = new Map<string, string[]>()
      ;(memberInterests || []).forEach((row: { user_id: string; topic_id: string }) => {
        const arr = memberTopicsByUserId.get(row.user_id) || []
        arr.push(row.topic_id)
        memberTopicsByUserId.set(row.user_id, arr)
      })
    }

    // Load name vectors for all description topics across activities, hosts, and members
    const allDescriptionTopicIds = new Set<string>()
    activityTopicsById.forEach((topicIds) => {
      topicIds.forEach((tid) => allDescriptionTopicIds.add(tid))
    })
    hostTopicsByPortfolioId.forEach((topicIds) => {
      topicIds.forEach((tid) => allDescriptionTopicIds.add(tid))
    })
    memberTopicsByUserId.forEach((topicIds) => {
      topicIds.forEach((tid) => allDescriptionTopicIds.add(tid))
    })

    const descriptionTopicVectorMap = new Map<string, number[] | null>()
    if (allDescriptionTopicIds.size > 0) {
      const { data: descriptionTopicRows } = await supabase
        .from('topics')
        .select('id, name_vector')
        .in('id', Array.from(allDescriptionTopicIds))

      ;(descriptionTopicRows || []).forEach((row: { id: string; name_vector: unknown }) => {
        descriptionTopicVectorMap.set(row.id, normalizeTopicVector(row.name_vector))
        alignmentTopicIdsForNames.add(row.id)
      })
    }

    // Compute alignment per activity
    activityIds.forEach((activityId) => {
      const activityTopicIds = activityTopicsById.get(activityId) || []
      const activityScoreParts = computeTypeScore(activityTopicIds)

      const meta = activityMetadata.get(activityId)
      const hostDetails: Array<{
        portfolioId: string
        score: number
        rawAgg: number
        rawMem: number
        topTopics: {
          topicId: string
          similarity: number
          aggregate: number
          memory: number
        }[]
      }> = []
      if (meta) {
        const hostPortfolioIds = [...meta.hostProjectIds, ...meta.hostCommunityIds]
        hostPortfolioIds.forEach((pid) => {
          const topicIds = hostTopicsByPortfolioId.get(pid) || []
          const parts = computeTypeScore(topicIds)
          if (parts.rawAgg === 0 && parts.rawMem === 0) return
          hostDetails.push({
            portfolioId: pid,
            score: parts.score,
            rawAgg: parts.rawAgg,
            rawMem: parts.rawMem,
            topTopics: parts.topTopics,
          })
        })
      }
      const hostScore = hostDetails.reduce((max, h) => (h.score > max ? h.score : max), 0)

      const memberDetails: Array<{
        userId: string
        score: number
        rawAgg: number
        rawMem: number
        topTopics: {
          topicId: string
          similarity: number
          aggregate: number
          memory: number
        }[]
      }> = []
      if (meta) {
        const allMembersForActivity = new Set<string>(
          [...meta.memberIds, ...meta.managerIds].filter((uid) => uid !== meta.ownerId)
        )
        allMembersForActivity.forEach((uid) => {
          const topicIds = memberTopicsByUserId.get(uid) || []
          if (topicIds.length === 0) return
          const parts = computeTypeScore(topicIds)
          if (parts.rawAgg === 0 && parts.rawMem === 0) return
          memberDetails.push({
            userId: uid,
            score: parts.score,
            rawAgg: parts.rawAgg,
            rawMem: parts.rawMem,
            topTopics: parts.topTopics,
          })
        })
      }
      const memberScore = memberDetails.reduce((max, m) => (m.score > max ? m.score : max), 0)

      const a = activityScoreParts.score
      const h = hostScore
      const m = memberScore
      const alignment = 3 + a + h + m

      alignmentByActivity.set(activityId, alignment)
      alignmentComponentsByActivity.set(activityId, {
        activityScore: a,
        hostScore: h,
        memberScore: m,
        activityTopTopics: activityScoreParts.topTopics,
        hosts: hostDetails.sort((x, y) => y.score - x.score),
        members: memberDetails.sort((x, y) => y.score - x.score),
      })
    })
  } else {
    // No topics; fall back to minimal alignment baseline
    activityIds.forEach((activityId) => {
      alignmentByActivity.set(activityId, 3)
      alignmentComponentsByActivity.set(activityId, {
        activityScore: 0,
        hostScore: 0,
        memberScore: 0,
        activityTopTopics: [],
        hosts: [],
        members: [],
      })
    })
  }

  // Resolve topic IDs to names for alignment top-topics and user interests
  const alignmentTopicNameMap = new Map<string, string>()
  if (alignmentTopicIdsForNames.size > 0) {
    const supabase = createServiceClient()
    const { data: topicRows } = await supabase
      .from('topics')
      .select('id, name')
      .in('id', Array.from(alignmentTopicIdsForNames))
    topicRows?.forEach((r: any) => {
      alignmentTopicNameMap.set(r.id as string, (r.name as string) || 'Unknown topic')
    })
  }

  // Build global user interest tags (all existing user interests for this user)
  const userInterestTopicsGlobal: Array<{
    topicId: string
    topicName: string
    aggregate: number
    memory: number
  }> = Array.from(searcherInterestScores.entries())
    .map(([tid, scores]) => ({
      topicId: tid,
      topicName: alignmentTopicNameMap.get(tid) || tid,
      aggregate: scores.aggregate,
      memory: scores.memory,
    }))
    .sort((a, b) => b.memory + b.aggregate - (a.memory + a.aggregate))

  // Build result with details (trustworthy, alignment)
  const final: RankedActivity[] = []
  activityIds.forEach((activityId) => {
    const trustworthy = trustworthyByActivity.get(activityId) ?? 1
    const alignment = alignmentByActivity.get(activityId) ?? 3
    const finalScore = trustworthy * alignment

    const trustworthySignals =
      trustworthySignalsByActivity.get(activityId) ||
      ({
        friendGoing: false,
        multipleFriendsGoing: false,
        friendIsOwnerOrManager: false,
        hostHasSubscribedProject: false,
        hostHasJoinedProject: false,
        hostHasJoinedCommunity: false,
      } as const)

    const alignmentComponents = alignmentComponentsByActivity.get(activityId) || {
      activityScore: 0,
      hostScore: 0,
      memberScore: 0,
      activityTopTopics: [],
      hosts: [] as {
        portfolioId: string
        score: number
        rawAgg: number
        rawMem: number
        topTopics: {
          topicId: string
          similarity: number
          aggregate: number
          memory: number
        }[]
      }[],
      members: [] as {
        userId: string
        score: number
        rawAgg: number
        rawMem: number
        topTopics: {
          topicId: string
          similarity: number
          aggregate: number
          memory: number
        }[]
      }[],
    }

    const details: ActivityMatchDetails = {
      trustworthy: {
        value: trustworthy,
        ...trustworthySignals,
      },
      alignment: {
        value: alignment,
        activityScore: alignmentComponents.activityScore,
        hostScore: alignmentComponents.hostScore,
        memberScore: alignmentComponents.memberScore,
        userInterestTopics: userInterestTopicsGlobal,
        expandedTopics: expandedTopicsForUser.map((t) => ({
          topicId: t.topicId,
          topicName: alignmentTopicNameMap.get(t.topicId) || t.topicId,
          similarity: t.similarity,
          sourceTopicId: t.sourceSearcherTopicId || t.topicId,
          sourceTopicName:
            (t.sourceSearcherTopicId &&
              (alignmentTopicNameMap.get(t.sourceSearcherTopicId) || t.sourceSearcherTopicId)) ||
            (alignmentTopicNameMap.get(t.topicId) || t.topicId),
        })),
        activityTopTopics: alignmentComponents.activityTopTopics.map((t) => ({
          topicId: t.topicId,
          topicName: alignmentTopicNameMap.get(t.topicId) || t.topicId,
          similarity: t.similarity,
          aggregate: t.aggregate,
          memory: t.memory,
        })),
        hosts: alignmentComponents.hosts.map((h) => ({
          portfolioId: h.portfolioId,
          score: h.score,
          rawAgg: h.rawAgg,
          rawMem: h.rawMem,
          topTopics: h.topTopics.map((t) => ({
            topicId: t.topicId,
            topicName: alignmentTopicNameMap.get(t.topicId) || t.topicId,
            similarity: t.similarity,
            aggregate: t.aggregate,
            memory: t.memory,
          })),
        })),
        members: alignmentComponents.members.map((m) => ({
          userId: m.userId,
          score: m.score,
          rawAgg: m.rawAgg,
          rawMem: m.rawMem,
          topTopics: m.topTopics.map((t) => ({
            topicId: t.topicId,
            topicName: alignmentTopicNameMap.get(t.topicId) || t.topicId,
            similarity: t.similarity,
            aggregate: t.aggregate,
            memory: t.memory,
          })),
        })),
      },
    }

    final.push({ activityId, score: finalScore, details })
    })

  return final.sort((a, b) => b.score - a.score)
}
