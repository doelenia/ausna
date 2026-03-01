'use server'

import { createClient } from '@/lib/supabase/server'
import { isCallToJoinWindowOpen } from '@/lib/callToJoin'
import { isActivityLive } from '@/lib/activityLive'
import type { ActivityCallToJoinConfig } from '@/types/portfolio'
import type { ActivityDateTimeValue } from '@/lib/datetime'
import type { ActivityLocationValue } from '@/lib/location'

const EXPLORE_ACTIVITIES_LIMIT = 50

/** Activity row as returned from DB for filtering */
interface ActivityRow {
  id: string
  user_id: string
  host_project_id?: string | null
  visibility?: string | null
  metadata: {
    basic?: { name?: string; avatar?: string; emoji?: string }
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

/** User has not joined and did not upload (create) this activity. */
function userNotJoinedOrUploaded(activity: ActivityRow, userId: string): boolean {
  if (activity.user_id === userId) return false
  const members = activity.metadata?.members || []
  const managers = activity.metadata?.managers || []
  return !members.includes(userId) && !managers.includes(userId)
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
      if (!activityMatchesAtLeastOne(row, context)) continue

      const basic = row.metadata?.basic || {}
      filtered.push({
        id: row.id,
        name: (basic.name as string) || 'Activity',
        avatar: basic.avatar as string | undefined,
        emoji: basic.emoji as string | undefined,
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
