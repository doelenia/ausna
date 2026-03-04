'use server'

import { createClient } from '@/lib/supabase/server'
import { isCallToJoinWindowOpen } from '@/lib/callToJoin'
import { isActivityLive } from '@/lib/activityLive'
import type { ActivityCallToJoinConfig } from '@/types/portfolio'
import type { ActivityDateTimeValue } from '@/lib/datetime'
import type { ActivityLocationValue } from '@/lib/location'
import { runActivityMatchPipeline, type ActivityMetadata } from '@/lib/indexing/activity-match'
import { generateDailyMatchIntro } from '@/lib/indexing/daily-match-intro'
import { sendDailyActivityMatchEmail } from '@/lib/email/dailyActivityMatch'
import { getSiteUrl } from '@/lib/email/resend'
import { createUnsubscribeToken } from '@/lib/email/unsubscribeToken'
import { formatActivityLocation } from '@/lib/formatActivityLocation'
import { DEFAULT_ACTIVITY_PATTERN_PATH, getRandomActivityPatternPath } from '@/lib/explore/activityPatterns'

const EXPLORE_ACTIVITIES_LIMIT = 50

/** Activity row as returned from DB for filtering */
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

/** Normalized activity for the Explore page */
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

export interface GetExploreActivitiesResult {
  success: boolean
  activities?: ExploreActivity[]
  error?: string
}

async function getFriendIds(userId: string, supabase: Awaited<ReturnType<typeof createClient>>): Promise<string[]> {
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
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string[]> {
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('portfolio_id')
    .eq('user_id', userId)
  return (subscriptions || []).map((s: { portfolio_id: string }) => s.portfolio_id)
}

async function getMemberPortfolioIds(
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
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

/** User IDs that are members of at least one project/community the current user is a member of (co-members). */
async function getSharedProjectMemberIds(
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
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

/** Get user's location from human portfolio for same-city matching. */
async function getUserLocationForExplore(
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
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

/** Smart accessibility matcher used for both pills and initial filtering. */
function computeAccessibilityKind(
  userLoc: ActivityLocationValue | null,
  activityLoc: ActivityLocationValue | undefined | null
): 'online' | 'local' | null {
  if (activityLoc?.online) return 'online'

  if (activityLoc && userLoc?.city && activityLoc.city) {
    const cityMatches = normalizeCity(userLoc.city) === normalizeCity(activityLoc.city)
    const countryMatches =
      !!userLoc.country &&
      !!activityLoc.country &&
      normalizeCity(userLoc.country) === normalizeCity(activityLoc.country)

    if (cityMatches && (!userLoc.country || countryMatches)) {
      return 'local'
    }
  }

  return null
}

/** Same city: compare city and country (both normalized). */
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

/** Activity is "online" (no physical location). */
function isActivityOnline(loc: ActivityLocationValue | undefined | null): boolean {
  return !!loc?.online
}

/** Whether activity is still open to join (including external activities which have no call_to_join). */
function isOpenToJoin(activity: ActivityRow): boolean {
  const visibility = activity.visibility as 'public' | 'private' | undefined | null
  const props = activity.metadata?.properties
  const status = activity.metadata?.status ?? null
  const isExternal = props?.external === true
  const activityDateTime = props?.activity_datetime

  if (status === 'archived') return false

  if (isExternal) {
    // External activities: open if before start or live (no join_by)
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
    ? { enabled: raw.enabled ?? true, require_approval: (raw as ActivityCallToJoinConfig).require_approval ?? false, join_by: raw.join_by ?? null }
    : null
  return isCallToJoinWindowOpen(visibility, callToJoin, activityDateTime ?? undefined, status)
}

/** User has not joined this activity (uploader and managers are allowed). */
function userNotJoinedOrUploaded(activity: ActivityRow, userId: string): boolean {
  const members = activity.metadata?.members || []
  return !members.includes(userId)
}

/** At least one of: external, friend/shared-member in activity, host in subscribed/joined, same city or online. */
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

export async function getExploreActivities(userId: string): Promise<GetExploreActivitiesResult> {
  try {
    const supabase = await createClient()

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
    const context = {
      relevantUserIds,
      subscribedOrMemberPortfolioIds,
      userLocation,
    }

    const activities = (activitiesRaw || []) as ActivityRow[]
    const filtered: ExploreActivity[] = []

    for (const row of activities) {
      if (filtered.length >= EXPLORE_ACTIVITIES_LIMIT) break
      if (row.visibility === 'private') continue
      if (!isOpenToJoin(row)) continue
      if (!userNotJoinedOrUploaded(row, userId)) continue
      // Accessibility/location is the only initial relevance filter we keep for explore/match,
      // but if the user has no location recorded we skip this filter entirely.
      if (userLocation) {
        const location = row.metadata?.properties?.location
        const accessibilityKind = computeAccessibilityKind(userLocation, location)
        if (!accessibilityKind) continue
      }

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

    return { success: true, activities: filtered }
  } catch (err: any) {
    console.error('getExploreActivities error:', err)
    return { success: false, error: err?.message ?? 'Failed to load explore activities' }
  }
}

/** Dev only: match criteria for expandable card (matching details, trustworthy, alignment). */
export type ActivityMatchDetails = import('@/lib/indexing/activity-match').ActivityMatchDetails

export interface RunActivityMatchResult {
  success: boolean
  activities?: Array<{ id: string; score: number; details?: ActivityMatchDetails }>
  error?: string
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

export interface ExploreActivityHighlightsResult {
  success: boolean
  highlights: Record<string, DailyMatchHighlightMeta>
  error?: string
}

export interface DailyExploreMatchResult {
  success: boolean
  introText: string | null
  activities: DailyMatchActivity[]
  ranAt: string | null
  patternPath?: string | null
  error?: string
}

interface ActivityMatchContext {
  ranked: Awaited<ReturnType<typeof runActivityMatchPipeline>>
  friendIds: string[]
  subscribedProjectIds: Set<string>
  joinedProjectIds: Set<string>
  joinedCommunityIds: Set<string>
  activityMetadata: Map<string, ActivityMetadata>
}

async function computeActivityMatchContext(
  userId: string,
  activityIds: string[]
): Promise<ActivityMatchContext> {
  const supabase = await createClient()

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

  const subscribedProjectIds = new Set<string>(
    subscribedIds.filter((id) => typeById.get(id) === 'projects')
  )
  const joinedProjectIds = new Set<string>(
    memberIds.filter((id) => typeById.get(id) === 'projects')
  )
  const joinedCommunityIds = new Set<string>(
    memberIds.filter((id) => typeById.get(id) === 'community')
  )

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

async function buildHighlightMetadata(
  userId: string,
  activityIds: string[]
): Promise<{
  activityById: Map<string, ExploreActivity>
  activityMetadata: Map<string, ActivityMetadata>
  friendIds: string[]
  hostProjectMap: Map<string, { name: string; avatar?: string | null; emoji?: string | null }>
  hostCommunityMap: Map<string, { name: string; avatar?: string | null; emoji?: string | null }>
  friendProfileMap: Map<string, { name: string; avatar?: string | null }>
  userLocation: ActivityLocationValue | null
}> {
  const supabase = await createClient()

  const [friendIds, { data: activitiesRaw }, userLocation] = await Promise.all([
    getFriendIds(userId, supabase),
    supabase.from('portfolios').select('id, user_id, host_project_id, metadata').in('id', activityIds),
    getUserLocationForExplore(userId, supabase),
  ])

  const activityMetadata = new Map<string, ActivityMetadata>()
  const activityById = new Map<string, ExploreActivity>()

  const hostProjectIdsAll = new Set<string>()
  const hostCommunityIdsAll = new Set<string>()
  const friendIdsAll = new Set<string>()

  ;(activitiesRaw || []).forEach(
    (row: {
      id: string
      user_id: string
      host_project_id?: string | null
      metadata?: {
        basic?: { name?: string; avatar?: string; emoji?: string; description?: string }
        members?: string[]
        managers?: string[]
        properties?: {
          host_project_ids?: string[]
          host_community_ids?: string[]
          external?: boolean
          activity_datetime?: ActivityDateTimeValue
          location?: ActivityLocationValue
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

      const basic = meta.basic || {}
      activityById.set(row.id, {
        id: row.id,
        name: (basic.name as string) || 'Activity',
        avatar: basic.avatar as string | undefined,
        emoji: basic.emoji as string | undefined,
        description: (basic.description as string) || undefined,
        hostProjectId: row.host_project_id ?? undefined,
        activityDateTime: props.activity_datetime ?? null,
        location: props.location ?? null,
        external,
      })

      hostProjectIds.forEach((id) => hostProjectIdsAll.add(id))
      hostCommunityIds.forEach((id) => hostCommunityIdsAll.add(id))

      const goingIds = new Set<string>(memberIdsCombined)
      friendIds.forEach((fid) => {
        if (goingIds.has(fid)) friendIdsAll.add(fid)
      })
    }
  )

  const [hostProjects, hostCommunities, friendPortfolios] = await Promise.all([
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

  return {
    activityById,
    activityMetadata,
    friendIds,
    hostProjectMap,
    hostCommunityMap,
    friendProfileMap,
    userLocation,
  }
}

export async function getExploreActivityHighlights(
  userId: string,
  activityIds: string[]
): Promise<ExploreActivityHighlightsResult> {
  try {
    if (!activityIds || activityIds.length === 0) {
      return { success: true, highlights: {} }
    }

    const {
      activityById,
      activityMetadata,
      friendIds,
      hostProjectMap,
      hostCommunityMap,
      friendProfileMap,
      userLocation,
    } = await buildHighlightMetadata(userId, activityIds)

    const highlights: Record<string, DailyMatchHighlightMeta> = {}

    activityIds.forEach((id) => {
      const meta = activityMetadata.get(id)
      const activity = activityById.get(id)
      if (!meta || !activity) return

      const friendParticipantIds = friendIds.filter((fid) => meta.memberIds.includes(fid))
      const topFriendIds = friendParticipantIds.slice(0, 3)
      const extraFriendCount =
        friendParticipantIds.length > topFriendIds.length
          ? friendParticipantIds.length - topFriendIds.length
          : 0

      let host: DailyMatchHostHighlight | undefined
      if (meta) {
        let friendHostId: string | undefined
        if (!meta.external) {
          const ownerOrManagers = [meta.ownerId, ...meta.managerIds]
          friendHostId = ownerOrManagers.find((ownerId) => friendParticipantIds.includes(ownerId))
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
      const accessibilityKind = computeAccessibilityKind(userLocation, loc)

      if (accessibilityKind === 'online') {
        accessibility = { kind: 'online', label: 'Online' }
      } else if (accessibilityKind === 'local') {
        accessibility = { kind: 'local', label: 'Local' }
      }

      let friendsHighlight: DailyMatchFriendsHighlight | undefined
      if (topFriendIds.length > 0) {
        const topFriends = topFriendIds.map((uid) => {
          const fp = friendProfileMap.get(uid)
          return {
            userId: uid,
            name: fp?.name ?? `Friend ${uid.slice(0, 8)}`,
            avatar: fp?.avatar ?? null,
          }
        })
        friendsHighlight = {
          topFriends,
          extraCount: extraFriendCount,
        }
      }

      highlights[id] = {
        host,
        accessibility,
        interestTags: [],
        friends: friendsHighlight,
      }
    })

    return { success: true, highlights }
  } catch (err: any) {
    console.error('getExploreActivityHighlights error:', err)
    return {
      success: false,
      highlights: {},
      error: err?.message ?? 'Failed to load activity highlights',
    }
  }
}

/** Run activity match for the current user (same activity set as explore). For testing; daily 8am run is stubbed (see docs/activity-explore-match.md). */
export async function runActivityMatch(userId: string): Promise<RunActivityMatchResult> {
  try {
    const result = await getExploreActivities(userId)
    if (!result.success || !result.activities?.length) {
      return { success: true, activities: [] }
    }

    const activityIds = result.activities.map((a) => a.id)

    const { ranked } = await computeActivityMatchContext(userId, activityIds)

    // Also recompute and store the daily explore match snapshot for this user (dev button).
    // Errors here should not break the dev match button itself.
    try {
      await computeAndStoreDailyExploreMatch(userId)
    } catch (e) {
      console.error('runActivityMatch: failed to refresh daily explore match snapshot', e)
    }

    return {
      success: true,
      activities: ranked.map((r) => ({
        id: r.activityId,
        score: r.score,
        details: r.details,
      })),
    }
  } catch (err: any) {
    console.error('runActivityMatch error:', err)
    return { success: false, error: err?.message ?? 'Failed to run activity match' }
  }
}

const DAILY_MATCH_MIN_SCORE = 3.4
const DAILY_MATCH_MAX_ACTIVITIES = 5

async function computeAndStoreDailyExploreMatch(
  userId: string
): Promise<DailyExploreMatchResult> {
  try {
    const activitiesResult = await getExploreActivities(userId)
    if (!activitiesResult.success || !activitiesResult.activities?.length) {
      return { success: true, introText: null, activities: [], ranAt: null }
    }

    const activities = activitiesResult.activities
    const activityById = new Map(activities.map((a) => [a.id, a]))
    const activityIds = activities.map((a) => a.id)

    const [{ ranked, friendIds, activityMetadata }, userLocation] = await Promise.all([
      computeActivityMatchContext(userId, activityIds),
      (async () => {
        const supabase = await createClient()
        return getUserLocationForExplore(userId, supabase)
      })(),
    ])

    const eligibleRanked = ranked
      .filter((r) => activityById.has(r.activityId) && r.score >= DAILY_MATCH_MIN_SCORE)
      .slice(0, DAILY_MATCH_MAX_ACTIVITIES)

    if (eligibleRanked.length === 0) {
      return { success: true, introText: null, activities: [], ranAt: null }
    }

    const ranAt = new Date().toISOString()
    const patternPath = getRandomActivityPatternPath()

    const supabase = await createClient()

    const hostProjectIdsAll = new Set<string>()
    const hostCommunityIdsAll = new Set<string>()
    const friendIdsAll = new Set<string>()

    eligibleRanked.forEach((r) => {
      const meta = activityMetadata.get(r.activityId)
      if (!meta) return
      meta.hostProjectIds.forEach((id) => hostProjectIdsAll.add(id))
      meta.hostCommunityIds.forEach((id) => hostCommunityIdsAll.add(id))
      // For \"friends going\" we rely on the explicit member list only:
      // members represent exactly who is going to the activity.
      const goingIds = new Set<string>(meta.memberIds)
      friendIds.forEach((fid) => {
        if (goingIds.has(fid)) friendIdsAll.add(fid)
      })
    })

    const [hostProjects, hostCommunities, friendPortfolios, humanPortfolio, projectPortfolios] =
      await Promise.all([
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
        supabase
          .from('portfolios')
          .select('id, metadata')
          .eq('type', 'human')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('portfolios')
          .select('metadata')
          .eq('type', 'projects')
          .eq('user_id', userId)
          .limit(5),
      ])

    const hostProjectMap = new Map<
      string,
      { name: string; avatar?: string | null; emoji?: string | null }
    >()
    ;(hostProjects.data || []).forEach((row: any) => {
      const meta = (row.metadata as any) || {}
      const basic = meta.basic || {}
      hostProjectMap.set(row.id as string, {
        name: (basic.name as string) || 'Project',
        avatar: (basic.avatar as string | null | undefined) ?? null,
        emoji: (basic.emoji as string | null | undefined) ?? null,
      })
    })

    const hostCommunityMap = new Map<
      string,
      { name: string; avatar?: string | null; emoji?: string | null }
    >()
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

      // Friends going: based strictly on members (who are going),
      // without filtering out the owner if they appear in the member list.
      const friendParticipantIds = meta
        ? friendIds.filter((fid) => meta.memberIds.includes(fid))
        : []
      const topFriendIds = friendParticipantIds.slice(0, 3)
      const extraFriendCount =
        friendParticipantIds.length > topFriendIds.length
          ? friendParticipantIds.length - topFriendIds.length
          : 0

      let host: DailyMatchHostHighlight | undefined
      if (meta) {
        // For external activities, never treat a friend as the host;
        // the creator is only the uploader, not the host.
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
      const accessibilityKind = computeAccessibilityKind(userLocation, loc)
      if (accessibilityKind === 'online') {
        accessibility = { kind: 'online', label: 'Online' }
      } else if (accessibilityKind === 'local') {
        accessibility = { kind: 'local', label: 'Local' }
      }

      const interestTags: DailyMatchInterestTagHighlight[] = []
      if (details?.alignment.activityTopTopics?.length) {
        details.alignment.activityTopTopics
          .filter(
            (t) =>
              t.similarity > 0 &&
              (typeof t.aggregate === 'number' || typeof t.memory === 'number')
          )
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
          return {
            userId: uid,
            name: fp?.name ?? `Friend ${uid.slice(0, 8)}`,
            avatar: fp?.avatar ?? null,
          }
        })
        friendsHighlight = {
          topFriends,
          extraCount: extraFriendCount,
        }
      }

      const highlight: DailyMatchHighlightMeta = {
        host,
        accessibility,
        interestTags,
        friends: friendsHighlight,
      }

      return {
        activity,
        score: r.score,
        details,
        highlight,
      }
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
        const description =
          (basic.description as string | undefined) ||
          (meta.description as string | undefined) ||
          ''
        return { name, description }
      }) ?? []

    const interestTopics =
      activitiesWithHighlights[0]?.details?.alignment.userInterestTopics ?? []
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

    // Persist a compact snapshot of the daily match result into the user's human portfolio.
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

        const updatedMeta = {
          ...existingMeta,
          properties: {
            ...existingProps,
            daily_explore_match: {
              ran_at: ranAt,
              intro_text: introText,
              activities: serializedActivities,
              pattern_path: patternPath,
            },
          },
        }

        await supabase
          .from('portfolios')
          .update({ metadata: updatedMeta })
          .eq('id', humanRow.id)
      }
    } catch (e) {
      console.error('getDailyExploreMatch: failed to persist daily match snapshot', e)
    }

    return {
      success: true,
      introText,
      activities: activitiesWithHighlights,
      ranAt,
      patternPath,
    }
  } catch (err: any) {
    console.error('computeAndStoreDailyExploreMatch error:', err)
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

export async function getDailyExploreMatch(userId: string): Promise<DailyExploreMatchResult> {
  return computeAndStoreDailyExploreMatch(userId)
}

export async function getStoredDailyExploreMatch(
  userId: string
): Promise<DailyExploreMatchResult> {
  try {
    const supabase = await createClient()

    const { data: human } = await supabase
      .from('portfolios')
      .select('id, metadata')
      .eq('type', 'human')
      .eq('user_id', userId)
      .maybeSingle()

    if (!human?.metadata) {
      return { success: true, introText: null, activities: [], ranAt: null }
    }

    const meta = human.metadata as any
    const props = (meta.properties as Record<string, any> | undefined) || {}
    const snapshot = props.daily_explore_match as
      | {
          ran_at?: string
          intro_text?: string | null
          pattern_path?: string | null
          activities?: Array<{
            activity_id: string
            score: number
            host?: DailyMatchHostHighlight | null
            accessibility?: DailyMatchAccessibilityHighlight | null
            interest_tags?: DailyMatchInterestTagHighlight[]
            friends?: DailyMatchFriendsHighlight | null
          }>
        }
      | undefined

    if (!snapshot || !Array.isArray(snapshot.activities) || snapshot.activities.length === 0) {
      return { success: true, introText: null, activities: [], ranAt: null }
    }

    const activitiesResult = await getExploreActivities(userId)
    if (!activitiesResult.success || !activitiesResult.activities?.length) {
      return { success: true, introText: null, activities: [], ranAt: null }
    }

    const activityById = new Map(
      activitiesResult.activities.map((a) => [a.id, a] as const)
    )

    const restoredActivities: DailyMatchActivity[] = []

    snapshot.activities.forEach((item) => {
      const activity = activityById.get(item.activity_id)
      if (!activity) return

      const highlight: DailyMatchHighlightMeta = {
        host: item.host ?? undefined,
        accessibility: item.accessibility ?? undefined,
        interestTags: item.interest_tags ?? [],
        friends: item.friends ?? undefined,
      }

      restoredActivities.push({
        activity,
        score: item.score,
        details: undefined,
        highlight,
      })
    })

    if (restoredActivities.length === 0) {
      return { success: true, introText: null, activities: [], ranAt: null }
    }

    return {
      success: true,
      introText: snapshot.intro_text ?? null,
      activities: restoredActivities,
      ranAt: snapshot.ran_at ?? null,
      patternPath:
        (snapshot.pattern_path && typeof snapshot.pattern_path === 'string'
          ? snapshot.pattern_path
          : null) ?? null,
    }
  } catch (err: any) {
    console.error('getStoredDailyExploreMatch error:', err)
    return {
      success: false,
      introText: null,
      activities: [],
      ranAt: null,
      patternPath: null,
      error: err?.message ?? 'Failed to read stored daily explore match',
    }
  }
}

export interface SendDailyMatchEmailForCurrentUserResult {
  success: boolean
  sent: boolean
  message: string
}

export async function sendDailyMatchEmailForCurrentUser(): Promise<SendDailyMatchEmailForCurrentUserResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, sent: false, message: 'Unauthorized' }
    }

    const daily = await getDailyExploreMatch(user.id)
    if (!daily.success) {
      return { success: false, sent: false, message: daily.error ?? 'Failed to compute daily match' }
    }

    if (!daily.activities || daily.activities.length < 1) {
      return { success: true, sent: false, message: 'No matched activities today.' }
    }

    const toEmail = (user.email || '').trim()
    if (!toEmail) {
      return { success: false, sent: false, message: 'No email address on your account' }
    }

    const siteUrl = getSiteUrl()
    const exploreUrl = `${siteUrl}/explore?utm_source=daily_match_email&utm_medium=email`
    const unsubscribeUrl = `${siteUrl}/api/unsubscribe/daily-match?token=${encodeURIComponent(createUnsubscribeToken(user.id))}`
    const introText =
      (daily.introText || '').trim() ||
      'A few activities stood out for you today. Take a look and see what feels right.'

    const userName = (() => {
      const meta = (daily.activities[0]?.activity ?? null) as any
      // Fallback: we can also fetch human portfolio name here if needed,
      // but for the test button it's acceptable to omit when unknown.
      return meta?.ownerName && typeof meta.ownerName === 'string' ? meta.ownerName.trim() : undefined
    })()

    const dateLabel = (() => {
      const ranAt = daily.ranAt
      if (!ranAt) return undefined
      const d = new Date(ranAt)
      if (Number.isNaN(d.getTime())) return undefined
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
      }).format(d)
    })()

    const sendResult = await sendDailyActivityMatchEmail({
      toEmail,
      exploreUrl,
      unsubscribeUrl,
      introText,
      userName,
      dateLabel,
      patternPath: daily.patternPath ?? DEFAULT_ACTIVITY_PATTERN_PATH,
      activities: daily.activities.map((a) => ({
        timeLabel: a.activity.activityDateTime?.start
          ? new Intl.DateTimeFormat(undefined, {
              month: 'short',
              day: 'numeric',
            }).format(new Date(a.activity.activityDateTime.start))
          : undefined,
        locationLabel: (() => {
          if (!a.activity.location) return undefined
          const { line1, line2 } = formatActivityLocation(a.activity.location)
          return line2 || line1 || undefined
        })(),
        hostLabel: (() => {
          const host = a.highlight.host
          if (!host) return undefined
          if (host.kind === 'friend') return host.name
          if (host.kind === 'project') return host.name
          if (host.kind === 'community') return host.name
          return undefined
        })(),
        interestLabels: a.highlight.interestTags.map((t) => t.topicName),
        friendsLabel: (() => {
          const f = a.highlight.friends
          if (!f) return undefined
          if (f.topFriends.length === 0) return undefined
          if (f.topFriends.length === 1 && f.extraCount === 0) return `${f.topFriends[0].name} is going`
          const count = f.topFriends.length + f.extraCount
          return `${count} friends are going`
        })(),
      })),
    })

    if (!sendResult.success) {
      return { success: false, sent: false, message: sendResult.error }
    }

    return { success: true, sent: true, message: 'Email sent.' }
  } catch (err: any) {
    return { success: false, sent: false, message: err?.message ?? 'Failed to send email' }
  }
}
