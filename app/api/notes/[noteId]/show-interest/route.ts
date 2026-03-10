import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * POST /api/notes/[noteId]/show-interest
 * Express interest in an open call: add user to metadata.interested and send DM to all authors.
 * Body: { message?: string } - default "I'm interested"
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { noteId: string } }
) {
  try {
    const { noteId } = params
    if (!noteId) {
      return NextResponse.json({ error: 'Note ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const message = typeof body.message === 'string' && body.message.trim()
      ? body.message.trim()
      : "I'm interested"

    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('id, type, metadata, owner_account_id, collaborator_account_ids')
      .eq('id', noteId)
      .maybeSingle()

    if (noteError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    if (note.type !== 'open_call') {
      return NextResponse.json(
        { error: 'Not an open call note' },
        { status: 400 }
      )
    }

    // Don't allow authors to show interest in their own open call
    const authorIds = new Set<string>([
      note.owner_account_id,
      ...(Array.isArray(note.collaborator_account_ids) ? note.collaborator_account_ids : []),
    ])
    if (authorIds.has(user.id)) {
      return NextResponse.json(
        { error: 'Authors cannot show interest in their own open call' },
        { status: 400 }
      )
    }

    const metadata = (note.metadata as { interested?: string[] }) ?? {}
    const current = Array.isArray(metadata.interested) ? metadata.interested : []
    const hasUser = current.includes(user.id)
    const updated = hasUser ? current : [...current, user.id]

    const serviceSupabase = createServiceClient()
    const { error: updateError } = await serviceSupabase
      .from('notes')
      .update({
        metadata: {
          ...metadata,
          interested: updated,
        },
      })
      .eq('id', noteId)

    if (updateError) {
      console.error('[show-interest] update metadata failed', updateError)
      return NextResponse.json(
        { error: updateError.message || 'Failed to update' },
        { status: 500 }
      )
    }

    // Send DM to each author (owner + collaborators): note card (clickable) + message below
    for (const authorId of authorIds) {
      if (authorId === user.id) continue
      const { error: msgError } = await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: authorId,
        text: message,
        note_id: noteId,
      })
      if (msgError) {
        console.error('[show-interest] failed to send message to', authorId, msgError)
        // Continue sending to other authors
      } else {
        // Remove conversation_completions so conversation appears in Active tab
        await supabase
          .from('conversation_completions')
          .delete()
          .eq('user_id', user.id)
          .eq('partner_id', authorId)
        const { data: friendship } = await supabase
          .from('friends')
          .select('*')
          .or(`and(user_id.eq.${user.id},friend_id.eq.${authorId}),and(user_id.eq.${authorId},friend_id.eq.${user.id})`)
          .maybeSingle()
        const isFriend = friendship && friendship.status === 'accepted'
        if (isFriend) {
          await supabase
            .from('conversation_completions')
            .delete()
            .eq('user_id', authorId)
            .eq('partner_id', user.id)
        }
      }
    }

    return NextResponse.json({
      success: true,
      interested: updated,
    })
  } catch (err: unknown) {
    console.error('[show-interest]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
