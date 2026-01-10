'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { Note } from '@/types/note'
import {
  createBloomFilter,
  deserializeBloomFilter,
  serializeBloomFilter,
  getPrioritizedNotes,
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

interface GetUserCommunitiesResult {
  success: boolean
  communities?: Array<{ id: string; name: string; slug: string }>
  error?: string
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

    // For logged-out users, return 5 most recent notes
    if (!user) {
      const publicLimit = 5
      const { data: notes, error } = await supabase
        .from('notes')
        .select('*')
        .is('deleted_at', null)
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

      return {
        success: true,
        notes: notesWithReferences,
        hasMore: false, // No more notes for logged-out users
      }
    }

    // For logged-in users, use existing logic

    // Query more than limit to have buffer for bloom filter filtering
    const queryLimit = limit * 2

    let notesQuery = supabase
      .from('notes')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(queryLimit)

    if (feedType === 'friends') {
      // Get notes from friends
      const friendIds = await getFriendIds(user.id, supabase)
      if (friendIds.length === 0) {
        return { success: true, notes: [], hasMore: false }
      }
      notesQuery = notesQuery.in('owner_account_id', friendIds)
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

      // Combine all relevant user IDs
      const allUserIds = Array.from(
        new Set([...friendIds, ...communityMemberIds])
      )

      // Build query: notes from users OR notes assigned to portfolios
      const conditions: string[] = []

      if (allUserIds.length > 0) {
        conditions.push(`owner_account_id.in.(${allUserIds.join(',')})`)
      }

      // For portfolio-based notes, we need to check if any assigned_portfolio matches
      // Since Supabase doesn't support array overlap directly, we'll fetch and filter
      const allPortfolioIds = Array.from(
        new Set([...subscribedPortfolioIds, ...memberPortfolioIds])
      )

      if (allUserIds.length > 0) {
        notesQuery = notesQuery.in('owner_account_id', allUserIds)
      } else if (allPortfolioIds.length === 0) {
        // No friends, no communities, no portfolios
        return { success: true, notes: [], hasMore: false }
      }

      // We'll filter portfolio-based notes after fetching
      const { data: userNotes, error: userError } = await notesQuery

      if (userError) {
        return {
          success: false,
          error: userError.message || 'Failed to fetch notes',
        }
      }

      // Also fetch notes assigned to portfolios
      let portfolioNotes: any[] = []
      if (allPortfolioIds.length > 0) {
        // Fetch notes that have any of these portfolios in assigned_portfolios
        const { data: portfolioNotesData, error: portfolioError } =
          await supabase
            .from('notes')
            .select('*')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(queryLimit)

        if (!portfolioError && portfolioNotesData) {
          // Filter notes that have any assigned portfolio in our list
          portfolioNotes = portfolioNotesData.filter((note: any) => {
            const assigned = note.assigned_portfolios || []
            return assigned.some((pid: string) =>
              allPortfolioIds.includes(pid)
            )
          })
        }
      }

      // Combine and deduplicate
      const allNotesMap = new Map<string, any>()
      ;(userNotes || []).forEach((note: any) => {
        allNotesMap.set(note.id, note)
      })
      portfolioNotes.forEach((note: any) => {
        allNotesMap.set(note.id, note)
      })

      // Final validation: ensure each note meets at least one visibility criteria
      const validatedNotes = Array.from(allNotesMap.values()).filter((note: any) => {
        const noteOwnerId = note.owner_account_id
        const assignedPortfolios = note.assigned_portfolios || []
        
        // Check if note owner is a friend or community member
        const isOwnerVisible = allUserIds.includes(noteOwnerId)
        
        // Check if note is assigned to a portfolio the user subscribes to or is a member of
        const isAssignedToVisiblePortfolio = assignedPortfolios.some((pid: string) =>
          allPortfolioIds.includes(pid)
        )
        
        // Only include note if it meets at least one criteria
        return isOwnerVisible || isAssignedToVisiblePortfolio
      })

      const allNotes = validatedNotes
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        )
        .slice(0, queryLimit)

      // Get bloom filter and filter notes
      const { bloomFilter } = await getOrCreateBloomFilter(user.id)
      const prioritizedNotes = getPrioritizedNotes(allNotes, bloomFilter, limit)

      // Determine source for each note and add to note object
      const notesWithSource = await Promise.all(
        prioritizedNotes.map(async (note: any) => {
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

      const hasMore = allNotes.length >= queryLimit

      return {
        success: true,
        notes: notesWithReferences,
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

    // Get bloom filter and filter notes
    const { bloomFilter } = await getOrCreateBloomFilter(user.id)
    const prioritizedNotes = getPrioritizedNotes(notes, bloomFilter, limit)

    // Ensure references is an array
    const notesWithReferences: Note[] = prioritizedNotes.map((note: any) => ({
      ...note,
      references: Array.isArray(note.references) ? note.references : [],
    }))

    const hasMore = notes.length >= queryLimit

    return {
      success: true,
      notes: notesWithReferences,
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

