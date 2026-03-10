import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enrichNotesWithAuthorProfiles, type FeedItem } from '@/app/main/actions'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import type { Portfolio } from '@/types/portfolio'

export const dynamic = 'force-dynamic'

function uniqStrings(list: string[]) {
  return Array.from(new Set(list.filter(Boolean)))
}

function isPublicPortfolio(p: any) {
  const v = (p as any)?.visibility
  return v === undefined || v === null || v === 'public'
}

export async function GET(
  request: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const portfolioId = params.portfolioId
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    if (!portfolioId) {
      return NextResponse.json({ error: 'Portfolio ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const poolTarget = offset + limit + 1
    const poolLimit = Math.min(Math.max(poolTarget * 2, 50), 200)

    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, type, user_id, metadata')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })
    }

    const type = (portfolio as any).type as string
    const ownerId = String((portfolio as any).user_id)
    const meta = ((portfolio as any).metadata as any) || {}
    const members = Array.isArray(meta?.members) ? (meta.members as string[]) : []
    const managers = Array.isArray(meta?.managers) ? (meta.managers as string[]) : []
    const isExternalActivity =
      type === 'activities' && ((meta?.properties as any)?.external === true)
    const includeCreator = !isExternalActivity || members.includes(ownerId)

    const memberUserIds =
      type === 'human'
        ? [ownerId]
        : uniqStrings([
            ...(includeCreator ? [ownerId] : []),
            ...managers,
            ...members,
          ])

    if (memberUserIds.length === 0) {
      return NextResponse.json({ items: [], hasMore: false })
    }

    // Supabase doesn't support array overlap for collaborator_account_ids, so we fetch a pool
    // and filter client-side by (owner in members) OR (any collaborator in members).
    const notesPoolLimit = Math.min(poolLimit * 3, 300)

    const [notesRes, portfoliosRes, humanPortfoliosRes] = await Promise.all([
      supabase
        .from('notes')
        .select('*')
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .in('visibility', ['public', 'members'])
        .order('created_at', { ascending: false })
        .limit(notesPoolLimit),
      supabase
        .from('portfolios')
        .select('*')
        .in('type', ['projects', 'activities', 'community'])
        .in('user_id', memberUserIds)
        .order('created_at', { ascending: false })
        .limit(poolLimit),
      supabase
        .from('portfolios')
        .select('*')
        .eq('type', 'human')
        .in('user_id', memberUserIds),
    ])

    const memberSet = new Set(memberUserIds)
    // For projects, activities, and community: only show notes assigned to this portfolio OR to hosted activities
    const mustBeAssigned = ['projects', 'activities', 'community'].includes(type)
    const validPortfolioIds = new Set<string>([portfolioId])
    if (mustBeAssigned && (type === 'projects' || type === 'community')) {
      const hostField = type === 'projects' ? 'host_project_ids' : 'host_community_ids'
      const { data: hostedActivities } = await supabase
        .from('portfolios')
        .select('id, metadata')
        .eq('type', 'activities')
      ;(hostedActivities || []).forEach((a: any) => {
        const ids = (a.metadata as any)?.properties?.[hostField]
        if (Array.isArray(ids) && ids.includes(portfolioId)) {
          validPortfolioIds.add(a.id)
        }
      })
    }
    const filteredNotesRaw = (notesRes.data || []).filter((note: any) => {
      if (note?.type === 'open_call') return false
      if (mustBeAssigned) {
        const assigned = Array.isArray(note.assigned_portfolios) ? note.assigned_portfolios : []
        if (!assigned.some((id: string) => validPortfolioIds.has(id))) return false
      }
      const ownerId = String(note.owner_account_id || '')
      if (memberSet.has(ownerId)) return true
      const collab = Array.isArray(note.collaborator_account_ids)
        ? (note.collaborator_account_ids as string[])
        : []
      return collab.some((id) => memberSet.has(String(id)))
    })

    const normalizedNotes = filteredNotesRaw.map((note: any) => ({
      ...note,
      references: Array.isArray(note.references) ? note.references : [],
    }))
    const enrichedNotes = await enrichNotesWithAuthorProfiles(
      normalizedNotes,
      supabase,
      user?.id
    )

    const creatorProfileByUserId = new Map<
      string,
      { id: string; name: string; avatar?: string | null }
    >()
    ;(humanPortfoliosRes.data || []).forEach((p: any) => {
      const basic = getPortfolioBasic(p as Portfolio)
      const uid = String((p as any).user_id)
      creatorProfileByUserId.set(uid, {
        id: uid,
        name: user?.id && uid === user.id ? 'You' : basic.name,
        avatar: basic.avatar,
      })
    })

    let rawPortfolios = (portfoliosRes.data || []).filter(isPublicPortfolio)
    // For project and community: only show portfolio creations (activities) hosted by this portfolio
    if (type === 'projects') {
      rawPortfolios = rawPortfolios.filter((p: any) => {
        if (p.type !== 'activities') return false
        const hostIds = Array.isArray((p.metadata as any)?.properties?.host_project_ids)
          ? (p.metadata as any).properties.host_project_ids
          : []
        return hostIds.includes(portfolioId)
      })
    } else if (type === 'community') {
      rawPortfolios = rawPortfolios.filter((p: any) => {
        if (p.type !== 'activities') return false
        const hostIds = Array.isArray((p.metadata as any)?.properties?.host_community_ids)
          ? (p.metadata as any).properties.host_community_ids
          : []
        return hostIds.includes(portfolioId)
      })
    }
    const portfolioItems: FeedItem[] = rawPortfolios.map((p: any) => {
      const uid = String(p.user_id)
      const creator_profile =
        creatorProfileByUserId.get(uid) || {
          id: uid,
          name: `User ${uid.slice(0, 8)}`,
          avatar: null,
        }
      return {
        kind: 'portfolio_created',
        created_at: p.created_at,
        portfolio: p as Portfolio,
        creator_profile,
      }
    })

    const noteItems: FeedItem[] = (enrichedNotes || []).map((note: any) => ({
      kind: 'note',
      created_at: note.created_at,
      note,
    }))

    const merged = [...noteItems, ...portfolioItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    const page = merged.slice(offset, offset + limit)
    const hasMore = merged.length > offset + limit

    return NextResponse.json({ items: page, hasMore })
  } catch (error: any) {
    console.error('[API /portfolios/[portfolioId]/member-feed] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

