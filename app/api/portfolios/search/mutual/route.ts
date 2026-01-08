import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/portfolios/search/mutual?portfolioId=id - Get mutual friends/communities for a portfolio
 * Requires authentication
 * 
 * Query params:
 *   - portfolioId: portfolio ID to check mutual connections for
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const portfolioId = searchParams.get('portfolioId')

    if (!portfolioId) {
      return NextResponse.json(
        { error: 'Portfolio ID is required' },
        { status: 400 }
      )
    }

    // Get portfolio
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('type, user_id, metadata')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return NextResponse.json(
        { error: 'Portfolio not found' },
        { status: 404 }
      )
    }

    const metadata = portfolio.metadata as any
    const portfolioType = portfolio.type

    // Get user's friends
    const { data: friendsData } = await supabase
      .from('friends')
      .select('user_id, friend_id')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .eq('status', 'accepted')

    const friendIds = new Set<string>()
    if (friendsData) {
      friendsData.forEach((f: any) => {
        if (f.user_id === user.id) friendIds.add(f.friend_id)
        if (f.friend_id === user.id) friendIds.add(f.user_id)
      })
    }

    let mutualFriends: any[] = []
    let mutualCommunities: any[] = []

    if (portfolioType === 'human') {
      // For human portfolios: find mutual friends and mutual communities
      const targetUserId = portfolio.user_id

      // Get mutual friends (friends of target user who are also friends of current user)
      const { data: targetFriendsData } = await supabase
        .from('friends')
        .select('user_id, friend_id')
        .or(`user_id.eq.${targetUserId},friend_id.eq.${targetUserId}`)
        .eq('status', 'accepted')

      if (targetFriendsData && friendIds.size > 0) {
        const targetFriendIds = new Set<string>()
        targetFriendsData.forEach((f: any) => {
          if (f.user_id === targetUserId) targetFriendIds.add(f.friend_id)
          if (f.friend_id === targetUserId) targetFriendIds.add(f.user_id)
        })

        // Find intersection (mutual friends)
        const mutual = Array.from(friendIds).filter(id => 
          targetFriendIds.has(id) && id !== user.id && id !== targetUserId
        )

        if (mutual.length > 0) {
          // Get human portfolios for mutual friends
          const { data: mutualPortfolios } = await supabase
            .from('portfolios')
            .select('id, user_id, metadata')
            .eq('type', 'human')
            .in('user_id', mutual)

          if (mutualPortfolios) {
            mutualFriends = mutualPortfolios.map((p: any) => {
              const meta = p.metadata as any
              const basic = meta?.basic || {}
              return {
                id: p.id,
                name: basic.name || '',
                user_id: p.user_id || '',
              }
            })
          }
        }
      }

      // Get mutual communities (communities both users are members of)
      const { data: userCommunities } = await supabase
        .from('portfolios')
        .select('id, metadata')
        .eq('type', 'community')
        .limit(100)

      if (userCommunities) {
        const mutual = userCommunities.filter((c: any) => {
          const meta = c.metadata as any
          const members = meta?.members || []
          return (
            Array.isArray(members) &&
            members.includes(user.id) &&
            members.includes(targetUserId)
          )
        })

        mutualCommunities = mutual.map((c: any) => {
          const meta = c.metadata as any
          const basic = meta?.basic || {}
          return {
            id: c.id,
            name: basic.name || '',
          }
        })
      }
    } else if (portfolioType === 'projects' || portfolioType === 'community') {
      // For projects/communities: find friends who are members
      const members = metadata?.members || []
      if (Array.isArray(members)) {
        const friendMembers = Array.from(friendIds).filter(id => 
          members.includes(id) && id !== user.id
        )

        if (friendMembers.length > 0) {
          // Get human portfolios for friend members
          const { data: friendPortfolios } = await supabase
            .from('portfolios')
            .select('id, user_id, metadata')
            .eq('type', 'human')
            .in('user_id', friendMembers)

          if (friendPortfolios) {
            mutualFriends = friendPortfolios.map((p: any) => {
              const meta = p.metadata as any
              const basic = meta?.basic || {}
              return {
                id: p.id,
                name: basic.name || '',
                user_id: p.user_id || '',
              }
            })
          }
        }
      }
    }

    return NextResponse.json({
      mutualFriends,
      mutualCommunities,
    })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

