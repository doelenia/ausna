'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { Note } from '@/types/note'
import {
  createBloomFilter,
  deserializeBloomFilter,
  serializeBloomFilter,
  markNotesAsSeen,
} from '@/lib/feed/bloom-filter'
import { Portfolio, isCommunityPortfolio } from '@/types/portfolio'
import { NoteSource } from '@/types/note'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'

export type FeedType = 'all' | 'friends' | 'community'

interface GetFeedNotesResult {
  success: boolean
  notes?: Note[]
  hasMore?: boolean
  error?: string
}

export type FeedItem =
  | {
      kind: 'note'
      created_at: string
      note: Note
    }
  | {
      kind: 'portfolio_created'
      created_at: string
      portfolio: Portfolio
      creator_profile: AuthorProfile
    }

interface GetFeedItemsResult {
  success: boolean
  items?: FeedItem[]
  hasMore?: boolean
  error?: string
}

interface GetUserCommunitiesResult {
  success: boolean
  communities?: Array<{ id: string; name: string; slug: string }>
  error?: string
}

export type AuthorProfile = { id: string; name: string; avatar?: string | null }

/**
 * Enrich notes with author_profiles (owner + collaborators) for immediate avatar/name display.
 * Avoids client-side fetch delay so collaborator avatars show on first paint.
 */
export async function enrichNotesWithAuthorProfiles(
  notes: any[],
  supabase: Awaited<ReturnType<typeof createClient>>,
  currentUserId?: string | null
): Promise<any[]> {
  if (!notes.length) return notes

  const userIds = new Set<string>()
  notes.forEach((note: any) => {
    if (note.owner_account_id) userIds.add(note.owner_account_id)
    ;(note.collaborator_account_ids || []).forEach((id: string) => userIds.add(id))
  })
  const ids = Array.from(userIds)
  if (ids.length === 0) return notes

  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('*')
    .eq('type', 'human')
    .in('user_id', ids)

  const profileByUserId = new Map<string, AuthorProfile>()
  ;(portfolios || []).forEach((p: Portfolio) => {
    const basic = getPortfolioBasic(p)
    profileByUserId.set(p.user_id, {
      id: p.user_id,
      name: currentUserId && p.user_id === currentUserId ? 'You' : basic.name,
      avatar: basic.avatar,
    })
  })

  return notes.map((note: any) => {
    const authorIds = [note.owner_account_id, ...(note.collaborator_account_ids || [])]
    const author_profiles: AuthorProfile[] = authorIds.map((userId: string) => {
      const p = profileByUserId.get(userId)
      return p || { id: userId, name: `User ${userId.slice(0, 8)}`, avatar: null }
    })
    return { ...note, author_profiles }
  })
}

export async function enrichPortfoliosWithCreatorProfiles(
  portfolios: any[],
  supabase: Awaited<ReturnType<typeof createClient>>,
  currentUserId?: string | null
): Promise<Array<{ portfolio: Portfolio; creator_profile: AuthorProfile }>> {
  if (!portfolios.length) return []

  const userIds = Array.from(new Set(portfolios.map((p: any) => String(p.user_id)).filter(Boolean)))
  const { data: humanPortfolios } = await supabase
    .from('portfolios')
    .select('*')
    .eq('type', 'human')
    .in('user_id', userIds)

  const profileByUserId = new Map<string, AuthorProfile>()
  ;(humanPortfolios || []).forEach((p: Portfolio) => {
    const basic = getPortfolioBasic(p)
    profileByUserId.set(p.user_id, {
      id: p.user_id,
      name: currentUserId && p.user_id === currentUserId ? 'You' : basic.name,
      avatar: basic.avatar,
    })
  })

  return (portfolios as Portfolio[]).map((p: Portfolio) => {
    const profile =
      profileByUserId.get(p.user_id) || {
        id: p.user_id,
        name: `User ${String(p.user_id).slice(0, 8)}`,
        avatar: null,
      }
    return { portfolio: p, creator_profile: profile }
  })
}

function portfolioIsPublicOrNull(p: any) {
  const v = (p as any)?.visibility
  return v === undefined || v === null || v === 'public'
}

interface MarkNotesAsSeenResult {
  success: boolean
  error?: string
}

/**
 * Get or create bloom filter for user
 */
async function getOrCreateBloomFilter(userId: string) {
  const supabase = await createClient()

  // Try to get existing bloom filter
  const { data: feedState, error } = await supabase
    .from('user_feed_state')
    .select('bloom_filter_data')
    .eq('user_id', userId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    // PGRST116 is "not found" which is fine
    console.error('Error fetching feed state:', error)
  }

  let bloomFilter = createBloomFilter()

  if (feedState?.bloom_filter_data) {
    try {
      bloomFilter = deserializeBloomFilter(feedState.bloom_filter_data as any)
    } catch (err) {
      console.error('Error deserializing bloom filter, creating new one:', err)
      bloomFilter = createBloomFilter()
    }
  }

  return { bloomFilter, supabase }
}

/**
 * Save bloom filter to database
 */
async function saveBloomFilter(
  supabase: any,
  userId: string,
  bloomFilter: any
) {
  const serialized = serializeBloomFilter(bloomFilter)

  const { error } = await supabase
    .from('user_feed_state')
    .upsert(
      {
        user_id: userId,
        bloom_filter_data: serialized,
        last_updated: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      }
    )

  if (error) {
    console.error('Error saving bloom filter:', error)
  }
}

/**
 * Get friend IDs for a user
 */
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

/**
 * Get subscribed portfolio IDs for a user
 */
async function getSubscribedPortfolioIds(
  userId: string,
  supabase: any
): Promise<string[]> {
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('portfolio_id')
    .eq('user_id', userId)

  return (subscriptions || []).map((sub: any) => sub.portfolio_id)
}

/**
 * Get portfolio IDs where user is a member
 */
async function getMemberPortfolioIds(
  userId: string,
  supabase: any
): Promise<string[]> {
  // Get portfolios where user is owner
  const { data: ownedPortfolios } = await supabase
    .from('portfolios')
    .select('id')
    .eq('user_id', userId)

  const ownedIds = (ownedPortfolios || []).map((p: any) => p.id)

  // Get all project and community portfolios
  const { data: allPortfolios } = await supabase
    .from('portfolios')
    .select('id, metadata')
    .in('type', ['projects', 'community'])

  // Filter portfolios where user is a member
  const memberIds: string[] = []
  allPortfolios?.forEach((p: any) => {
    const metadata = p.metadata as any
    const members = metadata?.members || []
    if (Array.isArray(members) && members.includes(userId)) {
      memberIds.push(p.id)
    }
  })

  // Combine and remove duplicates
  return Array.from(new Set([...ownedIds, ...memberIds]))
}

/**
 * Get community member IDs for a specific community
 */
async function getCommunityMemberIds(
  communityId: string,
  supabase: any
): Promise<string[]> {
  const { data: community } = await supabase
    .from('portfolios')
    .select('user_id, metadata')
    .eq('id', communityId)
    .eq('type', 'community')
    .maybeSingle()

  if (!community) {
    return []
  }

  const memberIds: string[] = [community.user_id] // Owner is always a member

  const metadata = community.metadata as any
  const members = metadata?.members || []
  if (Array.isArray(members)) {
    memberIds.push(...members)
  }

  return Array.from(new Set(memberIds))
}

/**
 * Get all communities where user is a member (for "all" feed)
 * Returns map of community ID to community info
 */
async function getUserCommunitiesMap(
  userId: string,
  supabase: any
): Promise<Map<string, { id: string; name: string; members: string[] }>> {
  // Get all communities where user is a member
  const { data: allCommunities } = await supabase
    .from('portfolios')
    .select('id, user_id, metadata')
    .eq('type', 'community')

  const communitiesMap = new Map<string, { id: string; name: string; members: string[] }>()

  allCommunities?.forEach((community: any) => {
    const metadata = community.metadata as any
    const members = metadata?.members || []
    const isUserMember =
      community.user_id === userId ||
      (Array.isArray(members) && members.includes(userId))

    if (isUserMember) {
      const basic = getPortfolioBasic(community as Portfolio)
      communitiesMap.set(community.id, {
        id: community.id,
        name: basic.name,
        members: [community.user_id, ...(Array.isArray(members) ? members : [])],
      })
    }
  })

  return communitiesMap
}

/**
 * Get all community member IDs (for "all" feed)
 */
async function getAllCommunityMemberIds(
  userId: string,
  supabase: any
): Promise<string[]> {
  const communitiesMap = await getUserCommunitiesMap(userId, supabase)
  const allMemberIds: string[] = []

  communitiesMap.forEach((community) => {
    allMemberIds.push(...community.members)
  })

  return Array.from(new Set(allMemberIds))
}

/**
 * Determine note source for "all" feed
 * Priority: 1. self (show nothing), 2. friend, 3. subscribed, 4. community
 */
async function determineNoteSource(
  note: any,
  userId: string,
  friendIds: string[],
  communitiesMap: Map<string, { id: string; name: string; members: string[] }>,
  subscribedPortfolioIds: string[],
  supabase: any
): Promise<NoteSource> {
  const noteOwnerId = note.owner_account_id

  // Priority 1: Self - show nothing (return null)
  if (noteOwnerId === userId) {
    return null
  }

  // Priority 2: Friend
  if (friendIds.includes(noteOwnerId)) {
    return { type: 'friend' }
  }

  // Priority 3: Subscribed portfolio
  const assignedPortfolios = note.assigned_portfolios || []
  if (assignedPortfolios.some((pid: string) => subscribedPortfolioIds.includes(pid))) {
    return { type: 'subscribed' }
  }

  // Priority 4: Community member
  for (const [communityId, community] of communitiesMap.entries()) {
    if (community.members.includes(noteOwnerId)) {
      return {
        type: 'community',
        communityName: community.name,
        communityId: community.id,
      }
    }
  }

  return null
}

/**
 * Get feed notes based on feed type
 */
export async function getFeedNotes(
  feedType: FeedType,
  communityId: string | null = null,
  offset: number = 0,
  limit: number = 10
): Promise<GetFeedNotesResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // For logged-out users, return 5 most recent PUBLIC notes
    if (!user) {
      const publicLimit = 5
      const { data: notes, error } = await supabase
        .from('notes')
        .select('*')
        .is('deleted_at', null)
        .is('mentioned_note_id', null) // Exclude annotations
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(publicLimit)

      if (error) {
        return {
          success: false,
          error: error.message || 'Failed to fetch notes',
        }
      }

      const notesWithReferences: Note[] = (notes || []).map((note: any) => ({
        ...note,
        references: Array.isArray(note.references) ? note.references : [],
      }))
      const enriched = await enrichNotesWithAuthorProfiles(notesWithReferences, supabase, null)
      return {
        success: true,
        notes: enriched,
        hasMore: false, // No more notes for logged-out users
      }
    }

    // For logged-in users, use existing logic
    // We paginate by created_at (stable ordering) for logged-in users.
    // Fetch `limit + 1` so we can compute hasMore reliably.
    const rangeStart = Math.max(0, offset)
    const rangeEnd = rangeStart + limit // inclusive: yields limit+1 rows when available

    // Base query for logged-in users; feeds should only surface PUBLIC notes.
    let notesQuery = supabase
      .from('notes')
      .select('*')
      .is('deleted_at', null)
      .is('mentioned_note_id', null) // Exclude annotations
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .range(rangeStart, rangeEnd)

    if (feedType === 'friends') {
      // Get notes from friends (owner in friendIds) or where current user is collaborator
      const friendIds = await getFriendIds(user.id, supabase)
      // Fetch in three parts:
      // - notes by friends (public + friends-only)
      // - notes by current user (so authors can see their own friends-only notes)
      // - notes where current user is a collaborator
      const [byOwner, bySelf, byCollaborator] = await Promise.all([
        friendIds.length > 0
          ? supabase
              .from('notes')
              .select('*')
              .is('deleted_at', null)
              .is('mentioned_note_id', null)
              .in('visibility', ['public', 'friends'])
              .in('owner_account_id', friendIds)
              .order('created_at', { ascending: false })
              .range(rangeStart, rangeEnd)
          : { data: [], error: null },
        supabase
          .from('notes')
          .select('*')
          .is('deleted_at', null)
          .is('mentioned_note_id', null)
          .in('visibility', ['public', 'friends'])
          .eq('owner_account_id', user.id)
          .order('created_at', { ascending: false })
          .range(rangeStart, rangeEnd),
        supabase
          .from('notes')
          .select('*')
          .is('deleted_at', null)
          .is('mentioned_note_id', null)
          .eq('visibility', 'public')
          .contains('collaborator_account_ids', [user.id])
          .order('created_at', { ascending: false })
          .limit(rangeEnd - rangeStart + 1),
      ])
      const byOwnerData = byOwner.data || []
      const bySelfData = bySelf.data || []
      const byCollabData = byCollaborator.data || []
      const merged = [...byOwnerData, ...bySelfData]
      const seen = new Set(byOwnerData.map((n: any) => n.id))
      bySelfData.forEach((n: any) => {
        if (!seen.has(n.id)) {
          seen.add(n.id)
        }
      })
      byCollabData.forEach((n: any) => {
        if (!seen.has(n.id)) {
          seen.add(n.id)
          merged.push(n)
        }
      })
      merged.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const pageNotes = merged.slice(0, limit)
      const hasMore = merged.length > limit
      const notesWithReferences: Note[] = pageNotes.map((note: any) => ({
        ...note,
        references: Array.isArray(note.references) ? note.references : [],
      }))
      const enriched = await enrichNotesWithAuthorProfiles(notesWithReferences, supabase, user.id)
      return { success: true, notes: enriched, hasMore }
    } else if (feedType === 'community') {
      // Get notes from community members
      if (!communityId) {
        return {
          success: false,
          error: 'communityId is required for community feed',
        }
      }
      const memberIds = await getCommunityMemberIds(communityId, supabase)
      if (memberIds.length === 0) {
        return { success: true, notes: [], hasMore: false }
      }
      notesQuery = notesQuery.in('owner_account_id', memberIds)
    } else {
      // "all" feed: friends + community members + subscribed portfolios + member portfolios
      const friendIds = await getFriendIds(user.id, supabase)
      const communitiesMap = await getUserCommunitiesMap(user.id, supabase)
      const communityMemberIds = await getAllCommunityMemberIds(user.id, supabase)
      const subscribedPortfolioIds = await getSubscribedPortfolioIds(
        user.id,
        supabase
      )
      const memberPortfolioIds = await getMemberPortfolioIds(user.id, supabase)

      // Combine all relevant user IDs (for "owner is visible")
      const allUserIds = Array.from(
        new Set([...friendIds, ...communityMemberIds])
      )

      // For portfolio-based notes, we need to check if any assigned_portfolio matches.
      // Since Supabase doesn't support array overlap directly, we'll fetch a pool and filter.
      const allPortfolioIds = Array.from(
        new Set([...subscribedPortfolioIds, ...memberPortfolioIds])
      )

      if (allUserIds.length === 0 && allPortfolioIds.length === 0) {
        // No friends, no communities, no portfolios
        return { success: true, notes: [], hasMore: false }
      }

      // Pool size increases as offset grows; cap to keep response time predictable.
      const poolTarget = offset + limit + 1
      const poolLimit = Math.min(Math.max(poolTarget * 2, 50), 200)

      // Fetch user-based notes (friends/community members) - PUBLIC only
      let userNotes: any[] = []
      let userNotesMaybeMore = false
      if (allUserIds.length > 0) {
        const { data: userNotesData, error: userError } = await supabase
          .from('notes')
          .select('*')
          .is('deleted_at', null)
          .is('mentioned_note_id', null)
          .eq('visibility', 'public')
          .in('owner_account_id', allUserIds)
          .order('created_at', { ascending: false })
          .limit(poolLimit)

        if (userError) {
          return {
            success: false,
            error: userError.message || 'Failed to fetch notes',
          }
        }

        userNotes = userNotesData || []
        userNotesMaybeMore = (userNotesData || []).length >= poolLimit
      }

      // Also fetch notes where current user is collaborator (treat as creator in feed)
      let collaboratorNotes: any[] = []
      const { data: collabNotesData } = await supabase
        .from('notes')
        .select('*')
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .eq('visibility', 'public')
        .contains('collaborator_account_ids', [user.id])
        .order('created_at', { ascending: false })
        .limit(poolLimit)
      collaboratorNotes = collabNotesData || []

      // Also fetch notes assigned to portfolios - PUBLIC only
      let portfolioNotes: any[] = []
      let portfolioNotesMaybeMore = false
      if (allPortfolioIds.length > 0) {
        // Fetch notes that have any of these portfolios in assigned_portfolios
        const { data: portfolioNotesData, error: portfolioError } =
          await supabase
            .from('notes')
            .select('*')
            .is('deleted_at', null)
            .is('mentioned_note_id', null) // Exclude annotations
            .eq('visibility', 'public')
            .order('created_at', { ascending: false })
            .limit(poolLimit)

        if (!portfolioError && portfolioNotesData) {
          // Filter notes that have any assigned portfolio in our list
          portfolioNotes = portfolioNotesData.filter((note: any) => {
            const assigned = note.assigned_portfolios || []
            return assigned.some((pid: string) =>
              allPortfolioIds.includes(pid)
            )
          })
          portfolioNotesMaybeMore = portfolioNotesData.length >= poolLimit
        }
      }

      // Combine and deduplicate (user notes + collaborator notes + portfolio notes)
      const allNotesMap = new Map<string, any>()
      ;(userNotes || []).forEach((note: any) => {
        allNotesMap.set(note.id, note)
      })
      collaboratorNotes.forEach((note: any) => {
        allNotesMap.set(note.id, note)
      })
      portfolioNotes.forEach((note: any) => {
        allNotesMap.set(note.id, note)
      })

      // Final validation: ensure each note meets at least one visibility criteria
      const validatedNotes = Array.from(allNotesMap.values()).filter((note: any) => {
        const noteOwnerId = note.owner_account_id
        const assignedPortfolios = note.assigned_portfolios || []
        const collaboratorIds = (note.collaborator_account_ids || []) as string[]
        const isCollaborator = collaboratorIds.includes(user.id)

        // Check if note owner is a friend or community member
        const isOwnerVisible = allUserIds.includes(noteOwnerId)

        // Check if note is assigned to a portfolio the user subscribes to or is a member of
        const isAssignedToVisiblePortfolio = assignedPortfolios.some((pid: string) =>
          allPortfolioIds.includes(pid)
        )

        // Collaborators see the note in their feed (treated as creator)
        return isOwnerVisible || isAssignedToVisiblePortfolio || isCollaborator
      })

      const sortedAllNotes = validatedNotes.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      const pageNotes = sortedAllNotes.slice(offset, offset + limit)

      // Determine source for each note in the page and add to note object
      const notesWithSource = await Promise.all(
        pageNotes.map(async (note: any) => {
          const source = await determineNoteSource(
            note,
            user.id,
            friendIds,
            communitiesMap,
            subscribedPortfolioIds,
            supabase
          )
          return {
            ...note,
            feedSource: source,
          }
        })
      )

      // Ensure references is an array
      const notesWithReferences: Note[] = notesWithSource.map((note: any) => ({
        ...note,
        references: Array.isArray(note.references) ? note.references : [],
      }))
      const enriched = await enrichNotesWithAuthorProfiles(notesWithReferences, supabase, user.id)

      const hasMore =
        sortedAllNotes.length > offset + limit ||
        userNotesMaybeMore ||
        portfolioNotesMaybeMore

      return {
        success: true,
        notes: enriched,
        hasMore,
      }
    }

    // For friends and community feeds
    const { data: notes, error } = await notesQuery

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to fetch notes',
      }
    }

    if (!notes || notes.length === 0) {
      return { success: true, notes: [], hasMore: false }
    }

    const pageNotes = (notes || []).slice(0, limit)
    const hasMore = (notes || []).length > limit

    // Ensure references is an array
    const notesWithReferences: Note[] = pageNotes.map((note: any) => ({
      ...note,
      references: Array.isArray(note.references) ? note.references : [],
    }))
    const enriched = await enrichNotesWithAuthorProfiles(notesWithReferences, supabase, user.id)

    return {
      success: true,
      notes: enriched,
      hasMore,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Get feed items (notes + portfolio creations) based on feed type.
 * Items are sorted by created_at desc and paginated over the merged stream.
 */
export async function getFeedItems(
  feedType: FeedType,
  communityId: string | null = null,
  offset: number = 0,
  limit: number = 10
): Promise<GetFeedItemsResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Logged-out users: keep existing behavior (public notes only)
    if (!user) {
      const publicLimit = 5
      const { data: notes, error } = await supabase
        .from('notes')
        .select('*')
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(publicLimit)

      if (error) {
        return { success: false, error: error.message || 'Failed to fetch notes' }
      }

      const normalized: Note[] = (notes || []).map((note: any) => ({
        ...note,
        references: Array.isArray(note.references) ? note.references : [],
      }))
      const enriched = await enrichNotesWithAuthorProfiles(normalized, supabase, null)
      return {
        success: true,
        items: (enriched || []).map((note: any) => ({
          kind: 'note' as const,
          created_at: note.created_at,
          note,
        })),
        hasMore: false,
      }
    }

    const poolTarget = offset + limit + 1
    const poolLimit = Math.min(Math.max(poolTarget * 2, 50), 200)

    const portfolioTypes: Array<'projects' | 'activities' | 'community'> = [
      'projects',
      'activities',
      'community',
    ]

    if (feedType === 'friends') {
      const friendIds = await getFriendIds(user.id, supabase)

      const [byOwner, byCollaborator, portfoliosRes] = await Promise.all([
        friendIds.length > 0
          ? supabase
              .from('notes')
              .select('*')
              .is('deleted_at', null)
              .is('mentioned_note_id', null)
              .eq('visibility', 'public')
              .in('owner_account_id', friendIds)
              .order('created_at', { ascending: false })
              .limit(poolLimit)
          : { data: [], error: null },
        supabase
          .from('notes')
          .select('*')
          .is('deleted_at', null)
          .is('mentioned_note_id', null)
          .eq('visibility', 'public')
          .contains('collaborator_account_ids', [user.id])
          .order('created_at', { ascending: false })
          .limit(poolLimit),
        friendIds.length > 0
          ? supabase
              .from('portfolios')
              .select('*')
              .in('type', portfolioTypes)
              .in('user_id', friendIds)
              .order('created_at', { ascending: false })
              .limit(poolLimit)
          : { data: [], error: null },
      ])

      const notesMap = new Map<string, any>()
      ;(byOwner.data || []).forEach((n: any) => notesMap.set(n.id, n))
      ;(byCollaborator.data || []).forEach((n: any) => notesMap.set(n.id, n))

      const notesList = Array.from(notesMap.values()).map((note: any) => ({
        ...note,
        references: Array.isArray(note.references) ? note.references : [],
      })) as Note[]

      const enrichedNotes = await enrichNotesWithAuthorProfiles(notesList, supabase, user.id)

      const rawPortfolios = ((portfoliosRes as any)?.data || []).filter(portfolioIsPublicOrNull)
      const enrichedPortfolios = await enrichPortfoliosWithCreatorProfiles(rawPortfolios, supabase, user.id)

      const merged: FeedItem[] = [
        ...((enrichedNotes || []) as any[]).map((note: any) => ({
          kind: 'note' as const,
          created_at: note.created_at,
          note,
        })),
        ...enrichedPortfolios.map(({ portfolio, creator_profile }) => ({
          kind: 'portfolio_created' as const,
          created_at: portfolio.created_at,
          portfolio,
          creator_profile,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      const page = merged.slice(offset, offset + limit)
      const hasMore = merged.length > offset + limit
      return { success: true, items: page, hasMore }
    }

    if (feedType === 'community') {
      if (!communityId) {
        return { success: false, error: 'communityId is required for community feed' }
      }
      const memberIds = await getCommunityMemberIds(communityId, supabase)
      if (memberIds.length === 0) {
        return { success: true, items: [], hasMore: false }
      }

      const [notesRes, portfoliosRes] = await Promise.all([
        supabase
          .from('notes')
          .select('*')
          .is('deleted_at', null)
          .is('mentioned_note_id', null)
          .eq('visibility', 'public')
          .in('owner_account_id', memberIds)
          .order('created_at', { ascending: false })
          .limit(poolLimit),
        supabase
          .from('portfolios')
          .select('*')
          .in('type', portfolioTypes)
          .in('user_id', memberIds)
          .order('created_at', { ascending: false })
          .limit(poolLimit),
      ])

      const notesList: Note[] = (notesRes.data || []).map((note: any) => ({
        ...note,
        references: Array.isArray(note.references) ? note.references : [],
      }))
      const enrichedNotes = await enrichNotesWithAuthorProfiles(notesList, supabase, user.id)

      const rawPortfolios = ((portfoliosRes as any)?.data || []).filter(portfolioIsPublicOrNull)
      const enrichedPortfolios = await enrichPortfoliosWithCreatorProfiles(rawPortfolios, supabase, user.id)

      const merged: FeedItem[] = [
        ...((enrichedNotes || []) as any[]).map((note: any) => ({
          kind: 'note' as const,
          created_at: note.created_at,
          note,
        })),
        ...enrichedPortfolios.map(({ portfolio, creator_profile }) => ({
          kind: 'portfolio_created' as const,
          created_at: portfolio.created_at,
          portfolio,
          creator_profile,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      const page = merged.slice(offset, offset + limit)
      const hasMore = merged.length > offset + limit
      return { success: true, items: page, hasMore }
    }

    // "all" feed: reuse existing visibility logic for notes; add portfolio creations by friends/community members.
    const friendIds = await getFriendIds(user.id, supabase)
    const communitiesMap = await getUserCommunitiesMap(user.id, supabase)
    const communityMemberIds = await getAllCommunityMemberIds(user.id, supabase)
    const subscribedPortfolioIds = await getSubscribedPortfolioIds(user.id, supabase)
    const memberPortfolioIds = await getMemberPortfolioIds(user.id, supabase)

    const allUserIds = Array.from(new Set([user.id, ...friendIds, ...communityMemberIds]))
    const allPortfolioIds = Array.from(new Set([...subscribedPortfolioIds, ...memberPortfolioIds]))

    if (allUserIds.length === 0 && allPortfolioIds.length === 0) {
      return { success: true, items: [], hasMore: false }
    }

    // Notes pool
    let userNotes: any[] = []
    let userNotesMaybeMore = false
    if (allUserIds.length > 0) {
      const { data: userNotesData } = await supabase
        .from('notes')
        .select('*')
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .eq('visibility', 'public')
        .in('owner_account_id', allUserIds)
        .order('created_at', { ascending: false })
        .limit(poolLimit)
      userNotes = userNotesData || []
      userNotesMaybeMore = (userNotesData || []).length >= poolLimit
    }

    const { data: collabNotesData } = await supabase
      .from('notes')
      .select('*')
      .is('deleted_at', null)
      .is('mentioned_note_id', null)
      .eq('visibility', 'public')
      .contains('collaborator_account_ids', [user.id])
      .order('created_at', { ascending: false })
      .limit(poolLimit)
    const collaboratorNotes = collabNotesData || []

    let portfolioNotes: any[] = []
    let portfolioNotesMaybeMore = false
    if (allPortfolioIds.length > 0) {
      const { data: portfolioNotesData, error: portfolioError } = await supabase
        .from('notes')
        .select('*')
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(poolLimit)
      if (!portfolioError && portfolioNotesData) {
        portfolioNotes = portfolioNotesData.filter((note: any) => {
          const assigned = note.assigned_portfolios || []
          return assigned.some((pid: string) => allPortfolioIds.includes(pid))
        })
        portfolioNotesMaybeMore = portfolioNotesData.length >= poolLimit
      }
    }

    const allNotesMap = new Map<string, any>()
    ;(userNotes || []).forEach((note: any) => allNotesMap.set(note.id, note))
    collaboratorNotes.forEach((note: any) => allNotesMap.set(note.id, note))
    portfolioNotes.forEach((note: any) => allNotesMap.set(note.id, note))

    const validatedNotes = Array.from(allNotesMap.values()).filter((note: any) => {
      const noteOwnerId = note.owner_account_id
      const assignedPortfolios = note.assigned_portfolios || []
      const collaboratorIds = (note.collaborator_account_ids || []) as string[]
      const isCollaborator = collaboratorIds.includes(user.id)
      const isOwnerVisible = allUserIds.includes(noteOwnerId)
      const isAssignedToVisiblePortfolio = assignedPortfolios.some((pid: string) => allPortfolioIds.includes(pid))
      return isOwnerVisible || isAssignedToVisiblePortfolio || isCollaborator
    })

    const sortedNotesPool = validatedNotes.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    // Portfolios created by visible users
    const { data: portfoliosData } = await supabase
      .from('portfolios')
      .select('*')
      .in('type', portfolioTypes)
      .in('user_id', allUserIds)
      .order('created_at', { ascending: false })
      .limit(poolLimit)
    const rawPortfolios = (portfoliosData || []).filter(portfolioIsPublicOrNull)
    const enrichedPortfolios = await enrichPortfoliosWithCreatorProfiles(rawPortfolios, supabase, user.id)

    // Merge pools
    const mergedPool: FeedItem[] = [
      ...sortedNotesPool.map((note: any) => ({
        kind: 'note' as const,
        created_at: note.created_at,
        note: {
          ...note,
          references: Array.isArray(note.references) ? note.references : [],
        } as Note,
      })),
      ...enrichedPortfolios.map(({ portfolio, creator_profile }) => ({
        kind: 'portfolio_created' as const,
        created_at: portfolio.created_at,
        portfolio,
        creator_profile,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const page = mergedPool.slice(offset, offset + limit)

    // Enrich only notes in the final page (author profiles + source)
    const pageNotes = page.filter((i) => i.kind === 'note').map((i: any) => i.note)
    const notesWithSource = await Promise.all(
      pageNotes.map(async (note: any) => {
        const source = await determineNoteSource(
          note,
          user.id,
          friendIds,
          communitiesMap,
          subscribedPortfolioIds,
          supabase
        )
        return { ...note, feedSource: source }
      })
    )
    const enrichedNotes = await enrichNotesWithAuthorProfiles(notesWithSource, supabase, user.id)
    const enrichedById = new Map<string, any>()
    ;(enrichedNotes || []).forEach((n: any) => enrichedById.set(n.id, n))

    const finalPage: FeedItem[] = page.map((item) => {
      if (item.kind !== 'note') return item
      const enriched = enrichedById.get((item as any).note.id) || (item as any).note
      return { ...item, note: enriched }
    })

    const hasMore =
      mergedPool.length > offset + limit ||
      userNotesMaybeMore ||
      portfolioNotesMaybeMore

    return { success: true, items: finalPage, hasMore }
  } catch (error: any) {
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

/**
 * Mark notes as seen (update bloom filter)
 */
export async function markNotesAsSeenAction(
  noteIds: string[]
): Promise<MarkNotesAsSeenResult> {
  try {
    const { user, supabase } = await requireAuth()

    if (!noteIds || noteIds.length === 0) {
      return { success: true }
    }

    const { bloomFilter } = await getOrCreateBloomFilter(user.id)

    // Mark notes as seen
    markNotesAsSeen(bloomFilter, noteIds)

    // Save updated bloom filter
    await saveBloomFilter(supabase, user.id, bloomFilter)

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Get all communities the user is a member of
 */
export async function getUserCommunities(): Promise<GetUserCommunitiesResult> {
  try {
    const { user, supabase } = await requireAuth()

    // Get all community portfolios
    const { data: allCommunities, error } = await supabase
      .from('portfolios')
      .select('id, user_id, slug, metadata')
      .eq('type', 'community')
      .order('created_at', { ascending: false })

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to fetch communities',
      }
    }

    // Filter communities where user is a member
    const userCommunities: Array<{ id: string; name: string; slug: string }> =
      []

    allCommunities?.forEach((community: any) => {
      const metadata = community.metadata as any
      const members = metadata?.members || []
      const basic = metadata?.basic || {}
      const isUserMember =
        community.user_id === user.id ||
        (Array.isArray(members) && members.includes(user.id))

      if (isUserMember) {
        userCommunities.push({
          id: community.id,
          name: basic.name || 'Unnamed Community',
          slug: community.slug,
        })
      }
    })

    return {
      success: true,
      communities: userCommunities,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

