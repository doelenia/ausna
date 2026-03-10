import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export type CollaboratorCandidate = {
  id: string
  username: string | null
  name: string | null
  avatar: string | null
}

/**
 * GET /api/notes/collaborator-candidates?portfolio_id=optional&q=optional
 *
 * Returns users that can be added as note collaborators:
 * - If no portfolio_id: friends first (optionally filtered by q), then search by username/name via q.
 * - If portfolio_id: members of that portfolio first (optionally filtered by q), then search within members.
 * Query param q filters by username or full name (case-insensitive).
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
    const portfolioId = searchParams.get('portfolio_id')?.trim() || null
    const q = searchParams.get('q')?.trim().toLowerCase() || ''

    const result: CollaboratorCandidate[] = []

    if (!portfolioId) {
      // No assigned portfolio: use friends
      const { data: friendships } = await supabase
        .from('friends')
        .select('user_id, friend_id')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
        .eq('status', 'accepted')

      const friendIds = new Set<string>()
      ;(friendships || []).forEach((f: any) => {
        if (f.user_id === user.id) friendIds.add(f.friend_id)
        else friendIds.add(f.user_id)
      })

      if (friendIds.size > 0) {
        const { data: portfolios } = await supabase
          .from('portfolios')
          .select('user_id, slug, metadata')
          .eq('type', 'human')
          .in('user_id', Array.from(friendIds))

        let friendsList = (portfolios || []).map((p: any) => {
          const metadata = p.metadata as any
          const basic = metadata?.basic || {}
          return {
            id: p.user_id,
            username: (p.slug as string) || null,
            name: (basic.name as string) || p.slug || null,
            avatar: (basic.avatar as string) || metadata?.avatar_url || null,
          } as CollaboratorCandidate
        })

        if (q) {
          friendsList = friendsList.filter((u) => {
            const username = (u.username || '').toLowerCase()
            const name = (u.name || '').toLowerCase()
            return username.includes(q) || name.includes(q)
          })
        }

        result.push(...friendsList)
      }

      // If user typed a search query, also search human portfolios by username/name and merge
      if (q) {
        const { data: allHuman } = await supabase
          .from('portfolios')
          .select('user_id, slug, metadata')
          .eq('type', 'human')
          .limit(100)
        const existingIds = new Set(result.map((u) => u.id))
        ;(allHuman || []).forEach((p: any) => {
          if (p.user_id === user.id || existingIds.has(p.user_id)) return
          const meta = p.metadata as any
          const basic = meta?.basic || {}
          const username = ((p.slug as string) || '').toLowerCase()
          const name = ((basic.name as string) || '').toLowerCase()
          if (username.includes(q) || name.includes(q)) {
            existingIds.add(p.user_id)
            result.push({
              id: p.user_id,
              username: p.slug || null,
              name: (basic.name as string) || p.slug || null,
              avatar: (basic.avatar as string) || meta?.avatar_url || null,
            })
          }
        })
      }
    } else {
      // Assigned portfolio: use portfolio members
      const { data: portfolio, error: portfolioError } = await supabase
        .from('portfolios')
        .select('user_id, metadata')
        .eq('id', portfolioId)
        .single()

      if (portfolioError || !portfolio) {
        return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })
      }

      const metadata = (portfolio.metadata as any) || {}
      const managers: string[] = Array.isArray(metadata.managers) ? metadata.managers : []
      const members: string[] = Array.isArray(metadata.members) ? metadata.members : []
      const memberIds = new Set<string>([
        portfolio.user_id,
        ...managers,
        ...members,
      ])
      memberIds.delete(user.id) // exclude self

      if (memberIds.size > 0) {
        const { data: portfolios } = await supabase
          .from('portfolios')
          .select('user_id, slug, metadata')
          .eq('type', 'human')
          .in('user_id', Array.from(memberIds))

        let membersList = (portfolios || []).map((p: any) => {
          const meta = p.metadata as any
          const basic = meta?.basic || {}
          return {
            id: p.user_id,
            username: (p.slug as string) || null,
            name: (basic.name as string) || p.slug || null,
            avatar: (basic.avatar as string) || meta?.avatar_url || null,
          } as CollaboratorCandidate
        })

        if (q) {
          membersList = membersList.filter((u) => {
            const username = (u.username || '').toLowerCase()
            const name = (u.name || '').toLowerCase()
            return username.includes(q) || name.includes(q)
          })
        }

        result.push(...membersList)
      }
    }

    // Dedupe by id
    const byId = new Map<string, CollaboratorCandidate>()
    result.forEach((u) => byId.set(u.id, u))

    return NextResponse.json({
      users: Array.from(byId.values()),
    })
  } catch (error: any) {
    console.error('collaborator-candidates error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
