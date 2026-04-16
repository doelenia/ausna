import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { findAuthUserIdByEmail } from '@/lib/auth-admin'

export const dynamic = 'force-dynamic'

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

/**
 * GET /api/users/search?q=query - Search for users by email or username
 *
 * For email queries: also attempts service-role lookup so pseudo/hidden accounts
 * are found. If the email belongs to no existing user, returns `newInviteeSuggestion`
 * so the invite UI can offer to invite that person.
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
      return NextResponse.json({ users: [], newInviteeSuggestion: null })
    }

    const searchTerm = query.trim().toLowerCase()
    const isEmailQuery = looksLikeEmail(searchTerm)

    // ------------------------------------------------------------------
    // Email-first path: use service role to locate user including pseudo
    // ------------------------------------------------------------------
    if (isEmailQuery) {
      let serviceClient: ReturnType<typeof createServiceClient> | null = null
      try {
        serviceClient = createServiceClient()
      } catch {
        // Service role not configured — fall through to directory search
      }

      if (serviceClient) {
        const authUserId = await findAuthUserIdByEmail(serviceClient, searchTerm)

        if (authUserId && authUserId !== user.id) {
          // Found an auth user (possibly pseudo) — resolve portfolio info
          const { data: portfolio } = await serviceClient
            .from('portfolios')
            .select('user_id, slug, metadata, is_pseudo')
            .eq('type', 'human')
            .eq('user_id', authUserId)
            .maybeSingle()

          if (portfolio) {
            const metadata = portfolio.metadata as any
            const basic = metadata?.basic || {}
            const foundUser = {
              id: portfolio.user_id as string,
              username: (portfolio.slug as string | null) || null,
              name: (basic.name as string | undefined) || (portfolio.slug as string | null) || null,
              avatar:
                (basic.avatar as string | undefined) ||
                (metadata?.avatar_url as string | undefined) ||
                null,
              isPseudo: (portfolio.is_pseudo as boolean | null) === true,
            }
            return NextResponse.json({ users: [foundUser], newInviteeSuggestion: null })
          }
        }

        if (!authUserId || authUserId === user.id) {
          // No existing user for this email — suggest inviting them
          const newInviteeSuggestion = {
            email: searchTerm,
            name: '',
          }
          return NextResponse.json({ users: [], newInviteeSuggestion })
        }
      }
    }

    // ------------------------------------------------------------------
    // Name / username search via directory view (existing logic)
    // ------------------------------------------------------------------
    let portfolios: any[] = []

    // Phase 1: DB-side slug match (fast + reliable for handles).
    const { data: slugMatches, error: slugError } = await supabase
      .from('portfolios_directory')
      .select('user_id, slug, metadata')
      .eq('type', 'human')
      .ilike('slug', `%${searchTerm}%`)
      .limit(50)

    if (slugError) {
      console.error('Error searching users by slug:', slugError)
      return NextResponse.json({ error: 'Failed to search users' }, { status: 500 })
    }

    portfolios = Array.isArray(slugMatches) ? [...slugMatches] : []

    // Phase 2: page through directory results and filter locally by basic.name.
    if (portfolios.length < 50) {
      const maxPages = 6
      const pageSize = 200
      for (let page = 0; page < maxPages; page++) {
        const from = page * pageSize
        const to = from + pageSize - 1
        const { data: pageRows, error: pageError } = await supabase
          .from('portfolios_directory')
          .select('user_id, slug, metadata')
          .eq('type', 'human')
          .order('created_at', { ascending: false })
          .range(from, to)

        if (pageError) {
          console.error('Error paging users directory:', pageError)
          break
        }

        const filtered = (pageRows || []).filter((row: any) => {
          const meta = row?.metadata as any
          const basicName = (meta?.basic?.name as string | undefined)?.toLowerCase() || ''
          const username = (row?.slug as string | undefined)?.toLowerCase() || ''
          return username.includes(searchTerm) || basicName.includes(searchTerm)
        })

        for (const row of filtered) {
          const userId = String(row?.user_id || '')
          if (!userId) continue
          if (portfolios.some((p) => String(p?.user_id || '') === userId)) continue
          portfolios.push(row)
          if (portfolios.length >= 50) break
        }

        if ((pageRows || []).length < pageSize || portfolios.length >= 50) break
      }
    }

    const matchingPortfolios = (portfolios || []).filter((portfolio: any) => {
      const metadata = portfolio.metadata as any
      const username = (portfolio.slug as string | null)?.toLowerCase() || ''
      const basicName = metadata?.basic?.name?.toLowerCase() || ''
      return username.includes(searchTerm) || basicName.includes(searchTerm)
    })

    const users = matchingPortfolios.map((portfolio: any) => {
      const metadata = portfolio.metadata as any
      const basic = metadata?.basic || {}
      return {
        id: portfolio.user_id,
        username: portfolio.slug || null,
        name: basic.name || portfolio.slug || null,
        avatar: basic.avatar || metadata?.avatar_url || null,
        isPseudo: false,
      }
    })

    // Remove duplicates and limit results
    const uniqueUsers = Array.from(
      new Map(users.map((u: any) => [u.id, u])).values()
    ).slice(0, 20)

    // If no results found for a name query, surface a new-invitee suggestion only if
    // query looks like partial email. For plain name queries we cannot invite by name alone.
    const newInviteeSuggestion =
      uniqueUsers.length === 0 && isEmailQuery
        ? { email: searchTerm, name: '' }
        : null

    return NextResponse.json({ users: uniqueUsers, newInviteeSuggestion })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}




