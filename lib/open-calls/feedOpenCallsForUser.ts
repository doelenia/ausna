import type { Note } from '@/types/note'
import { enrichNotesWithAuthorProfiles } from '@/app/main/actions'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import type { NoteWithDigestPortfolio } from '@/lib/email/digestAssignedPortfolio'
import { attachDigestPortfoliosToNotes } from '@/lib/email/digestAssignedPortfolio'

/** `first_project_name` kept for API/clients; prefer `digestAssignedPortfolio` when present. */
export type FeedOpenCallNote = NoteWithDigestPortfolio & { first_project_name?: string }

async function getFriendIds(userId: string, supabase: any): Promise<string[]> {
  const { data: friendships } = await supabase
    .from('friends')
    .select('user_id, friend_id, status')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)

  const friendIds: string[] = []
  friendships?.forEach((friendship: any) => {
    if (friendship.status === 'accepted') {
      if (friendship.user_id === userId) {
        friendIds.push(friendship.friend_id)
      } else {
        friendIds.push(friendship.user_id)
      }
    }
  })
  return friendIds
}

async function getSubscribedPortfolioIds(userId: string, supabase: any): Promise<string[]> {
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('portfolio_id')
    .eq('user_id', userId)
  return (subscriptions || []).map((sub: any) => sub.portfolio_id)
}

async function getMemberPortfolioIds(userId: string, supabase: any): Promise<string[]> {
  const { data: ownedPortfolios } = await supabase
    .from('portfolios')
    .select('id')
    .eq('user_id', userId)
  const ownedIds = (ownedPortfolios || []).map((p: any) => p.id)
  const { data: allPortfolios } = await supabase
    .from('portfolios')
    .select('id, metadata')
    .in('type', ['projects', 'community'])
  const memberIds: string[] = []
  allPortfolios?.forEach((p: any) => {
    const metadata = p.metadata as any
    const members = metadata?.members || []
    if (Array.isArray(members) && members.includes(userId)) {
      memberIds.push(p.id)
    }
  })
  return Array.from(new Set([...ownedIds, ...memberIds]))
}

async function getUserCommunitiesMap(
  userId: string,
  supabase: any
): Promise<Map<string, { id: string; name: string; members: string[] }>> {
  const { data: allCommunities } = await supabase
    .from('portfolios')
    .select('id, user_id, metadata')
    .eq('type', 'community')
  const communitiesMap = new Map<string, { id: string; name: string; members: string[] }>()
  allCommunities?.forEach((community: any) => {
    const metadata = community.metadata as any
    const members = metadata?.members || []
    const isUserMember =
      community.user_id === userId || (Array.isArray(members) && members.includes(userId))
    if (isUserMember) {
      const basic = getPortfolioBasic(community as any)
      communitiesMap.set(community.id, {
        id: community.id,
        name: basic.name,
        members: [community.user_id, ...(Array.isArray(members) ? members : [])],
      })
    }
  })
  return communitiesMap
}

async function getAllCommunityMemberIds(userId: string, supabase: any): Promise<string[]> {
  const communitiesMap = await getUserCommunitiesMap(userId, supabase)
  const allMemberIds: string[] = []
  communitiesMap.forEach((community) => {
    allMemberIds.push(...community.members)
  })
  return Array.from(new Set(allMemberIds))
}

function sortOpenCallsForFeed(
  notes: any[],
  userId: string,
  options: { unviewedOnly: boolean }
): any[] {
  let list = [...notes]

  if (options.unviewedOnly) {
    list = list.filter((note: any) => {
      const meta = note.metadata as any
      const viewedBy: string[] = Array.isArray(meta?.viewed_by) ? meta.viewed_by : []
      return !viewedBy.includes(userId)
    })
    list.sort((a: any, b: any) => {
      const metaA = a.metadata as any
      const metaB = b.metadata as any
      const endA = metaA?.end_date ? new Date(metaA.end_date).getTime() : Infinity
      const endB = metaB?.end_date ? new Date(metaB.end_date).getTime() : Infinity
      return endA - endB
    })
  } else {
    list.sort((a: any, b: any) => {
      const metaA = a.metadata as any
      const metaB = b.metadata as any
      const viewedA = Array.isArray(metaA?.viewed_by) && metaA.viewed_by.includes(userId)
      const viewedB = Array.isArray(metaB?.viewed_by) && metaB.viewed_by.includes(userId)
      if (viewedA !== viewedB) {
        return viewedA ? 1 : -1
      }
      const endA = metaA?.end_date ? new Date(metaA.end_date).getTime() : Infinity
      const endB = metaB?.end_date ? new Date(metaB.end_date).getTime() : Infinity
      return endA - endB
    })
  }

  return list
}

/**
 * Feed-context open calls: same visibility rules as GET /api/open-calls?context=feed.
 */
export async function getFeedOpenCallsForUserId(
  supabase: any,
  userId: string,
  options: {
    limit: number
    unviewedOnly?: boolean
    /** DB fetch = limit * multiplier (default 5), min 50 */
    poolFetchMultiplier?: number
  }
): Promise<{
  openCalls: FeedOpenCallNote[]
  totalMatching: number
  hasMore: boolean
  error?: string
}> {
  const { limit, unviewedOnly = false } = options
  const mult = options.poolFetchMultiplier ?? 5
  const poolLimit = Math.min(Math.max(limit * mult, 50), 500)

  const now = new Date().toISOString()

  const [friendIds, subscribedPortfolioIds, memberPortfolioIds, communityMemberIds] =
    await Promise.all([
      getFriendIds(userId, supabase),
      getSubscribedPortfolioIds(userId, supabase),
      getMemberPortfolioIds(userId, supabase),
      getAllCommunityMemberIds(userId, supabase),
    ])

  const allUserIds = Array.from(new Set([...friendIds, ...communityMemberIds]))
  const allPortfolioIds = Array.from(new Set([...subscribedPortfolioIds, ...memberPortfolioIds]))

  if (allUserIds.length === 0 && allPortfolioIds.length === 0) {
    return { openCalls: [], totalMatching: 0, hasMore: false }
  }

  const { data: notes, error } = await supabase
    .from('notes')
    .select('*')
    .eq('type', 'open_call')
    .is('deleted_at', null)
    .is('mentioned_note_id', null)
    .order('created_at', { ascending: false })
    .limit(poolLimit)

  if (error) {
    return {
      openCalls: [],
      totalMatching: 0,
      hasMore: false,
      error: error.message || 'Failed to fetch open calls',
    }
  }

  let candidateNotes: any[] = (notes || []).filter((note: any) => {
    const noteOwnerId = note.owner_account_id
    const assignedPortfolios = note.assigned_portfolios || []
    const collaboratorIds = (note.collaborator_account_ids || []) as string[]
    const isCollaborator = collaboratorIds.includes(userId)
    const isOwnerVisible = allUserIds.includes(noteOwnerId)
    const isAssignedToVisiblePortfolio = assignedPortfolios.some((pid: string) =>
      allPortfolioIds.includes(pid)
    )
    return isOwnerVisible || isAssignedToVisiblePortfolio || isCollaborator
  })

  const nonExpired = candidateNotes.filter((note: any) => {
    const meta = note.metadata as any
    const endDate = meta?.end_date
    if (!endDate) return true
    return endDate > now
  })

  const sorted = sortOpenCallsForFeed(nonExpired, userId, { unviewedOnly })
  const totalMatching = sorted.length
  const page = sorted.slice(0, limit)
  const hasMore = totalMatching > limit

  const normalizedNotes: Note[] = page.map((note: any) => ({
    ...note,
    references: Array.isArray(note.references) ? note.references : [],
  }))

  const enrichedNotes = await enrichNotesWithAuthorProfiles(normalizedNotes, supabase, userId)
  const withBanners = await attachDigestPortfoliosToNotes(supabase, enrichedNotes)
  const openCalls: FeedOpenCallNote[] = withBanners.map((n) => ({
    ...n,
    first_project_name: n.digestAssignedPortfolio?.name,
  }))

  return { openCalls, totalMatching, hasMore }
}
