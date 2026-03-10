import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { Note } from '@/types/note'
import { enrichNotesWithAuthorProfiles } from '@/app/main/actions'
import { getPortfolioBasic } from '@/lib/portfolio/utils'

type OpenCallsContext = 'feed' | 'human' | 'portfolio'

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

/**
 * GET /api/open-calls
 * Query params:
 *   - context: 'feed' | 'human' | 'portfolio'
 *   - portfolioId: required when context is 'human' or 'portfolio'
 *   - limit: number (default 10)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const context = searchParams.get('context') as OpenCallsContext | null
    const portfolioId = searchParams.get('portfolioId')
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    if (!context || !['feed', 'human', 'portfolio'].includes(context)) {
      return NextResponse.json(
        { error: 'Invalid context. Must be "feed", "human", or "portfolio"' },
        { status: 400 }
      )
    }

    if ((context === 'human' || context === 'portfolio') && !portfolioId) {
      return NextResponse.json(
        { error: 'portfolioId is required for human and portfolio context' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const now = new Date().toISOString()

    let openCalls: any[] = []

    if (context === 'feed') {
      // Feed: open calls should only come from the same sources as notes in the main feed
      // (friends, communities, subscribed/member portfolios, or collaborations).
      const { data: notes, error } = await supabase
        .from('notes')
        .select('*')
        .eq('type', 'open_call')
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(limit * 5) // Fetch more to allow filtering to feed-visible sources

      if (error) {
        console.error('[API open-calls] Query error:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to fetch open calls' },
          { status: 500 }
        )
      }

      let candidateNotes: any[] = notes || []

      // For logged-in users, restrict open calls to the same visibility rules as feed notes.
      if (user) {
        const [friendIds, subscribedPortfolioIds, memberPortfolioIds, communityMemberIds] =
          await Promise.all([
            getFriendIds(user.id, supabase),
            getSubscribedPortfolioIds(user.id, supabase),
            getMemberPortfolioIds(user.id, supabase),
            getAllCommunityMemberIds(user.id, supabase),
          ])

        const allUserIds = Array.from(new Set([...friendIds, ...communityMemberIds]))
        const allPortfolioIds = Array.from(
          new Set([...subscribedPortfolioIds, ...memberPortfolioIds])
        )

        if (allUserIds.length === 0 && allPortfolioIds.length === 0) {
          candidateNotes = []
        } else {
          candidateNotes = candidateNotes.filter((note: any) => {
            const noteOwnerId = note.owner_account_id
            const assignedPortfolios = note.assigned_portfolios || []
            const collaboratorIds = (note.collaborator_account_ids || []) as string[]
            const isCollaborator = collaboratorIds.includes(user.id)

            const isOwnerVisible = allUserIds.includes(noteOwnerId)
            const isAssignedToVisiblePortfolio = assignedPortfolios.some((pid: string) =>
              allPortfolioIds.includes(pid)
            )

            return isOwnerVisible || isAssignedToVisiblePortfolio || isCollaborator
          })
        }
      }

      const nonExpired = candidateNotes.filter((note: any) => {
        const meta = note.metadata as any
        const endDate = meta?.end_date
        if (!endDate) return true // No end date = never expires
        return endDate > now
      })

      // Sort: not viewed first, then viewed; within each: end_date ASC (closest first)
      nonExpired.sort((a: any, b: any) => {
        const metaA = a.metadata as any
        const metaB = b.metadata as any
        const viewedA =
          user?.id && Array.isArray(metaA?.viewed_by) && metaA.viewed_by.includes(user.id)
        const viewedB =
          user?.id && Array.isArray(metaB?.viewed_by) && metaB.viewed_by.includes(user.id)

        if (viewedA !== viewedB) {
          return viewedA ? 1 : -1 // Not viewed first
        }

        const endA = metaA?.end_date ? new Date(metaA.end_date).getTime() : Infinity
        const endB = metaB?.end_date ? new Date(metaB.end_date).getTime() : Infinity
        return endA - endB // Closest end date first
      })

      openCalls = nonExpired.slice(0, limit)
    } else if (context === 'human') {
      // Human: open calls created or collaborated by this person
      const { data: portfolio, error: portfolioError } = await supabase
        .from('portfolios')
        .select('user_id')
        .eq('id', portfolioId)
        .eq('type', 'human')
        .single()

      if (portfolioError || !portfolio) {
        return NextResponse.json(
          { error: 'Human portfolio not found' },
          { status: 404 }
        )
      }

      const userId = portfolio.user_id
      const poolSize = Math.max(limit * 3, 60)

      const [ownerRes, collabRes] = await Promise.all([
        supabase
          .from('notes')
          .select('*')
          .eq('type', 'open_call')
          .is('deleted_at', null)
          .is('mentioned_note_id', null)
          .eq('owner_account_id', userId)
          .order('created_at', { ascending: false })
          .limit(poolSize),
        supabase
          .from('notes')
          .select('*')
          .eq('type', 'open_call')
          .is('deleted_at', null)
          .is('mentioned_note_id', null)
          .contains('collaborator_account_ids', [userId])
          .order('created_at', { ascending: false })
          .limit(poolSize),
      ])

      const byId = new Map<string, any>()
      ;(ownerRes.data || []).forEach((n: any) => byId.set(n.id, n))
      ;(collabRes.data || []).forEach((n: any) => byId.set(n.id, n))
      const merged = Array.from(byId.values()).filter((note: any) => {
        const meta = note.metadata as any
        const endDate = meta?.end_date
        if (!endDate) return true
        return endDate > now
      })

      merged.sort((a: any, b: any) => {
        const metaA = a.metadata as any
        const metaB = b.metadata as any
        const viewedA =
          user?.id && Array.isArray(metaA?.viewed_by) && metaA.viewed_by.includes(user.id)
        const viewedB =
          user?.id && Array.isArray(metaB?.viewed_by) && metaB.viewed_by.includes(user.id)

        if (viewedA !== viewedB) {
          // Not viewed first
          return viewedA ? 1 : -1
        }

        const endA = metaA?.end_date ? new Date(metaA.end_date).getTime() : Infinity
        const endB = metaB?.end_date ? new Date(metaB.end_date).getTime() : Infinity
        // Earlier end date first; "forever" last
        return endA - endB
      })

      openCalls = merged.slice(0, limit)
    } else {
      // Portfolio (project/activity/community): assigned to this portfolio
      const { data: notes, error } = await supabase
        .from('notes')
        .select('*')
        .eq('type', 'open_call')
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .contains('assigned_portfolios', [portfolioId])
        .order('created_at', { ascending: false })
        .limit(limit * 2)

      if (error) {
        console.error('[API open-calls] Query error:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to fetch open calls' },
          { status: 500 }
        )
      }

      const nonExpired = (notes || []).filter((note: any) => {
        const meta = note.metadata as any
        const endDate = meta?.end_date
        if (!endDate) return true
        return endDate > now
      })

      nonExpired.sort((a: any, b: any) => {
        const metaA = a.metadata as any
        const metaB = b.metadata as any
        const viewedA =
          user?.id && Array.isArray(metaA?.viewed_by) && metaA.viewed_by.includes(user.id)
        const viewedB =
          user?.id && Array.isArray(metaB?.viewed_by) && metaB.viewed_by.includes(user.id)

        if (viewedA !== viewedB) {
          // Not viewed first
          return viewedA ? 1 : -1
        }

        const endA = metaA?.end_date ? new Date(metaA.end_date).getTime() : Infinity
        const endB = metaB?.end_date ? new Date(metaB.end_date).getTime() : Infinity
        // Earlier end date first; "forever" last
        return endA - endB
      })


      openCalls = nonExpired.slice(0, limit)
    }

    const normalizedNotes: Note[] = openCalls.map((note: any) => ({
      ...note,
      references: Array.isArray(note.references) ? note.references : [],
    }))

    const enrichedNotes = await enrichNotesWithAuthorProfiles(
      normalizedNotes,
      supabase,
      user?.id
    )

    // Add first project name for preview badge (first non-human assigned portfolio)
    const portfolioIds = new Set<string>()
    enrichedNotes.forEach((n: any) => {
      if (Array.isArray(n.assigned_portfolios)) {
        n.assigned_portfolios.forEach((id: string) => portfolioIds.add(id))
      }
    })
    const portfolioIdList = Array.from(portfolioIds)
    let portfolioMap = new Map<string, string>()
    if (portfolioIdList.length > 0) {
      const { data: portfolios } = await supabase
        .from('portfolios')
        .select('id, type, metadata')
        .in('id', portfolioIdList)
      ;(portfolios || []).forEach((p: any) => {
        if (p.type !== 'human') {
          const basic = getPortfolioBasic(p)
          portfolioMap.set(p.id, basic.name)
        }
      })
    }
    const notesWithProjectName = enrichedNotes.map((n: any) => {
      const firstProjectId = Array.isArray(n.assigned_portfolios)
        ? n.assigned_portfolios.find((id: string) => portfolioMap.has(id))
        : undefined
      return {
        ...n,
        first_project_name: firstProjectId ? portfolioMap.get(firstProjectId) : undefined,
      }
    })

    return NextResponse.json({
      openCalls: notesWithProjectName,
      hasMore: openCalls.length >= limit,
    })
  } catch (error: any) {
    console.error('[API open-calls] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
