import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enrichNotesWithAuthorProfiles, type FeedItem } from '@/app/main/actions'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import { DB_NON_HUMAN_TYPES, type Portfolio } from '@/types/portfolio'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'

export const dynamic = 'force-dynamic'

function uniqStrings(list: string[]) {
  return Array.from(new Set(list.filter(Boolean)))
}

function isActivityHostedByPortfolio(activityPortfolio: any, hostPortfolioId: string) {
  if (activityPortfolio?.type === 'human') return false
  const props = ((activityPortfolio?.metadata as any)?.properties as any) || {}
  const hostProjectIds = Array.isArray(props.host_project_ids) ? props.host_project_ids : []
  const hostCommunityIds = Array.isArray(props.host_community_ids) ? props.host_community_ids : []
  return hostProjectIds.includes(hostPortfolioId) || hostCommunityIds.includes(hostPortfolioId)
}

function notePassesMemberFilter(note: any, memberSet: Set<string>): boolean {
  const ownerId = String(note.owner_account_id || '')
  if (memberSet.has(ownerId)) return true
  const collab = Array.isArray(note.collaborator_account_ids)
    ? (note.collaborator_account_ids as string[])
    : []
  return collab.some((id) => memberSet.has(String(id)))
}

type FeedTabMode = 'all' | 'resources' | 'collection'

function parseFeedTab(searchParams: URLSearchParams): { mode: FeedTabMode; collectionId: string | null } {
  const tab = (searchParams.get('feed_tab') || 'all').toLowerCase()
  const collectionId = searchParams.get('collection_id')
  if (tab === 'resources') return { mode: 'resources', collectionId: null }
  if (tab === 'collection' && collectionId) return { mode: 'collection', collectionId }
  return { mode: 'all', collectionId: null }
}

const ASSIGNED_NOTES_FETCH_CAP = 2000

export async function GET(
  request: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const portfolioId = params.portfolioId
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const { mode: feedTab, collectionId: feedCollectionId } = parseFeedTab(searchParams)

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

    const resolvedPortfolio =
      portfolioError || !portfolio
        ? await loadPortfolioForPage(supabase as any, portfolioId)
        : (portfolio as any)

    if (!resolvedPortfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })
    }

    const type = (resolvedPortfolio as any).type as string
    const ownerId = String((resolvedPortfolio as any).user_id)
    const meta = ((resolvedPortfolio as any).metadata as any) || {}
    const members = Array.isArray(meta?.members) ? (meta.members as string[]) : []
    const managers = Array.isArray(meta?.managers) ? (meta.managers as string[]) : []
    const isExternalActivity =
      type !== 'human' && ((meta?.properties as any)?.external === true)
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
      return NextResponse.json({ items: [], hasMore: false, feedCounts: null })
    }

    const memberSet = new Set(memberUserIds)
    const mustBeAssigned = type !== 'human'

    let collectionNoteIdSet: Set<string> | null = null
    if (mustBeAssigned && feedTab === 'collection' && feedCollectionId) {
      const { data: colRow } = await supabase
        .from('collections')
        .select('id')
        .eq('id', feedCollectionId)
        .eq('portfolio_id', portfolioId)
        .maybeSingle()
      if (!colRow?.id) {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
      }
      const { data: ncRows } = await supabase
        .from('note_collections')
        .select('note_id')
        .eq('collection_id', feedCollectionId)
      collectionNoteIdSet = new Set((ncRows || []).map((r: any) => String(r.note_id)).filter(Boolean))
    }

    // --- Notes: assigned-to-portfolio path (spaces, projects, etc.) ---
    let filteredNotesRaw: any[] = []

    if (mustBeAssigned) {
      let q = supabase
        .from('notes')
        .select('*')
        .overlaps('assigned_portfolios', [portfolioId])
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .in('visibility', ['public', 'members'])
        .order('created_at', { ascending: false })
        .limit(ASSIGNED_NOTES_FETCH_CAP)

      if (feedTab === 'resources') {
        q = q.eq('type', 'resource')
      }

      const { data: assignedPool, error: assignedErr } = await q
      if (assignedErr) {
        console.error('[API /portfolios/[portfolioId]/member-feed] notes query:', assignedErr)
        return NextResponse.json(
          { error: assignedErr.message || 'Failed to fetch notes' },
          { status: 500 }
        )
      }

      let rows = assignedPool || []
      rows = rows.filter((note: any) => notePassesMemberFilter(note, memberSet))

      if (feedTab === 'all') {
        rows = rows.filter((note: any) => note?.type !== 'open_call' && note?.type !== 'resource')
      } else if (feedTab === 'collection') {
        if (!collectionNoteIdSet || collectionNoteIdSet.size === 0) {
          rows = []
        } else {
          rows = rows.filter((note: any) => collectionNoteIdSet!.has(String(note.id)))
        }
      }

      filteredNotesRaw = rows
    } else {
      // Human host: preserve legacy global-pool behavior (no assignment requirement).
      const notesPoolLimit = Math.min(poolLimit * 3, 300)
      const notesRes = await supabase
        .from('notes')
        .select('*')
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .in('visibility', ['public', 'members'])
        .order('created_at', { ascending: false })
        .limit(notesPoolLimit)

      filteredNotesRaw = (notesRes.data || []).filter((note: any) => {
        if (note?.type === 'open_call') return false
        if (note?.type === 'resource') return false
        const owner = String(note.owner_account_id || '')
        if (memberSet.has(owner)) return true
        const collab = Array.isArray(note.collaborator_account_ids)
          ? (note.collaborator_account_ids as string[])
          : []
        return collab.some((id) => memberSet.has(String(id)))
      })
    }

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
    const [portfoliosRes, humanPortfoliosRes] = await Promise.all([
      supabase
        .from('portfolios_directory')
        .select('*')
        .in('type', [...DB_NON_HUMAN_TYPES])
        .in('user_id', memberUserIds)
        .order('created_at', { ascending: false })
        .limit(poolLimit),
      supabase
        .from('portfolios')
        .select('*')
        .eq('type', 'human')
        .in('user_id', memberUserIds),
    ])

    ;(humanPortfoliosRes.data || []).forEach((p: any) => {
      const basic = getPortfolioBasic(p as Portfolio)
      const uid = String((p as any).user_id)
      creatorProfileByUserId.set(uid, {
        id: uid,
        name: user?.id && uid === user.id ? 'You' : basic.name,
        avatar: basic.avatar,
      })
    })

    let rawPortfolios = portfoliosRes.data || []
    if (type !== 'human') {
      rawPortfolios = rawPortfolios.filter((p: any) =>
        isActivityHostedByPortfolio(p, portfolioId)
      )
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

    const includePortfolioCreated = mustBeAssigned ? feedTab === 'all' : true
    const merged = [...noteItems, ...(includePortfolioCreated ? portfolioItems : [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    const page = merged.slice(offset, offset + limit)
    const hasMore = merged.length > offset + limit

    let feedCounts: {
      all: number
      resources: number
      collections: Record<string, number>
      countsCapped?: boolean
    } | null = null

    if (offset === 0 && mustBeAssigned) {
      const { data: countPool } = await supabase
        .from('notes')
        .select('id, type, owner_account_id, collaborator_account_ids')
        .overlaps('assigned_portfolios', [portfolioId])
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .in('visibility', ['public', 'members'])
        .order('created_at', { ascending: false })
        .limit(ASSIGNED_NOTES_FETCH_CAP)

      const poolRows = countPool || []
      const memberFiltered = poolRows.filter((note: any) => notePassesMemberFilter(note, memberSet))
      const countsCapped = poolRows.length >= ASSIGNED_NOTES_FETCH_CAP

      const all = memberFiltered.filter(
        (n: any) => n?.type !== 'open_call' && n?.type !== 'resource'
      ).length
      const resources = memberFiltered.filter((n: any) => n?.type === 'resource').length

      const noteIds = memberFiltered.map((n: any) => String(n.id))
      const collectionsRes = await supabase
        .from('collections')
        .select('id')
        .eq('portfolio_id', portfolioId)

      const collectionIds = (collectionsRes.data || []).map((c: any) => String(c.id))
      const collections: Record<string, number> = {}
      collectionIds.forEach((id) => {
        collections[id] = 0
      })

      if (noteIds.length > 0 && collectionIds.length > 0) {
        const { data: ncAll } = await supabase
          .from('note_collections')
          .select('note_id, collection_id')
          .in('note_id', noteIds)
          .in('collection_id', collectionIds)

        const idSet = new Set(noteIds)
        ;(ncAll || []).forEach((row: any) => {
          const nid = String(row.note_id)
          const cid = String(row.collection_id)
          if (!idSet.has(nid)) return
          if (collections[cid] === undefined) return
          collections[cid] += 1
        })
      }

      feedCounts = { all, resources, collections, countsCapped }
    }

    return NextResponse.json({ items: page, hasMore, feedCounts })
  } catch (error: any) {
    console.error('[API /portfolios/[portfolioId]/member-feed] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
