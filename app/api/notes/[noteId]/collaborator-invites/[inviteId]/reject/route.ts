import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notes/[noteId]/collaborator-invites/[inviteId]/reject
 * Invitee declines the collaboration invite.
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
      .select('id, invitee_id, status')
      .eq('id', inviteId)
      .eq('note_id', noteId)
      .single()

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    }

    if (invite.invitee_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the invitee can decline this invite' },
        { status: 403 }
      )
    }

    if (invite.status !== 'pending') {
      return NextResponse.json({ success: true })
    }

    await supabase
      .from('note_collaboration_invites')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', inviteId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('reject collaborator invite error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
