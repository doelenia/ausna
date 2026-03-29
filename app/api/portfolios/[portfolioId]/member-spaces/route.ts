import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DB_NON_HUMAN_TYPES } from '@/types/portfolio'

export const dynamic = 'force-dynamic'

type PortfolioRow = {
  id: string
  type: string
  slug?: string | null
  user_id: string
  visibility?: string | null
  metadata: any
}

type MemberPreview = { userId: string; name?: string | null; avatar?: string | null }

function humanInPortfolio(userId: string, p: PortfolioRow): boolean {
  if (!userId) return false
  if (p.user_id === userId) return true
  const meta = (p.metadata as any) || {}
  const members: string[] = Array.isArray(meta?.members) ? meta.members : []
  const managers: string[] = Array.isArray(meta?.managers) ? meta.managers : []
  return members.includes(userId) || managers.includes(userId)
}

export async function GET(_request: NextRequest, { params }: { params: { portfolioId: string } }) {
  try {
    const portfolioId = params.portfolioId
    if (!portfolioId) {
      return NextResponse.json({ error: 'Portfolio ID is required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: human, error: humanError } = await supabase
      .from('portfolios')
      .select('id, type, user_id, metadata')
      .eq('id', portfolioId)
      .eq('type', 'human')
      .single()

    if (humanError || !human) {
      return NextResponse.json({ error: 'Human portfolio not found' }, { status: 404 })
    }

    const targetUserId = String((human as any).user_id || '')
    if (!targetUserId) {
      return NextResponse.json({ portfolios: [] })
    }

    const { data: rows } = await supabase
      .from('portfolios')
      .select('id, type, slug, user_id, visibility, metadata')
      .in('type', [...DB_NON_HUMAN_TYPES])
      .limit(1500)

    const memberOf = ((rows || []) as PortfolioRow[]).filter((row) => humanInPortfolio(targetUserId, row))

    const allMemberIds = new Set<string>()
    memberOf.forEach((row) => {
      const meta = (row.metadata as any) || {}
      const managers: string[] = Array.isArray(meta?.managers) ? meta.managers : []
      const members: string[] = Array.isArray(meta?.members) ? meta.members : []
      ;[row.user_id, ...managers, ...members].forEach((id) => {
        if (id && typeof id === 'string') allMemberIds.add(id)
      })
    })

    const memberPreviewById = new Map<string, MemberPreview>()
    if (allMemberIds.size > 0) {
      const { data: humans } = await supabase
        .from('portfolios')
        .select('user_id, metadata')
        .eq('type', 'human')
        .in('user_id', Array.from(allMemberIds))

      ;(humans || []).forEach((h: any) => {
        const meta = (h.metadata as any) || {}
        const basic = meta.basic || {}
        memberPreviewById.set(String(h.user_id), {
          userId: String(h.user_id),
          name: (basic.name as string | undefined) ?? (meta.username as string | undefined) ?? null,
          avatar: (basic.avatar as string | undefined) ?? (meta.avatar_url as string | undefined) ?? null,
        })
      })
    }

    const portfolios = memberOf.map((row) => {
      const meta = (row.metadata as any) || {}
      const managers: string[] = Array.isArray(meta?.managers) ? meta.managers : []
      const members: string[] = Array.isArray(meta?.members) ? meta.members : []
      const memberIds = Array.from(new Set<string>([row.user_id, ...managers, ...members].filter(Boolean)))
      const member_preview = memberIds
        .map((id) => memberPreviewById.get(id))
        .filter(Boolean)
        .slice(0, 5) as MemberPreview[]

      return {
        id: row.id,
        type: row.type,
        slug: row.slug ?? null,
        user_id: row.user_id,
        visibility: row.visibility ?? null,
        metadata: row.metadata ?? {},
        member_preview,
      }
    })

    return NextResponse.json({ portfolios })
  } catch (error: any) {
    console.error('[API /portfolios/[portfolioId]/member-spaces] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

