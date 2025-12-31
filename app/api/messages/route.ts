import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getHumanPortfolio } from '@/lib/portfolio/human'

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

    // Get all friendships for the user
    const { data: friendships } = await supabase
      .from('friends')
      .select('*')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)

    // Create a map of friend IDs (accepted friendships only)
    const friendIds = new Set<string>()
    friendships?.forEach((friendship) => {
      if (friendship.status === 'accepted') {
        if (friendship.user_id === user.id) {
          friendIds.add(friendship.friend_id)
        } else {
          friendIds.add(friendship.user_id)
        }
      }
    })

    // Get conversation completions for current user
    const { data: myCompletions } = await supabase
      .from('conversation_completions')
      .select('partner_id, completed_at')
      .eq('user_id', user.id)

    const myCompletionMap = new Map<string, string>()
    myCompletions?.forEach((completion) => {
      myCompletionMap.set(completion.partner_id, completion.completed_at)
    })

    // Get conversation completions for partners (to check their side status)
    const partnerIds = Array.from(
      new Set(
        (messages || []).map((msg) =>
          msg.sender_id === user.id ? msg.receiver_id : msg.sender_id
        )
      )
    )

    const partnerCompletionMap = new Map<string, string>()
    
    if (partnerIds.length > 0) {
      // Query completions where partner completed conversation with current user
      const { data: partnerCompletions } = await supabase
        .from('conversation_completions')
        .select('user_id, partner_id, completed_at')
        .in('user_id', partnerIds)
        .eq('partner_id', user.id)

      console.log('[DEBUG] Partner completions found:', {
        partnerIds,
        completions: partnerCompletions,
      })

      partnerCompletions?.forEach((completion) => {
        partnerCompletionMap.set(completion.user_id, completion.completed_at)
        console.log(`[DEBUG] Added partner completion: ${completion.user_id} completed at ${completion.completed_at}`)
      })
    }
    
    console.log('[DEBUG] Partner completion map:', Array.from(partnerCompletionMap.entries()))

    // Group messages by conversation partner
    const conversationsMap = new Map<string, any>()

    for (const message of messages || []) {
      const partnerId =
        message.sender_id === user.id
          ? message.receiver_id
          : message.sender_id

      if (!conversationsMap.has(partnerId)) {
        const isFriend = friendIds.has(partnerId)
        const myCompletedAt = myCompletionMap.get(partnerId)
        const partnerCompletedAt = partnerCompletionMap.get(partnerId)

        // Determine if my side is active
        // Active = not completed (completion record doesn't exist)
        // Inactive = completed (completion record exists)
        const mySideActive = !myCompletedAt

        // Determine if partner's side is active
        // Active = not completed (completion record doesn't exist)
        // Inactive = completed (completion record exists)
        const partnerSideActive = !partnerCompletedAt
        
        console.log(`[DEBUG] Initial active states for partner ${partnerId}:`, {
          myCompletedAt,
          partnerCompletedAt,
          mySideActive,
          partnerSideActive,
        })

        // Determine status message
        // Note: We'll recalculate this when we process all messages, but set initial value
        let statusMessage: string | null = null
        if (partnerCompletedAt) {
          const lastMessageTime = new Date(message.created_at)
          const partnerCompletedTime = new Date(partnerCompletedAt)
          const isLastMessageFromMe = message.sender_id === user.id
          
          console.log(`[DEBUG] Partner ${partnerId} completion check:`, {
            lastMessageTime: lastMessageTime.toISOString(),
            partnerCompletedTime: partnerCompletedTime.toISOString(),
            isLastMessageFromMe,
            messageCreatedAt: message.created_at,
            partnerCompletedAt,
          })
          
          if (lastMessageTime <= partnerCompletedTime) {
            // Last message was before or at partner's completion
            // Partner completed, I haven't sent a new message
            statusMessage = 'partner_completed'
            console.log(`[DEBUG] Setting status_message to 'partner_completed' for partner ${partnerId}`)
          } else if (isLastMessageFromMe) {
            // I sent a message after partner completed
            statusMessage = 'waiting_for_accept'
            console.log(`[DEBUG] Setting status_message to 'waiting_for_accept' for partner ${partnerId}`)
          }
        } else {
          console.log(`[DEBUG] No partner completion found for partner ${partnerId}`)
        }

        conversationsMap.set(partnerId, {
          partner_id: partnerId,
          last_message: message,
          unread_count: 0,
          is_friend: isFriend,
          my_completed_at: myCompletedAt || null,
          partner_completed_at: partnerCompletedAt || null,
          my_side_active: mySideActive,
          partner_side_active: partnerSideActive,
          status_message: statusMessage,
        })
      }

      const conversation = conversationsMap.get(partnerId)!

      // Update last message if this one is newer
      if (
        new Date(message.created_at) >
        new Date(conversation.last_message.created_at)
      ) {
        conversation.last_message = message
        
        // Recalculate active states (based on completion records, not time)
        const myCompletedAt = myCompletionMap.get(partnerId)
        const partnerCompletedAt = partnerCompletionMap.get(partnerId)
        
        // Active = not completed (completion record doesn't exist)
        conversation.my_side_active = !myCompletedAt
        conversation.partner_side_active = !partnerCompletedAt
        
        // Update status message
        if (partnerCompletedAt) {
          const lastMessageTime = new Date(message.created_at)
          const partnerCompletedTime = new Date(partnerCompletedAt)
          const isLastMessageFromMe = message.sender_id === user.id
          
          console.log(`[DEBUG] Updating status for partner ${partnerId} (newer message):`, {
            lastMessageTime: lastMessageTime.toISOString(),
            partnerCompletedTime: partnerCompletedTime.toISOString(),
            isLastMessageFromMe,
            currentStatus: conversation.status_message,
          })
          
          if (lastMessageTime <= partnerCompletedTime) {
            // Last message was before or at partner's completion
            // Partner completed, I haven't sent a new message
            conversation.status_message = 'partner_completed'
            console.log(`[DEBUG] Updated status_message to 'partner_completed'`)
          } else if (isLastMessageFromMe) {
            // I sent a message after partner completed
            conversation.status_message = 'waiting_for_accept'
            console.log(`[DEBUG] Updated status_message to 'waiting_for_accept'`)
          } else {
            // Partner sent a message after their completion (they uncompleted it)
            conversation.status_message = null
            console.log(`[DEBUG] Updated status_message to null (partner uncompleted)`)
          }
        } else {
          conversation.status_message = null
        }
      }

      // Count unread messages
      if (
        message.receiver_id === user.id &&
        message.read_at === null
      ) {
        conversation.unread_count++
      }
    }

    // Filter conversations based on tab
    let filteredConversations = Array.from(conversationsMap.values())
    
    console.log(`[DEBUG] Before filtering for tab="${tab}": ${filteredConversations.length} conversations`)

    if (tab === 'invitations') {
      // Invitations: 
      // - Non-friends where my side is inactive (completed and no new message)
      // - Friends where my side is inactive (completed and no new message)
      filteredConversations = filteredConversations.filter((conv) => {
        const shouldInclude = !conv.my_side_active
        console.log(`[DEBUG] Invitations filter for ${conv.partner_id}: my_side_active=${conv.my_side_active}, include=${shouldInclude}`)
        return shouldInclude
      })
      console.log(`[DEBUG] After invitations filter: ${filteredConversations.length} conversations`)
    } else {
      // Active: conversations where my side is active
      filteredConversations = filteredConversations.filter((conv) => {
        const shouldInclude = conv.my_side_active
        console.log(`[DEBUG] Active filter for ${conv.partner_id}: my_side_active=${conv.my_side_active}, include=${shouldInclude}`)
        return shouldInclude
      })
      console.log(`[DEBUG] After active filter: ${filteredConversations.length} conversations`)
    }

    // Sort by last message time (most recent first)
    filteredConversations.sort(
      (a, b) =>
        new Date(b.last_message.created_at).getTime() -
        new Date(a.last_message.created_at).getTime()
    )

    // Ensure status messages and active states are set correctly for all conversations
    // Recalculate based on the actual last message
    console.log(`[DEBUG] Final status check for tab="${tab}" with ${filteredConversations.length} conversations`)
    console.log(`[DEBUG] Partner completion map at final check:`, Array.from(partnerCompletionMap.entries()))
    console.log(`[DEBUG] My completion map:`, Array.from(myCompletionMap.entries()))
    
    for (const conv of filteredConversations) {
      const myCompletedAt = myCompletionMap.get(conv.partner_id)
      const partnerCompletedAt = partnerCompletionMap.get(conv.partner_id)
      const lastMessageTime = new Date(conv.last_message.created_at)
      const isLastMessageFromMe = conv.last_message.sender_id === user.id
      
      // Recalculate active states (based on completion records, not time)
      // Active = not completed (completion record doesn't exist)
      const mySideActive = !myCompletedAt
      const partnerSideActive = !partnerCompletedAt
      
      console.log(`[DEBUG] Conversation with ${conv.partner_id} (tab: ${tab}):`, {
        myCompletedAt,
        partnerCompletedAt,
        lastMessageSender: isLastMessageFromMe ? 'me' : 'partner',
        lastMessageTime: conv.last_message.created_at,
        lastMessageTimeISO: lastMessageTime.toISOString(),
        mySideActive_old: conv.my_side_active,
        mySideActive_new: mySideActive,
        partnerSideActive_old: conv.partner_side_active,
        partnerSideActive_new: partnerSideActive,
        status_message_before: conv.status_message,
      })
      
      // Update active states
      conv.my_side_active = mySideActive
      conv.partner_side_active = partnerSideActive
      
      // Always recalculate status message if partner completed
      // This should work for both active and invitations tabs
      if (partnerCompletedAt) {
        const partnerCompletedTime = new Date(partnerCompletedAt)
        console.log(`[DEBUG] Partner ${conv.partner_id} completed at ${partnerCompletedTime.toISOString()}`)
        console.log(`[DEBUG] Comparing: lastMessageTime (${lastMessageTime.toISOString()}) vs partnerCompletedTime (${partnerCompletedTime.toISOString()})`)
        console.log(`[DEBUG] lastMessageTime <= partnerCompletedTime: ${lastMessageTime <= partnerCompletedTime}`)
        console.log(`[DEBUG] isLastMessageFromMe: ${isLastMessageFromMe}`)
        
        if (lastMessageTime <= partnerCompletedTime) {
          // Last message was before or at partner's completion
          // Partner completed, I haven't sent a new message
          conv.status_message = 'partner_completed'
          console.log(`[DEBUG] Set status_message to 'partner_completed'`)
        } else if (isLastMessageFromMe) {
          // I sent a message after partner completed
          conv.status_message = 'waiting_for_accept'
          console.log(`[DEBUG] Set status_message to 'waiting_for_accept'`)
        } else {
          // Partner sent a message after their completion (they uncompleted it)
          conv.status_message = null
          console.log(`[DEBUG] Set status_message to null (partner uncompleted)`)
        }
      } else {
        // No partner completion - clear status message
        conv.status_message = null
        console.log(`[DEBUG] No partner completion found for ${conv.partner_id}, cleared status_message`)
      }
      
      console.log(`[DEBUG] Final status_message for ${conv.partner_id}: ${conv.status_message}`)
    }

    // Fetch partner names for all conversations
    // Use human portfolio name consistently (prioritize basic.name)
    const conversationsWithNames = await Promise.all(
      filteredConversations.map(async (conv) => {
        try {
          const portfolio = await getHumanPortfolio(conv.partner_id)
          if (portfolio) {
            const metadata = portfolio.metadata as any
            const basic = metadata?.basic || {}
            // Prioritize basic.name from human portfolio, fallback to username
            const displayName = basic.name || metadata?.username || 'User'
            return {
              ...conv,
              partner_name: displayName,
            }
          }
        } catch (error) {
          console.error(`Error fetching partner name for ${conv.partner_id}:`, error)
        }
        return {
          ...conv,
          partner_name: 'User',
        }
      })
    )

    return NextResponse.json({ conversations: conversationsWithNames })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

