import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notes/[noteId]/collaborator-invites/[inviteId]/accept
 * Invitee accepts the collaboration invite. Adds them to the note's collaborator_account_ids.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { noteId: string; inviteId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { noteId, inviteId } = params
    if (!noteId || !inviteId) {
      return NextResponse.json(
        { error: 'Note ID and invite ID required' },
        { status: 400 }
      )
    }

    const { data: invite, error: inviteError } = await supabase
      .from('note_collaboration_invites')
      .select('id, note_id, invitee_id, status')
      .eq('id', inviteId)
      .eq('note_id', noteId)
      .single()

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    }

    if (invite.invitee_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the invitee can accept this invite' },
        { status: 403 }
      )
    }

    if (invite.status !== 'pending') {
      return NextResponse.json(
        { error: 'Invite has already been responded to' },
        { status: 400 }
      )
    }

    const serviceClient = createServiceClient()
    const { data: note, error: noteError } = await serviceClient
      .from('notes')
      .select('id, collaborator_account_ids')
      .eq('id', noteId)
      .single()

    if (noteError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    const current = (note.collaborator_account_ids || []) as string[]
    if (current.includes(user.id)) {
      // Already a collaborator; just mark invite accepted
      await supabase
        .from('note_collaboration_invites')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', inviteId)
      return NextResponse.json({ success: true })
    }

    const nextCollaborators = [...current, user.id]

    // Use service client to bypass RLS: invitee is not yet owner/collaborator, so user-scoped client cannot update
    const { error: updateNoteError } = await serviceClient
      .from('notes')
      .update({ collaborator_account_ids: nextCollaborators })
      .eq('id', noteId)

    if (updateNoteError) {
      return NextResponse.json(
        { error: updateNoteError.message || 'Failed to add collaborator' },
        { status: 500 }
      )
    }

    await supabase
      .from('note_collaboration_invites')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', inviteId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('accept collaborator invite error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
