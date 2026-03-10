import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notes/[noteId]/collaborator-invites/me
 * Returns the current user's pending collaboration invite for this note, if any.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { noteId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ invite: null })
    }

    const noteId = params.noteId
    if (!noteId) {
      return NextResponse.json({ error: 'Note ID required' }, { status: 400 })
    }

    const { data: invite, error } = await supabase
      .from('note_collaboration_invites')
      .select('id, note_id, inviter_id, status')
      .eq('note_id', noteId)
      .eq('invitee_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Failed to fetch invite' },
        { status: 500 }
      )
    }

    return NextResponse.json({ invite: invite || null })
  } catch (error: any) {
    console.error('collaborator-invites/me error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
