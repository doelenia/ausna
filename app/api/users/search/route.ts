import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/users/search?q=query - Search for users by email or username
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

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ users: [] })
    }

    const searchTerm = query.trim().toLowerCase()

    // Search for users by email (from auth.users) and username (from human portfolios)
    // We need to search human portfolios for username matches
    const { data: portfolios, error: portfolioError } = await supabase
      .from('portfolios')
      .select('user_id, metadata')
      .eq('type', 'human')
      .limit(50)

    if (portfolioError) {
      console.error('Error searching portfolios:', portfolioError)
      return NextResponse.json(
        { error: 'Failed to search users' },
        { status: 500 }
      )
    }

    // Filter portfolios by username match
    const matchingPortfolios = (portfolios || []).filter((portfolio: any) => {
      const metadata = portfolio.metadata as any
      const username = metadata?.username?.toLowerCase() || ''
      const basicName = metadata?.basic?.name?.toLowerCase() || ''
      return username.includes(searchTerm) || basicName.includes(searchTerm)
    })

    // Get user emails for matching portfolios
    // Note: We can't directly query auth.users, so we'll return user IDs and let client fetch emails if needed
    // For now, we'll return user IDs and basic info from portfolios
    const users = matchingPortfolios.map((portfolio: any) => {
      const metadata = portfolio.metadata as any
      const basic = metadata?.basic || {}
      return {
        id: portfolio.user_id,
        username: metadata?.username || null,
        name: basic.name || metadata?.full_name || null,
        avatar: basic.avatar || metadata?.avatar_url || null,
      }
    })

    // Also try to match by email if search term looks like an email
    if (searchTerm.includes('@')) {
      // We can't directly query auth.users, but we can check if any portfolio has email in metadata
      const emailMatches = (portfolios || []).filter((portfolio: any) => {
        const metadata = portfolio.metadata as any
        const email = metadata?.email?.toLowerCase() || ''
        return email.includes(searchTerm)
      })

      emailMatches.forEach((portfolio: any) => {
        const metadata = portfolio.metadata as any
        const basic = metadata?.basic || {}
        const existingUser = users.find((u: any) => u.id === portfolio.user_id)
        if (!existingUser) {
          users.push({
            id: portfolio.user_id,
            username: metadata?.username || null,
            name: basic.name || metadata?.full_name || null,
            avatar: basic.avatar || metadata?.avatar_url || null,
          })
        }
      })
    }

    // Remove duplicates and limit results
    const uniqueUsers = Array.from(
      new Map(users.map((u: any) => [u.id, u])).values()
    ).slice(0, 20)

    return NextResponse.json({ users: uniqueUsers })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}


