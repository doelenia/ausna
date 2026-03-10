import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Note } from '@/types/note'
import { enrichNotesWithAuthorProfiles } from '@/app/main/actions'

/**
 * GET /api/portfolios/[portfolioId]/notes - Get notes assigned to a portfolio with pagination
 * Query params:
 *   - offset: number (default: 0)
 *   - limit: number (default: 20)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const portfolioId = params.portfolioId
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const collectionId = searchParams.get('collection_id')

    if (!portfolioId) {
      return NextResponse.json(
        { error: 'Portfolio ID is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // First, get the portfolio to check if it's a human portfolio
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('type, user_id')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return NextResponse.json(
        { error: 'Portfolio not found' },
        { status: 404 }
      )
    }

    const isHuman = portfolio.type === 'human'

    // If collection_id is provided, filter notes by collection
    let noteIdsInCollection: string[] | null = null
    if (collectionId) {
      const { data: noteCollections } = await supabase
        .from('note_collections')
        .select('note_id')
        .eq('collection_id', collectionId)
      
      noteIdsInCollection = (noteCollections || []).map((nc: any) => nc.note_id)
    }

    let allNotes: any[] = []

    if (isHuman) {
      // Human portfolio: fetch notes by owner and by collaborator, then merge and sort
      const poolSize = Math.max(limit * 3, 60)
      const [ownerRes, collabRes] = await Promise.all([
        supabase
          .from('notes')
          .select('*')
          .is('deleted_at', null)
          .is('mentioned_note_id', null)
          .eq('owner_account_id', portfolio.user_id)
          .order('created_at', { ascending: false })
          .limit(poolSize),
        supabase
          .from('notes')
          .select('*')
          .is('deleted_at', null)
          .is('mentioned_note_id', null)
          .contains('collaborator_account_ids', [portfolio.user_id])
          .order('created_at', { ascending: false })
          .limit(poolSize),
      ])
      const byId = new Map<string, any>()
      ;(ownerRes.data || []).forEach((n: any) => byId.set(n.id, n))
      ;(collabRes.data || []).forEach((n: any) => byId.set(n.id, n))
      allNotes = Array.from(byId.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    } else {
      // Project/Community/Activity: fetch notes assigned to this portfolio OR to activities hosted by it
      const validPortfolioIds = new Set<string>([portfolioId])
      if (portfolio.type === 'projects' || portfolio.type === 'community') {
        const hostField =
          portfolio.type === 'projects' ? 'host_project_ids' : 'host_community_ids'
        const { data: hostedActivities } = await supabase
          .from('portfolios')
          .select('id, metadata')
          .eq('type', 'activities')
        const hostedIds = (hostedActivities || [])
          .filter((a: any) => {
            const ids = (a.metadata as any)?.properties?.[hostField]
            return Array.isArray(ids) && ids.includes(portfolioId)
          })
          .map((a: any) => a.id)
        hostedIds.forEach((id) => validPortfolioIds.add(id))
      }

      const queryLimit = limit * 3
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .order('created_at', { ascending: false })
        .limit(queryLimit)
      if (error) {
        console.error('[API /portfolios/[portfolioId]/notes] Query Error:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to fetch notes' },
          { status: 500 }
        )
      }
      allNotes = (data || []).filter((note: any) => {
        const assigned = note.assigned_portfolios || []
        return assigned.some((id: string) => validPortfolioIds.has(id))
      })
    }

    const filteredNotes = allNotes.filter((note: any) => {
      if (note.type === 'open_call') {
        return false
      }
      if (noteIdsInCollection && !noteIdsInCollection.includes(note.id)) {
        return false
      }
      return true
    })

    // Apply pagination
    const paginatedNotes = filteredNotes.slice(offset, offset + limit)

    // Normalize notes - use the same simple approach as getFeedNotes and getNoteById
    const normalizedNotes: Note[] = (paginatedNotes || []).map((note: any) => ({
      ...note,
      references: Array.isArray(note.references) ? note.references : [],
    }))

    // Enrich with author_profiles for immediate avatar display (avoids client fetch delay)
    const { data: { user } } = await supabase.auth.getUser()
    const enrichedNotes = await enrichNotesWithAuthorProfiles(normalizedNotes, supabase, user?.id)

    // Check if there are more notes (based on filtered results)
    const hasMore = filteredNotes.length > offset + limit

    return NextResponse.json({
      success: true,
      notes: enrichedNotes,
      hasMore,
    })
  } catch (error: any) {
    console.error('[API /portfolios/[portfolioId]/notes] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

