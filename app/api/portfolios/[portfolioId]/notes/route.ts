import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Note } from '@/types/note'
import { enrichNotesWithAuthorProfiles } from '@/app/main/actions'
import { DB_NON_HUMAN_TYPES } from '@/types/portfolio'

/** Exclude open_call / resource in SQL while keeping rows with a null type (legacy notes). */
const NOTE_TYPE_OR_FILTER =
  'type.is.null,type.not.in.(open_call,resource)'

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

    if (collectionId && (!noteIdsInCollection || noteIdsInCollection.length === 0)) {
      return NextResponse.json({
        success: true,
        notes: [],
        hasMore: false,
      })
    }

    const userId = portfolio.user_id as string
    const endIdx = offset + limit

    let rows: any[] = []
    let queryError: Error | null = null

    if (isHuman) {
      // Human portfolio: notes owned by or collaborated on by this user (DB-level merge + sort + page)
      let q = supabase
        .from('notes')
        .select('*')
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .or(
          `owner_account_id.eq.${userId},collaborator_account_ids.cs.{${userId}}`
        )
        .or(NOTE_TYPE_OR_FILTER)
        .order('created_at', { ascending: false })

      if (noteIdsInCollection) {
        q = q.in('id', noteIdsInCollection)
      }

      const res = await q.range(offset, endIdx)
      rows = res.data || []
      queryError = res.error
    } else {
      // Non-human: notes assigned to this portfolio OR to hosted activity portfolios (not "N newest notes globally")
      const validPortfolioIds = new Set<string>([portfolioId])
      const { data: hostedActivities } = await supabase
        .from('portfolios')
        .select('id, metadata')
        .in('type', [...DB_NON_HUMAN_TYPES])
      const hostedIds = (hostedActivities || [])
        .filter((a: any) => {
          const hostProjectIds = (a.metadata as any)?.properties?.host_project_ids
          const hostCommunityIds = (a.metadata as any)?.properties?.host_community_ids
          return (
            (Array.isArray(hostProjectIds) && hostProjectIds.includes(portfolioId)) ||
            (Array.isArray(hostCommunityIds) && hostCommunityIds.includes(portfolioId))
          )
        })
        .map((a: any) => a.id)
      hostedIds.forEach((id) => validPortfolioIds.add(id))

      const overlapIds = Array.from(validPortfolioIds)

      let q = supabase
        .from('notes')
        .select('*')
        .overlaps('assigned_portfolios', overlapIds)
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .or(NOTE_TYPE_OR_FILTER)
        .order('created_at', { ascending: false })

      if (noteIdsInCollection) {
        q = q.in('id', noteIdsInCollection)
      }

      const res = await q.range(offset, endIdx)
      rows = res.data || []
      queryError = res.error
    }

    if (queryError) {
      console.error('[API /portfolios/[portfolioId]/notes] Query Error:', queryError)
      return NextResponse.json(
        { error: queryError.message || 'Failed to fetch notes' },
        { status: 500 }
      )
    }

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows

    // Normalize notes - use the same simple approach as getFeedNotes and getNoteById
    const normalizedNotes: Note[] = (pageRows || []).map((note: any) => ({
      ...note,
      references: Array.isArray(note.references) ? note.references : [],
    }))

    // Enrich with author_profiles for immediate avatar display (avoids client fetch delay)
    const { data: { user } } = await supabase.auth.getUser()
    const enrichedNotes = await enrichNotesWithAuthorProfiles(normalizedNotes, supabase, user?.id)

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

