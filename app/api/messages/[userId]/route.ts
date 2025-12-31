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
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10')
    const before = searchParams.get('before') // ISO timestamp to fetch messages before this

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // Build query for messages between current user and the specified user
    let query = supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
      .order('created_at', { ascending: false })
      .limit(limit)

    // If 'before' is provided, fetch messages older than that timestamp
    if (before) {
      query = query.lt('created_at', before)
    }

    const { data: messages, error } = await query
    
    // Reverse to get chronological order (oldest first)
    const filteredMessages = (messages || []).reverse()

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

