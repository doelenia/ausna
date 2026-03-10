import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import type { Portfolio } from '@/types/portfolio'

export const dynamic = 'force-dynamic'

function parseIds(raw: string | null): string[] {
  if (!raw) return []
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  )
}

/**
 * GET /api/users/by-ids?ids=id1,id2,...
 * Returns minimal human profile info for each user id.
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

    const idsParam = request.nextUrl.searchParams.get('ids')
    const ids = parseIds(idsParam).slice(0, 25)

    if (ids.length === 0) {
      return NextResponse.json({ users: [] })
    }

    const { data: portfolios, error } = await supabase
      .from('portfolios')
      .select('user_id, metadata, slug')
      .eq('type', 'human')
      .in('user_id', ids)

    if (error) {
      console.error('Error fetching human portfolios by ids:', error)
      return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
    }

    const users = (portfolios || []).map((p: any) => {
      const uid = String(p.user_id)
      const basic = getPortfolioBasic(p as Portfolio)
      return {
        id: uid,
        name: uid === user.id ? 'You' : basic.name,
        avatar: basic.avatar ?? null,
      }
    })

    return NextResponse.json({ users })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

