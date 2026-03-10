import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notes/[noteId]/leave-collaboration
 * Removes the current user from the note's collaborator_account_ids.
 * Allowed only for collaborators (not the owner).
 */
export async function POST(
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

    const { data: note, error: fetchError } = await supabase
      .from('notes')
      .select('owner_account_id, collaborator_account_ids')
      .eq('id', noteId)
      .single()

    if (fetchError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    if (note.owner_account_id === user.id) {
      return NextResponse.json(
        { error: 'Owner cannot leave; delete the note or transfer ownership instead.' },
        { status: 400 }
      )
    }

    const collaborators = (note.collaborator_account_ids || []) as string[]
    if (!collaborators.includes(user.id)) {
      return NextResponse.json(
        { error: 'You are not a collaborator on this note.' },
        { status: 400 }
      )
    }

    const nextCollaborators = collaborators.filter((id) => id !== user.id)

    const { error: updateError } = await supabase
      .from('notes')
      .update({ collaborator_account_ids: nextCollaborators })
      .eq('id', noteId)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || 'Failed to leave collaboration' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('leave-collaboration error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
