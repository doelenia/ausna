import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function parseCommaList(input: string | null): string[] {
  if (!input) return []
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * GET /api/portfolios/last-note-created-at?portfolio_ids=a,b,c
 *
 * Returns:
 * - lastNoteByPortfolioId: { [portfolioId]: ISOString | null }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const portfolioIds = parseCommaList(searchParams.get('portfolio_ids'))

    if (portfolioIds.length === 0) {
      return NextResponse.json({ lastNoteByPortfolioId: {} })
    }

    const supabase = await createClient()

    // Pull a recent window of notes that overlap any of these portfolios, then compute maxima per id.
    // RLS will ensure callers only see notes they're allowed to see.
    const { data: notes, error } = await supabase
      .from('notes')
      .select('created_at, assigned_portfolios')
      .is('deleted_at', null)
      .is('mentioned_note_id', null)
      .overlaps('assigned_portfolios', portfolioIds)
      .order('created_at', { ascending: false })
      .limit(2000)

    if (error) {
      console.error('[API /portfolios/last-note-created-at] Query error:', error)
      return NextResponse.json({ lastNoteByPortfolioId: {} }, { status: 200 })
    }

    const lastById = new Map<string, string>()

    ;(notes || []).forEach((n: any) => {
      const createdAt = typeof n?.created_at === 'string' ? n.created_at : null
      const assigned: unknown = n?.assigned_portfolios
      if (!createdAt || !Array.isArray(assigned)) return

      assigned.forEach((pid: unknown) => {
        if (typeof pid !== 'string') return
        if (!portfolioIds.includes(pid)) return
        if (!lastById.has(pid)) lastById.set(pid, createdAt)
      })
    })

    const lastNoteByPortfolioId: Record<string, string | null> = {}
    portfolioIds.forEach((id) => {
      lastNoteByPortfolioId[id] = lastById.get(id) ?? null
    })

    return NextResponse.json({ lastNoteByPortfolioId })
  } catch (error: any) {
    console.error('[API /portfolios/last-note-created-at] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred', lastNoteByPortfolioId: {} },
      { status: 500 }
    )
  }
}

