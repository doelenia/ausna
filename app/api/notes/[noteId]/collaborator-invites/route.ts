import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notes/[noteId]/collaborator-invites
 * Body: { invitee_id: string }
 * Owner only. Creates a collaboration invite and sends a message to the invitee.
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

    const body = await request.json().catch(() => ({}))
    const invitee_id = body.invitee_id as string | undefined
    if (!invitee_id || typeof invitee_id !== 'string') {
      return NextResponse.json({ error: 'invitee_id is required' }, { status: 400 })
    }

    if (invitee_id === user.id) {
      return NextResponse.json(
        { error: 'Cannot invite yourself' },
        { status: 400 }
      )
    }

    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('id, owner_account_id, collaborator_account_ids')
      .eq('id', noteId)
      .single()

    if (noteError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    if (note.owner_account_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the note owner can invite collaborators' },
        { status: 403 }
      )
    }

    const currentCollaborators = (note.collaborator_account_ids || []) as string[]
    if (currentCollaborators.includes(invitee_id)) {
      return NextResponse.json(
        { error: 'User is already a collaborator' },
        { status: 400 }
      )
    }

    // Check for existing pending invite
    const { data: existing } = await supabase
      .from('note_collaboration_invites')
      .select('id')
      .eq('note_id', noteId)
      .eq('invitee_id', invitee_id)
      .eq('status', 'pending')
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'Invitation already sent' },
        { status: 400 }
      )
    }

    const { data: invite, error: inviteError } = await supabase
      .from('note_collaboration_invites')
      .insert({
        note_id: noteId,
        inviter_id: user.id,
        invitee_id,
        status: 'pending',
      })
      .select('id')
      .single()

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: inviteError?.message || 'Failed to create invite' },
        { status: 500 }
      )
    }

    // Send message to invitee (so they see the invite and can accept)
    const { error: msgError } = await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: invitee_id,
      text: 'You\'ve been invited to collaborate on a note.',
      note_id: noteId,
    })

    if (msgError) {
      console.error('Failed to send collaboration invite message:', msgError)
      // Don't fail the request - invite was created
    }

    return NextResponse.json({
      success: true,
      invite_id: invite.id,
    })
  } catch (error: any) {
    console.error('collaborator-invites POST error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
