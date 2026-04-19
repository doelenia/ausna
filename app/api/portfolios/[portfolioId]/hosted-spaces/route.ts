import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DB_NON_HUMAN_TYPES, normalizePortfolioType } from '@/types/portfolio'
import { getDeclaredHostSpaceIds } from '@/lib/portfolio/hostRefs'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'

export const dynamic = 'force-dynamic'

type PortfolioRow = {
  id: string
  type: string
  slug?: string | null
  user_id: string
  host_project_id?: string | null
  visibility?: string | null
  created_at?: string
  metadata: any
}

type MemberPreview = { userId: string; name?: string | null; avatar?: string | null }

function hostedBySpace(candidate: PortfolioRow, space: PortfolioRow): boolean {
  if (candidate.id === space.id) return false
  return getDeclaredHostSpaceIds(candidate).includes(space.id)
}

export async function GET(_request: NextRequest, { params }: { params: { portfolioId: string } }) {
  try {
    const portfolioId = params.portfolioId
    if (!portfolioId) {
      return NextResponse.json({ error: 'Portfolio ID is required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: target, error: targetError } = await supabase
      .from('portfolios')
      .select('id, type, slug, user_id, host_project_id, visibility, created_at, metadata')
      .eq('id', portfolioId)
      .single()

    const resolvedTarget =
      targetError || !target ? await loadPortfolioForPage(supabase as any, portfolioId) : (target as any)

    if (!resolvedTarget) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })
    }

    if (normalizePortfolioType((resolvedTarget as any).type) !== 'space') {
      return NextResponse.json({ portfolios: [] })
    }

    const { data: rows } = await supabase
      .from('portfolios_directory')
      .select('id, type, slug, user_id, host_project_id, visibility, created_at, metadata')
      .in('type', [...DB_NON_HUMAN_TYPES])
      .limit(1000)

    const hosted = ((rows || []) as PortfolioRow[])
      .filter((row) => hostedBySpace(row, resolvedTarget as PortfolioRow))

    const allMemberIds = new Set<string>()
    hosted.forEach((row) => {
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

    const portfolios = hosted.map((row) => {
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
        created_at: (row.created_at as string | undefined) ?? null,
        metadata: row.metadata ?? {},
        member_preview,
      }
    })

    return NextResponse.json({ portfolios })
  } catch (error: any) {
    console.error('[API /portfolios/[portfolioId]/hosted-spaces] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

