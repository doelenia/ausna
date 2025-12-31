import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/friends/[friendId] - Send a friend request
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { friendId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { friendId } = params

    if (!friendId) {
      return NextResponse.json(
        { error: 'friendId is required' },
        { status: 400 }
      )
    }

    if (friendId === user.id) {
      return NextResponse.json(
        { error: 'Cannot send friend request to yourself' },
        { status: 400 }
      )
    }

    // Verify friend exists by checking if they have a human portfolio
    const { data: friendPortfolio, error: friendError } = await supabase
      .from('portfolios')
      .select('id')
      .eq('user_id', friendId)
      .eq('type', 'human')
      .maybeSingle()

    if (friendError || !friendPortfolio) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Check if friendship already exists
    const { data: existingFriendship } = await supabase
      .from('friends')
      .select('*')
      .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)
      .maybeSingle()

    if (existingFriendship) {
      if (existingFriendship.status === 'accepted') {
        return NextResponse.json(
          { error: 'Already friends' },
          { status: 400 }
        )
      } else {
        return NextResponse.json(
          { error: 'Friend request already sent' },
          { status: 400 }
        )
      }
    }

    // Create friend request
    const { data: friendship, error } = await supabase
      .from('friends')
      .insert({
        user_id: user.id,
        friend_id: friendId,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating friend request:', error)
      return NextResponse.json(
        { error: 'Failed to send friend request' },
        { status: 500 }
      )
    }

    // Send a message notification about the friend request
    // This will appear in the invitations tab
    await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        receiver_id: friendId,
        text: `sent you a friend request`,
      })

    return NextResponse.json({ success: true, friendship })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/friends/[friendId] - Accept a friend request
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { friendId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { friendId } = params

    if (!friendId) {
      return NextResponse.json(
        { error: 'friendId is required' },
        { status: 400 }
      )
    }

    // Find pending friend request where current user is the receiver
    const { data: friendship, error: findError } = await supabase
      .from('friends')
      .select('*')
      .eq('user_id', friendId)
      .eq('friend_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (findError || !friendship) {
      return NextResponse.json(
        { error: 'Friend request not found' },
        { status: 404 }
      )
    }

    // Accept the friend request
    const { data: updatedFriendship, error: updateError } = await supabase
      .from('friends')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', friendship.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error accepting friend request:', updateError)
      return NextResponse.json(
        { error: 'Failed to accept friend request' },
        { status: 500 }
      )
    }

    // Remove completion records for both sides (accepting makes both sides active)
    await supabase
      .from('conversation_completions')
      .delete()
      .or(`and(user_id.eq.${user.id},partner_id.eq.${friendId}),and(user_id.eq.${friendId},partner_id.eq.${user.id})`)

    // Send a message notification about accepting the friend request
    await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        receiver_id: friendId,
        text: `accepted your friend request`,
      })

    return NextResponse.json({ success: true, friendship: updatedFriendship })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/friends/[friendId] - Remove/unfriend or cancel pending request
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { friendId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { friendId } = params

    if (!friendId) {
      return NextResponse.json(
        { error: 'friendId is required' },
        { status: 400 }
      )
    }

    // Check if there's a pending request from current user
    const { data: pendingRequest } = await supabase
      .from('friends')
      .select('*')
      .eq('user_id', user.id)
      .eq('friend_id', friendId)
      .eq('status', 'pending')
      .maybeSingle()

    if (pendingRequest) {
      // Cancel pending request (delete only this one)
      const { error } = await supabase
        .from('friends')
        .delete()
        .eq('id', pendingRequest.id)

      if (error) {
        console.error('Error canceling friend request:', error)
        return NextResponse.json(
          { error: 'Failed to cancel friend request' },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, canceled: true })
    }

    // Otherwise, delete friendship in both directions (unfriend)
    const { error } = await supabase
      .from('friends')
      .delete()
      .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)

    if (error) {
      console.error('Error deleting friendship:', error)
      return NextResponse.json(
        { error: 'Failed to remove friend' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/friends/[friendId] - Check friend status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { friendId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ isFriend: false, status: null })
    }

    const { friendId } = params

    if (!friendId) {
      return NextResponse.json(
        { error: 'friendId is required' },
        { status: 400 }
      )
    }

    // Check friendship status
    const { data: friendship } = await supabase
      .from('friends')
      .select('*')
      .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)
      .maybeSingle()

    if (!friendship) {
      return NextResponse.json({ isFriend: false, status: null })
    }

    // Determine the status from the user's perspective
    let status: 'pending_sent' | 'pending_received' | 'accepted' | null = null
    if (friendship.status === 'accepted') {
      status = 'accepted'
    } else if (friendship.user_id === user.id) {
      status = 'pending_sent'
    } else {
      status = 'pending_received'
    }

    return NextResponse.json({
      isFriend: friendship.status === 'accepted',
      status,
      friendship,
    })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

