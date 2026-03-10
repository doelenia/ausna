import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getConversationsForUser } from '@/lib/messages/conversations'

/**
 * POST /api/messages - Send a message
 *
 * Both `sender_id` and `receiver_id` are auth user IDs. We verify the
 * receiver by checking they have a human portfolio (`portfolios.user_id`)
 * but we never store portfolio IDs in the `messages` or
 * `conversation_completions` tables.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { receiver_id, text, note_id, message_type } = await request.json()

    if (!receiver_id) {
      return NextResponse.json(
        { error: 'receiver_id is required' },
        { status: 400 }
      )
    }

    // Text is required unless note_id is provided (in which case we can send just the note)
    if (!text && !note_id) {
      return NextResponse.json(
        { error: 'text or note_id is required' },
        { status: 400 }
      )
    }

    // If note_id is provided, verify the note exists and is not deleted
    if (note_id) {
      const { data: note, error: noteError } = await supabase
        .from('notes')
        .select('id, deleted_at')
        .eq('id', note_id)
        .maybeSingle()

      if (noteError || !note || note.deleted_at) {
        return NextResponse.json(
          { error: 'Note not found or has been deleted' },
          { status: 404 }
        )
      }
    }

    if (receiver_id === user.id) {
      return NextResponse.json(
        { error: 'Cannot send message to yourself' },
        { status: 400 }
      )
    }

    // Verify receiver exists by checking if they have a human portfolio
    const { data: receiverPortfolio, error: receiverError } = await supabase
      .from('portfolios')
      .select('id')
      .eq('user_id', receiver_id)
      .eq('type', 'human')
      .maybeSingle()

    if (receiverError || !receiverPortfolio) {
      return NextResponse.json({ error: 'Receiver not found' }, { status: 404 })
    }

    // Insert message
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        receiver_id,
        text: text ? text.trim() : '', // Allow empty string if note_id is provided
        note_id: note_id || null,
        // Optional message type (e.g. comment previews, portfolio shares)
        message_type: typeof message_type === 'string' && message_type.trim() ? message_type.trim() : null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating message:', error)
      return NextResponse.json(
        { error: 'Failed to send message' },
        { status: 500 }
      )
    }

    // Check friendship status
    const { data: friendship } = await supabase
      .from('friends')
      .select('*')
      .or(`and(user_id.eq.${user.id},friend_id.eq.${receiver_id}),and(user_id.eq.${receiver_id},friend_id.eq.${user.id})`)
      .maybeSingle()

    const isFriend = friendship && friendship.status === 'accepted'

    // Remove completion record for sender (sending a message makes sender's side active)
    await supabase
      .from('conversation_completions')
      .delete()
      .eq('user_id', user.id)
      .eq('partner_id', receiver_id)

    // If friends, also remove receiver's completion (friends set both sides to active)
    if (isFriend) {
      await supabase
        .from('conversation_completions')
        .delete()
        .eq('user_id', receiver_id)
        .eq('partner_id', user.id)
    }

    return NextResponse.json({ success: true, message })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/messages - Get list of conversations
 * Supports ?tab=invitations or ?tab=active query parameter
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const tab = searchParams.get('tab') || 'active' // Default to active

    try {
      const conversations = await getConversationsForUser(
        user.id,
        tab === 'invitations' ? 'invitations' : 'active'
      )
      return NextResponse.json({ conversations })
    } catch (e: any) {
      console.error('Error fetching messages:', e)
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

