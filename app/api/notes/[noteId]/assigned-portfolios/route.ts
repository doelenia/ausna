import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/notes/[noteId]/assigned-portfolios
 * Body: { assigned_portfolios: string[] }
 * Owner only. Updates which spaces this note is assigned to.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { noteId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const noteId = params.noteId
    if (!noteId) {
      return NextResponse.json({ error: 'Note ID required' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const assigned_portfolios = body.assigned_portfolios as string[] | undefined
    if (!Array.isArray(assigned_portfolios)) {
      return NextResponse.json({ error: 'assigned_portfolios must be an array' }, { status: 400 })
    }

    const { data: note, error: fetchError } = await supabase
      .from('notes')
      .select('owner_account_id, visibility')
      .eq('id', noteId)
      .single()

    if (fetchError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    if (note.owner_account_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the note owner can update assigned spaces' },
        { status: 403 }
      )
    }

    const validIds = assigned_portfolios.filter(
      (id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)
    )
    const uniqueIds = [...new Set(validIds)]

    // Keep visibility compatible with assignment constraint:
    // - If assigning to >=1 spaces: disallow friends/private -> force to members
    // - If unassigning all spaces: disallow members -> fall back to public
    const currentVisibility = (note as any).visibility as string | null | undefined
    const nextVisibility =
      uniqueIds.length >= 1
        ? (currentVisibility === 'friends' || currentVisibility === 'private' ? 'members' : currentVisibility)
        : (currentVisibility === 'members' ? 'public' : currentVisibility)

    const updatePayload: Record<string, any> = { assigned_portfolios: uniqueIds }
    if (nextVisibility && nextVisibility !== currentVisibility) {
      updatePayload.visibility = nextVisibility
    }

    const { error: updateError } = await supabase
      .from('notes')
      .update(updatePayload)
      .eq('id', noteId)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || 'Failed to update assigned spaces' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      assigned_portfolios: uniqueIds,
      ...(nextVisibility ? { visibility: nextVisibility } : {}),
    })
  } catch (error: any) {
    console.error('PATCH assigned_portfolios error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

