import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Note } from '@/types/note'

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

    // Use EXACT same pattern as getFeedNotes - fetch all notes, then filter in JavaScript
    // This ensures references are returned correctly (getFeedNotes does this for portfolio filtering)
    const queryLimit = limit * 2 // Fetch more to have buffer for filtering
    const { data: allNotes, error } = await supabase
      .from('notes')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(queryLimit)
    
    if (error) {
      console.error('[API /portfolios/[portfolioId]/notes] Query Error:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to fetch notes' },
        { status: 500 }
      )
    }

    // For human portfolios: filter by owner_account_id (notes created by this user)
    // For other portfolios: filter by assigned_portfolios (notes assigned to this portfolio)
    const filteredNotes = (allNotes || []).filter((note: any) => {
      if (isHuman) {
        // Human portfolio: show all notes created by the portfolio owner
        return note.owner_account_id === portfolio.user_id
      } else {
        // Project/Community portfolio: show notes assigned to this portfolio
        const assigned = note.assigned_portfolios || []
        return assigned.includes(portfolioId)
      }
    })
    
    // Apply pagination
    const paginatedNotes = filteredNotes.slice(offset, offset + limit)

    // Normalize notes - use the same simple approach as getFeedNotes and getNoteById
    // They just ensure references is an array, which works fine
    const normalizedNotes: Note[] = (paginatedNotes || []).map((note: any) => ({
      ...note,
      references: Array.isArray(note.references) ? note.references : [],
    }))

    // Check if there are more notes (based on filtered results)
    const hasMore = filteredNotes.length > offset + limit

    // API routes handle JSON serialization automatically, so we can return the objects directly
    return NextResponse.json({
      success: true,
      notes: normalizedNotes,
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

