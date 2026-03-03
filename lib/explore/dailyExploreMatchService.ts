import { createServiceClient } from '@/lib/supabase/service'
import { isCallToJoinWindowOpen } from '@/lib/callToJoin'
import { isActivityLive } from '@/lib/activityLive'
import type { ActivityCallToJoinConfig } from '@/types/portfolio'
import type { ActivityDateTimeValue } from '@/lib/datetime'
import type { ActivityLocationValue } from '@/lib/location'
import { runActivityMatchPipeline, type ActivityMetadata, type ActivityMatchDetails } from '@/lib/indexing/activity-match'
import { generateDailyMatchIntro } from '@/lib/indexing/daily-match-intro'
import { getRandomActivityPatternPath } from '@/lib/explore/activityPatterns'

const EXPLORE_ACTIVITIES_LIMIT = 50
const DAILY_MATCH_MIN_SCORE = 3.4
const DAILY_MATCH_MAX_ACTIVITIES = 5

interface ActivityRow {
  id: string
  user_id: string
  host_project_id?: string | null
  visibility?: string | null
  metadata: {
    basic?: { name?: string; avatar?: string; emoji?: string; description?: string }
    members?: string[]
    managers?: string[]
    status?: string | null
    properties?: {
      activity_datetime?: ActivityDateTimeValue
      location?: ActivityLocationValue
      call_to_join?: { enabled?: boolean; join_by?: string | null } | null
      external?: boolean
      host_project_ids?: string[]
      host_community_ids?: string[]
    }
  }
}

export interface ExploreActivity {
  id: string
  name: string
  avatar?: string
  emoji?: string
  description?: string
  hostProjectId?: string | null
  activityDateTime?: ActivityDateTimeValue | null
  location?: ActivityLocationValue | null
  external?: boolean
}

export interface DailyMatchHostHighlight {
  kind: 'friend' | 'project' | 'community'
  friendUserId?: string
  projectId?: string
  communityId?: string
  name: string
  avatar?: string | null
  emoji?: string | null
}

export interface DailyMatchAccessibilityHighlight {
  kind: 'online' | 'local' | 'in_person'
  label: string
}

export interface DailyMatchInterestTagHighlight {
  topicId: string
  topicName: string
}

export interface DailyMatchFriendsHighlight {
  topFriends: Array<{ userId: string; name: string; avatar?: string | null }>
  extraCount: number
}

export interface DailyMatchHighlightMeta {
  host?: DailyMatchHostHighlight
  accessibility?: DailyMatchAccessibilityHighlight
  interestTags: DailyMatchInterestTagHighlight[]
  friends?: DailyMatchFriendsHighlight
}

export interface DailyMatchActivity {
  activity: ExploreActivity
  score: number
  details?: ActivityMatchDetails
  highlight: DailyMatchHighlightMeta
}

export interface DailyExploreMatchResult {
  success: boolean
  introText: string | null
  activities: DailyMatchActivity[]
  ranAt: string | null
  patternPath?: string | null
  error?: string
}

async function getFriendIds(userId: string, supabase: ReturnType<typeof createServiceClient>): Promise<string[]> {
  const { data: friendships } = await supabase
    .from('friends')
    .select('user_id, friend_id, status')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)

  const friendIds: string[] = []
  friendships?.forEach((f: { user_id: string; friend_id: string; status: string }) => {
    if (f.status === 'accepted') {
      friendIds.push(f.user_id === userId ? f.friend_id : f.user_id)
    }
  })
  return friendIds
}

async function getSubscribedPortfolioIds(
  userId: string,
  supabase: ReturnType<typeof createServiceClient>
): Promise<string[]> {
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('portfolio_id')
    .eq('user_id', userId)
  return (subscriptions || []).map((s: { portfolio_id: string }) => s.portfolio_id)
}

async function getMemberPortfolioIds(
  userId: string,
  supabase: ReturnType<typeof createServiceClient>
): Promise<string[]> {
  const { data: owned } = await supabase.from('portfolios').select('id').eq('user_id', userId)
  const ownedIds = (owned || []).map((p: { id: string }) => p.id)

  const { data: allPortfolios } = await supabase
    .from('portfolios')
    .select('id, metadata')
    .in('type', ['projects', 'community'])

  const memberIds: string[] = []
  allPortfolios?.forEach((p: { id: string; metadata: { members?: string[] } }) => {
    const members = p.metadata?.members || []
    if (Array.isArray(members) && members.includes(userId)) memberIds.push(p.id)
  })
  return Array.from(new Set([...ownedIds, ...memberIds]))
}

async function getSharedProjectMemberIds(
  userId: string,
  supabase: ReturnType<typeof createServiceClient>
): Promise<string[]> {
  const memberPortfolioIds = await getMemberPortfolioIds(userId, supabase)
  if (memberPortfolioIds.length === 0) return []

  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('id, user_id, metadata')
    .in('id', memberPortfolioIds)

  const coMemberIds = new Set<string>()
  portfolios?.forEach((p: { user_id: string; metadata: { members?: string[] } }) => {
    coMemberIds.add(p.user_id)
    const members = p.metadata?.members || []
    members.forEach((uid: string) => coMemberIds.add(uid))
  })
  coMemberIds.delete(userId)
  return Array.from(coMemberIds)
}

async function getUserLocationForExplore(
  userId: string,
  supabase: ReturnType<typeof createServiceClient>
): Promise<ActivityLocationValue | null> {
  const { data: human } = await supabase
    .from('portfolios')
    .select('metadata')
    .eq('type', 'human')
    .eq('user_id', userId)
    .maybeSingle()

  if (!human?.metadata) return null
  const props = (human.metadata as { properties?: { auto_city_location?: ActivityLocationValue } }).properties
  return props?.auto_city_location ?? null
}

function normalizeCity(s: string | undefined): string {
  if (!s || typeof s !== 'string') return ''
  return s.trim().toLowerCase()
}

function isSameCity(
  userLoc: ActivityLocationValue | null,
  activityLoc: ActivityLocationValue | undefined | null
): boolean {
  if (!activityLoc) return false
  if (activityLoc.online === true) return true
  if (!userLoc?.city || !userLoc?.country) return false
  const uCity = normalizeCity(userLoc.city)
  const uCountry = normalizeCity(userLoc.country)
  const aCity = normalizeCity(activityLoc.city)
  const aCountry = normalizeCity(activityLoc.country)
  return uCity === aCity && uCountry === aCountry
}

function isActivityOnline(loc: ActivityLocationValue | undefined | null): boolean {
  return !!loc?.online
}

function isOpenToJoin(activity: ActivityRow): boolean {
  const visibility = activity.visibility as 'public' | 'private' | undefined | null
  const props = activity.metadata?.properties
  const status = activity.metadata?.status ?? null
  const isExternal = props?.external === true
  const activityDateTime = props?.activity_datetime

  if (status === 'archived') return false

  if (isExternal) {
    if (!activityDateTime?.start) return true
    const start = new Date(activityDateTime.start)
    if (Number.isNaN(start.getTime())) return true
    const live = isActivityLive(activityDateTime, status)
    let isBeforeStart = false
    if (activityDateTime.allDay) {
      const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      isBeforeStart = new Date() < dayStart
    } else {
      isBeforeStart = new Date() < start
    }
    return isBeforeStart || live
  }

  const raw = props?.call_to_join
  const callToJoin: ActivityCallToJoinConfig | null = raw
    ? {
        enabled: raw.enabled ?? true,
        require_approval: (raw as ActivityCallToJoinConfig).require_approval ?? false,
        join_by: raw.join_by ?? null,
      }
    : null

  return isCallToJoinWindowOpen(visibility, callToJoin, activityDateTime ?? undefined, status)
}

function userNotJoinedOrUploaded(activity: ActivityRow, userId: string): boolean {
  if (activity.user_id === userId) return false
  const members = activity.metadata?.members || []
  const managers = activity.metadata?.managers || []
  return !members.includes(userId) && !managers.includes(userId)
}

function activityMatchesAtLeastOne(
  activity: ActivityRow,
  context: {
    relevantUserIds: Set<string>
    subscribedOrMemberPortfolioIds: Set<string>
    userLocation: ActivityLocationValue | null
  }
): boolean {
  const props = activity.metadata?.properties
  const members = activity.metadata?.members || []
  const managers = activity.metadata?.managers || []
  const ownerId = activity.user_id
  const activityMemberIds = new Set([ownerId, ...managers, ...members])

  if (props?.external === true) return true

  for (const uid of activityMemberIds) {
    if (context.relevantUserIds.has(uid)) return true
  }

  const hostProjectIds = props?.host_project_ids || []
  const hostCommunityIds = props?.host_community_ids || []
  const legacyHostId = (activity as { host_project_id?: string | null }).host_project_id
  const allHostIds = [...hostProjectIds, ...hostCommunityIds]
  if (legacyHostId) allHostIds.push(legacyHostId)
  for (const id of allHostIds) {
    if (context.subscribedOrMemberPortfolioIds.has(id)) return true
  }

  if (isActivityOnline(props?.location)) return true
  if (isSameCity(context.userLocation, props?.location)) return true

  return false
}

export async function getExploreActivitiesService(userId: string): Promise<ExploreActivity[]> {
  const supabase = createServiceClient()

  const [friendIds, sharedMemberIds, subscribedIds, memberIds, userLocation, { data: activitiesRaw }] =
    await Promise.all([
      getFriendIds(userId, supabase),
      getSharedProjectMemberIds(userId, supabase),
      getSubscribedPortfolioIds(userId, supabase),
      getMemberPortfolioIds(userId, supabase),
      getUserLocationForExplore(userId, supabase),
      supabase
        .from('portfolios')
        .select('id, user_id, host_project_id, visibility, metadata')
        .eq('type', 'activities')
        .limit(500),
    ])

  const relevantUserIds = new Set<string>([...friendIds, ...sharedMemberIds])
  const subscribedOrMemberPortfolioIds = new Set<string>([...subscribedIds, ...memberIds])
  const context = { relevantUserIds, subscribedOrMemberPortfolioIds, userLocation }

  const activities = (activitiesRaw || []) as ActivityRow[]
  const filtered: ExploreActivity[] = []

  for (const row of activities) {
    if (filtered.length >= EXPLORE_ACTIVITIES_LIMIT) break
    if (row.visibility === 'private') continue
    if (!isOpenToJoin(row)) continue
    if (!userNotJoinedOrUploaded(row, userId)) continue
    if (!activityMatchesAtLeastOne(row, context)) continue

    const basic = row.metadata?.basic || {}
    filtered.push({
      id: row.id,
      name: (basic.name as string) || 'Activity',
      avatar: basic.avatar as string | undefined,
      emoji: basic.emoji as string | undefined,
      description: (basic.description as string) || undefined,
      hostProjectId: row.host_project_id ?? undefined,
      activityDateTime: row.metadata?.properties?.activity_datetime ?? null,
      location: row.metadata?.properties?.location ?? null,
      external: row.metadata?.properties?.external === true,
    })
  }

  return filtered
}

interface ActivityMatchContext {
  ranked: Awaited<ReturnType<typeof runActivityMatchPipeline>>
  friendIds: string[]
  subscribedProjectIds: Set<string>
  joinedProjectIds: Set<string>
  joinedCommunityIds: Set<string>
  activityMetadata: Map<string, ActivityMetadata>
}

async function computeActivityMatchContextService(
  userId: string,
  activityIds: string[]
): Promise<ActivityMatchContext> {
  const supabase = createServiceClient()

  const [friendIds, subscribedIds, memberIds, { data: portfolioRows }] = await Promise.all([
    getFriendIds(userId, supabase),
    getSubscribedPortfolioIds(userId, supabase),
    getMemberPortfolioIds(userId, supabase),
    supabase.from('portfolios').select('id, user_id, host_project_id, metadata').in('id', activityIds),
  ])

  const { data: typeRows } = await supabase
    .from('portfolios')
    .select('id, type')
    .in('id', [...subscribedIds, ...memberIds])

  const typeById = new Map<string, string>()
  ;(typeRows || []).forEach((row: { id: string; type: string }) => {
    typeById.set(row.id, row.type)
  })

  const subscribedProjectIds = new Set<string>(subscribedIds.filter((id) => typeById.get(id) === 'projects'))
  const joinedProjectIds = new Set<string>(memberIds.filter((id) => typeById.get(id) === 'projects'))
  const joinedCommunityIds = new Set<string>(memberIds.filter((id) => typeById.get(id) === 'community'))

  const activityMetadata = new Map<string, ActivityMetadata>()
  ;(portfolioRows || []).forEach(
    (row: {
      id: string
      user_id: string
      host_project_id?: string | null
      metadata?: {
        members?: string[]
        managers?: string[]
        properties?: {
          host_project_ids?: string[]
          host_community_ids?: string[]
          external?: boolean
        }
      }
    }) => {
      const meta = row.metadata || {}
      const props = meta.properties || {}
      const hostProjectIds: string[] = [...(props.host_project_ids || [])]
      const hostCommunityIds: string[] = [...(props.host_community_ids || [])]
      if (row.host_project_id) hostProjectIds.push(row.host_project_id)
      const managerIds = Array.isArray(meta.managers) ? meta.managers : []
      const memberIdsCombined = Array.isArray(meta.members) ? meta.members : []
      const external = props.external === true
      activityMetadata.set(row.id, {
        hostProjectIds,
        hostCommunityIds,
        memberIds: memberIdsCombined,
        managerIds,
        ownerId: row.user_id,
        external,
      })
    }
  )

  const ranked = await runActivityMatchPipeline({
    userId,
    activityIds,
    activityMetadata,
    subscribedProjectIds,
    joinedProjectIds,
    joinedCommunityIds,
    friendIds,
  })

  return {
    ranked,
    friendIds,
    subscribedProjectIds,
    joinedProjectIds,
    joinedCommunityIds,
    activityMetadata,
  }
}

export async function computeAndStoreDailyExploreMatchService(userId: string): Promise<DailyExploreMatchResult> {
  try {
    const activities = await getExploreActivitiesService(userId)
    if (!activities.length) {
      return { success: true, introText: null, activities: [], ranAt: null }
    }

    const activityById = new Map(activities.map((a) => [a.id, a]))
    const activityIds = activities.map((a) => a.id)

    const supabase = createServiceClient()

    const [{ ranked, friendIds, activityMetadata }, userLocation] = await Promise.all([
      computeActivityMatchContextService(userId, activityIds),
      getUserLocationForExplore(userId, supabase),
    ])

    const eligibleRanked = ranked
      .filter((r) => activityById.has(r.activityId) && r.score >= DAILY_MATCH_MIN_SCORE)
      .slice(0, DAILY_MATCH_MAX_ACTIVITIES)

    if (eligibleRanked.length === 0) {
      return { success: true, introText: null, activities: [], ranAt: null }
    }

    const ranAt = new Date().toISOString()
    const patternPath = getRandomActivityPatternPath()

    const hostProjectIdsAll = new Set<string>()
    const hostCommunityIdsAll = new Set<string>()
    const friendIdsAll = new Set<string>()

    eligibleRanked.forEach((r) => {
      const meta = activityMetadata.get(r.activityId)
      if (!meta) return
      meta.hostProjectIds.forEach((id) => hostProjectIdsAll.add(id))
      meta.hostCommunityIds.forEach((id) => hostCommunityIdsAll.add(id))
      const goingIds = new Set<string>(meta.memberIds)
      friendIds.forEach((fid) => {
        if (goingIds.has(fid)) friendIdsAll.add(fid)
      })
    })

    const [hostProjects, hostCommunities, friendPortfolios, humanPortfolio, projectPortfolios] = await Promise.all([
      hostProjectIdsAll.size > 0
        ? supabase
            .from('portfolios')
            .select('id, metadata')
            .eq('type', 'projects')
            .in('id', Array.from(hostProjectIdsAll))
        : Promise.resolve({ data: [] as any[], error: null }),
      hostCommunityIdsAll.size > 0
        ? supabase
            .from('portfolios')
            .select('id, metadata')
            .eq('type', 'community')
            .in('id', Array.from(hostCommunityIdsAll))
        : Promise.resolve({ data: [] as any[], error: null }),
      friendIdsAll.size > 0
        ? supabase
            .from('portfolios')
            .select('user_id, metadata')
            .eq('type', 'human')
            .in('user_id', Array.from(friendIdsAll))
        : Promise.resolve({ data: [] as any[], error: null }),
      supabase.from('portfolios').select('id, metadata').eq('type', 'human').eq('user_id', userId).maybeSingle(),
      supabase.from('portfolios').select('metadata').eq('type', 'projects').eq('user_id', userId).limit(5),
    ])

    const hostProjectMap = new Map<string, { name: string; avatar?: string | null; emoji?: string | null }>()
    ;(hostProjects.data || []).forEach((row: any) => {
      const meta = (row.metadata as any) || {}
      const basic = meta.basic || {}
      hostProjectMap.set(row.id as string, {
        name: (basic.name as string) || 'Project',
        avatar: (basic.avatar as string | null | undefined) ?? null,
        emoji: (basic.emoji as string | null | undefined) ?? null,
      })
    })

    const hostCommunityMap = new Map<string, { name: string; avatar?: string | null; emoji?: string | null }>()
    ;(hostCommunities.data || []).forEach((row: any) => {
      const meta = (row.metadata as any) || {}
      const basic = meta.basic || {}
      hostCommunityMap.set(row.id as string, {
        name: (basic.name as string) || 'Community',
        avatar: (basic.avatar as string | null | undefined) ?? null,
        emoji: (basic.emoji as string | null | undefined) ?? null,
      })
    })

    const friendProfileMap = new Map<string, { name: string; avatar?: string | null }>()
    ;(friendPortfolios.data || []).forEach((row: any) => {
      const meta = (row.metadata as any) || {}
      const basic = meta.basic || {}
      const user = row.user_id as string
      friendProfileMap.set(user, {
        name: (basic.name as string) || `User ${user.slice(0, 8)}`,
        avatar: (basic.avatar as string | null | undefined) ?? null,
      })
    })

    const activitiesWithHighlights: DailyMatchActivity[] = eligibleRanked.map((r) => {
      const activity = activityById.get(r.activityId)!
      const meta = activityMetadata.get(r.activityId)
      const details = r.details

      const friendParticipantIds = meta ? friendIds.filter((fid) => meta.memberIds.includes(fid)) : []
      const topFriendIds = friendParticipantIds.slice(0, 3)
      const extraFriendCount =
        friendParticipantIds.length > topFriendIds.length ? friendParticipantIds.length - topFriendIds.length : 0

      let host: DailyMatchHostHighlight | undefined
      if (meta) {
        let friendHostId: string | undefined
        if (!meta.external) {
          const ownerOrManagers = [meta.ownerId, ...meta.managerIds]
          friendHostId = ownerOrManagers.find((id) => friendParticipantIds.includes(id))
        }

        if (friendHostId) {
          const fp = friendProfileMap.get(friendHostId)
          host = {
            kind: 'friend',
            friendUserId: friendHostId,
            name: fp?.name ?? `Friend ${friendHostId.slice(0, 8)}`,
            avatar: fp?.avatar ?? null,
            emoji: null,
          }
        } else if (meta.hostProjectIds.length > 0) {
          const projectId = meta.hostProjectIds[0]
          const hp = hostProjectMap.get(projectId)
          host = {
            kind: 'project',
            projectId,
            name: hp?.name ?? 'Project',
            avatar: hp?.avatar ?? null,
            emoji: hp?.emoji ?? null,
          }
        } else if (meta.hostCommunityIds.length > 0) {
          const communityId = meta.hostCommunityIds[0]
          const hc = hostCommunityMap.get(communityId)
          host = {
            kind: 'community',
            communityId,
            name: hc?.name ?? 'Community',
            avatar: hc?.avatar ?? null,
            emoji: hc?.emoji ?? null,
          }
        }
      }

      let accessibility: DailyMatchAccessibilityHighlight | undefined
      const loc = activity.location
      if (loc?.online) {
        accessibility = { kind: 'online', label: 'Online' }
      } else if (loc && isSameCity(userLocation, loc)) {
        accessibility = { kind: 'local', label: 'Local' }
      }

      const interestTags: DailyMatchInterestTagHighlight[] = []
      if (details?.alignment.activityTopTopics?.length) {
        details.alignment.activityTopTopics
          .filter((t) => t.similarity > 0 && (typeof t.aggregate === 'number' || typeof t.memory === 'number'))
          .slice(0, 3)
          .forEach((t) => {
            interestTags.push({
              topicId: t.topicId,
              topicName: t.topicName,
            })
          })
      }

      let friendsHighlight: DailyMatchFriendsHighlight | undefined
      if (topFriendIds.length > 0) {
        const topFriends = topFriendIds.map((uid) => {
          const fp = friendProfileMap.get(uid)
          return { userId: uid, name: fp?.name ?? `Friend ${uid.slice(0, 8)}`, avatar: fp?.avatar ?? null }
        })
        friendsHighlight = { topFriends, extraCount: extraFriendCount }
      }

      const highlight: DailyMatchHighlightMeta = { host, accessibility, interestTags, friends: friendsHighlight }

      return { activity, score: r.score, details, highlight }
    })

    const profileMeta = (humanPortfolio?.data?.metadata as any) || {}
    const profileBasic = profileMeta.basic || {}
    const profileDescription =
      (profileBasic.description as string | undefined) ||
      (profileBasic.summary as string | undefined) ||
      (profileBasic.bio as string | undefined) ||
      ''

    const projectSummaries =
      (projectPortfolios.data || []).map((row: any) => {
        const meta = (row.metadata as any) || {}
        const basic = meta.basic || {}
        const name = (basic.name as string | undefined) || 'Project'
        const description = (basic.description as string | undefined) || (meta.description as string | undefined) || ''
        return { name, description }
      }) ?? []

    const interestTopics = activitiesWithHighlights[0]?.details?.alignment.userInterestTopics ?? []
    const interestNames = interestTopics
      .slice(0, 5)
      .map((t) => t.topicName)
      .filter((n) => n && n.trim().length > 0)

    const introText =
      (await generateDailyMatchIntro({
        profileDescription,
        projects: projectSummaries,
        interestTags: interestNames,
        activities: activitiesWithHighlights.map((a) => ({
          name: a.activity.name,
          accessibility: a.highlight.accessibility?.label ?? '',
          interestTags: a.highlight.interestTags.map((t) => t.topicName),
        })),
      })) ?? null

    try {
      if (humanPortfolio?.data) {
        const humanRow = humanPortfolio.data as any
        const existingMeta = (humanRow.metadata as any) || {}
        const existingProps = (existingMeta.properties as Record<string, any> | undefined) || {}

        const serializedActivities = activitiesWithHighlights.map((a) => ({
          activity_id: a.activity.id,
          score: a.score,
          host: a.highlight.host ?? null,
          accessibility: a.highlight.accessibility ?? null,
          interest_tags: a.highlight.interestTags,
          friends: a.highlight.friends ?? null,
        }))

        const existingDaily = (existingProps.daily_explore_match as Record<string, unknown>) || {}
        const updatedMeta = {
          ...existingMeta,
          properties: {
            ...existingProps,
            daily_explore_match: {
              ran_at: ranAt,
              intro_text: introText,
              activities: serializedActivities,
              pattern_path: patternPath,
              ...(existingDaily.unsubscribed === true ? { unsubscribed: true } : {}),
            },
          },
        }

        await supabase.from('portfolios').update({ metadata: updatedMeta }).eq('id', humanRow.id)
      }
    } catch (e) {
      console.error('computeAndStoreDailyExploreMatchService: failed to persist daily match snapshot', e)
    }

    return { success: true, introText, activities: activitiesWithHighlights, ranAt, patternPath }
  } catch (err: any) {
    console.error('computeAndStoreDailyExploreMatchService error:', err)
    return {
      success: false,
      introText: null,
      activities: [],
      ranAt: null,
      patternPath: null,
      error: err?.message ?? 'Failed to compute daily explore match',
    }
  }
}

