import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/notes/[noteId]/collaborators
 * Body: { collaborator_account_ids: string[] }
 * Owner only. Updates the note's collaborator list (e.g. remove a collaborator).
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
    const collaborator_account_ids = body.collaborator_account_ids as string[] | undefined
    if (!Array.isArray(collaborator_account_ids)) {
      return NextResponse.json(
        { error: 'collaborator_account_ids must be an array' },
        { status: 400 }
      )
    }

    const { data: note, error: fetchError } = await supabase
      .from('notes')
      .select('owner_account_id')
      .eq('id', noteId)
      .single()

    if (fetchError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    if (note.owner_account_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the note owner can update collaborators' },
        { status: 403 }
      )
    }

    const validIds = collaborator_account_ids.filter(
      (id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) && id !== user.id
    )
    const uniqueIds = [...new Set(validIds)]

    const { error: updateError } = await supabase
      .from('notes')
      .update({ collaborator_account_ids: uniqueIds })
      .eq('id', noteId)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || 'Failed to update collaborators' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('PATCH collaborators error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
