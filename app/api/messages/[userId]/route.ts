import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/messages/[userId] - Get messages with a specific user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId } = params

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // Get messages between current user and the specified user
    // Query messages where current user is sender and specified user is receiver, OR vice versa
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: true })
    
    // Filter to only messages between these two users
    const filteredMessages = (messages || []).filter(
      (msg) =>
        (msg.sender_id === user.id && msg.receiver_id === userId) ||
        (msg.sender_id === userId && msg.receiver_id === user.id)
    )

    if (error) {
      console.error('Error fetching messages:', error)
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      )
    }

    // Mark messages as read (update read_at for messages received by current user)
    if (filteredMessages && filteredMessages.length > 0) {
      const unreadMessageIds = filteredMessages
        .filter(
          (msg) =>
            msg.receiver_id === user.id && msg.read_at === null
        )
        .map((msg) => msg.id)

      if (unreadMessageIds.length > 0) {
        await supabase
          .from('messages')
          .update({ read_at: new Date().toISOString() })
          .in('id', unreadMessageIds)
      }
    }

    return NextResponse.json({ messages: filteredMessages || [] })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

