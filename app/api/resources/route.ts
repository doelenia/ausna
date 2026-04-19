import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { canCreateResourceInPortfolio } from '@/lib/notes/helpers'
import type { Note, NoteReference } from '@/types/note'

function normalizeReferences(refs: any): NoteReference[] {
  if (Array.isArray(refs)) return refs as NoteReference[]
  if (typeof refs === 'string') {
    try {
      const parsed = JSON.parse(refs)
      if (Array.isArray(parsed)) return parsed as NoteReference[]
    } catch {
      // ignore
    }
  }
  return []
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const portfolioId = searchParams.get('portfolioId')

    if (!portfolioId) {
      return NextResponse.json({ success: false, error: 'portfolioId is required' }, { status: 400 })
    }

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, type, user_id, metadata')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return NextResponse.json({ success: false, error: 'Portfolio not found' }, { status: 404 })
    }

    const canCreateResource = user ? await canCreateResourceInPortfolio(portfolioId, user.id) : false

    /** Upper bound per request; no product cap on how many resources a portfolio may have. */
    const FETCH_CAP = 10_000
    const resources: Note[] = []

    const mapNoteRow = (n: any): Note =>
      ({
        id: String(n.id),
        type: 'resource',
        owner_account_id: String(n.owner_account_id),
        text: String(n.text ?? ''),
        references: normalizeReferences(n.references),
        assigned_portfolios: Array.isArray(n.assigned_portfolios) ? n.assigned_portfolios.map(String) : [],
        mentioned_note_id: n.mentioned_note_id ? String(n.mentioned_note_id) : null,
        created_at: String(n.created_at),
        updated_at: String(n.updated_at ?? n.created_at),
        deleted_at: n.deleted_at ? String(n.deleted_at) : null,
        annotation_privacy: n.annotation_privacy ?? undefined,
        visibility: (n.visibility as any) ?? 'public',
        collaborator_account_ids: Array.isArray(n.collaborator_account_ids) ? n.collaborator_account_ids.map(String) : [],
        metadata: n.metadata ?? undefined,
      }) as Note

    if (portfolio.type === 'human') {
      // Human resources: unassigned (assigned_portfolios empty) + owned by this human's user_id.
      const { data, error } = await supabase
        .from('notes')
        .select(
          'id,type,owner_account_id,text,references,assigned_portfolios,mentioned_note_id,created_at,updated_at,deleted_at,annotation_privacy,visibility,collaborator_account_ids,metadata'
        )
        .eq('type', 'resource')
        .eq('owner_account_id', portfolio.user_id)
        .eq('assigned_portfolios', [])
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .order('created_at', { ascending: false })
        .limit(FETCH_CAP)

      if (!error && Array.isArray(data)) {
        for (const n of data) {
          resources.push(mapNoteRow(n))
        }

        return NextResponse.json({
          success: true,
          resources,
          canCreateResource,
        })
      }

      // Fallback if empty-array equality is unsupported: broader fetch + client filter (still capped).
      const { data: wide, error: wideError } = await supabase
        .from('notes')
        .select(
          'id,type,owner_account_id,text,references,assigned_portfolios,mentioned_note_id,created_at,updated_at,deleted_at,annotation_privacy,visibility,collaborator_account_ids,metadata'
        )
        .eq('type', 'resource')
        .eq('owner_account_id', portfolio.user_id)
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .order('created_at', { ascending: false })
        .limit(FETCH_CAP)

      if (!wideError && Array.isArray(wide)) {
        const unassigned = wide.filter(
          (n: any) => Array.isArray(n.assigned_portfolios) && n.assigned_portfolios.length === 0
        )
        for (const n of unassigned) {
          resources.push(mapNoteRow(n))
        }
        return NextResponse.json({
          success: true,
          resources,
          canCreateResource,
        })
      }
    } else {
      // Projects/Activities/Community: resources assigned to the current portfolio.
      const { data, error } = await supabase
        .from('notes')
        .select(
          'id,type,owner_account_id,text,references,assigned_portfolios,mentioned_note_id,created_at,updated_at,deleted_at,annotation_privacy,visibility,collaborator_account_ids,metadata'
        )
        .eq('type', 'resource')
        .contains('assigned_portfolios', [portfolioId])
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .order('created_at', { ascending: false })
        .limit(FETCH_CAP)

      if (!error && Array.isArray(data)) {
        return NextResponse.json({
          success: true,
          resources: data.map((n: any) => mapNoteRow(n)),
          canCreateResource,
        })
      }
    }

    return NextResponse.json({
      success: true,
      resources: [],
      canCreateResource,
    })
  } catch (error: any) {
    console.error('[API /api/resources] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

