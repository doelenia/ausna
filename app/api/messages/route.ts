import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/messages - Send a message
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

    const { receiver_id, text } = await request.json()

    if (!receiver_id || !text) {
      return NextResponse.json(
        { error: 'receiver_id and text are required' },
        { status: 400 }
      )
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
        text: text.trim(),
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

    // Get all messages where user is sender or receiver
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching messages:', error)
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      )
    }

    // Group messages by conversation partner
    const conversationsMap = new Map<string, any>()

    for (const message of messages || []) {
      const partnerId =
        message.sender_id === user.id
          ? message.receiver_id
          : message.sender_id

      if (!conversationsMap.has(partnerId)) {
        conversationsMap.set(partnerId, {
          partner_id: partnerId,
          last_message: message,
          unread_count: 0,
        })
      }

      const conversation = conversationsMap.get(partnerId)!

      // Update last message if this one is newer
      if (
        new Date(message.created_at) >
        new Date(conversation.last_message.created_at)
      ) {
        conversation.last_message = message
      }

      // Count unread messages
      if (
        message.receiver_id === user.id &&
        message.read_at === null
      ) {
        conversation.unread_count++
      }
    }

    // Convert map to array
    const conversations = Array.from(conversationsMap.values())

    // Sort by last message time (most recent first)
    conversations.sort(
      (a, b) =>
        new Date(b.last_message.created_at).getTime() -
        new Date(a.last_message.created_at).getTime()
    )

    return NextResponse.json({ conversations })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

