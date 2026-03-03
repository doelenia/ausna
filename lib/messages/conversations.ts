import { createClient } from '@/lib/supabase/server'
import { getHumanPortfolio } from '@/lib/portfolio/human'

export type MessagesTab = 'active' | 'invitations'

export interface ConversationSummary {
  partner_id: string
  last_message: any
  unread_count: number
  is_friend: boolean
  my_completed_at: string | null
  partner_completed_at: string | null
  my_side_active: boolean
  partner_side_active: boolean
  status_message: string | null
  partner_name: string
  partner_avatar_url?: string | null
}

export async function getConversationsForUser(userId: string, tab: MessagesTab) {
  const supabase = await createClient()

  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message || 'Failed to fetch messages')
  }

  const { data: friendships } = await supabase
    .from('friends')
    .select('*')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)

  const friendIds = new Set<string>()
  friendships?.forEach((friendship) => {
    if (friendship.status === 'accepted') {
      if (friendship.user_id === userId) {
        friendIds.add(friendship.friend_id)
      } else {
        friendIds.add(friendship.user_id)
      }
    }
  })

  const { data: myCompletions } = await supabase
    .from('conversation_completions')
    .select('partner_id, completed_at')
    .eq('user_id', userId)

  const myCompletionMap = new Map<string, string>()
  myCompletions?.forEach((completion) => {
    myCompletionMap.set(completion.partner_id, completion.completed_at)
  })

  const partnerIds = Array.from(
    new Set(
      (messages || []).map((msg) =>
        msg.sender_id === userId ? msg.receiver_id : msg.sender_id
      )
    )
  )

  const partnerCompletionMap = new Map<string, string>()

  if (partnerIds.length > 0) {
    const { data: partnerCompletions } = await supabase
      .from('conversation_completions')
      .select('user_id, partner_id, completed_at')
      .in('user_id', partnerIds)
      .eq('partner_id', userId)

    partnerCompletions?.forEach((completion) => {
      partnerCompletionMap.set(completion.user_id, completion.completed_at)
    })
  }

  const conversationsMap = new Map<string, any>()

  for (const message of messages || []) {
    const partnerId =
      message.sender_id === userId ? message.receiver_id : message.sender_id

    if (!conversationsMap.has(partnerId)) {
      const isFriend = friendIds.has(partnerId)
      const myCompletedAt = myCompletionMap.get(partnerId)
      const partnerCompletedAt = partnerCompletionMap.get(partnerId)

      let mySideActive = !myCompletedAt
      let partnerSideActive = !partnerCompletedAt

      let statusMessage: string | null = null
      if (partnerCompletedAt) {
        const lastMessageTime = new Date(message.created_at)
        const partnerCompletedTime = new Date(partnerCompletedAt)
        const isLastMessageFromMe = message.sender_id === userId

        if (lastMessageTime <= partnerCompletedTime) {
          statusMessage = 'partner_completed'
        } else if (isLastMessageFromMe) {
          statusMessage = 'waiting_for_accept'
        }
      }

      if (isFriend) {
        mySideActive = true
        partnerSideActive = true
        statusMessage = null
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

    if (
      new Date(message.created_at) >
      new Date(conversation.last_message.created_at)
    ) {
      conversation.last_message = message

      const myCompletedAt = myCompletionMap.get(partnerId)
      const partnerCompletedAt = partnerCompletionMap.get(partnerId)

      conversation.my_side_active = !myCompletedAt
      conversation.partner_side_active = !partnerCompletedAt

      if (partnerCompletedAt) {
        const lastMessageTime = new Date(message.created_at)
        const partnerCompletedTime = new Date(partnerCompletedAt)
        const isLastMessageFromMe = message.sender_id === userId

        if (lastMessageTime <= partnerCompletedTime) {
          conversation.status_message = 'partner_completed'
        } else if (isLastMessageFromMe) {
          conversation.status_message = 'waiting_for_accept'
        } else {
          conversation.status_message = null
        }
      } else {
        conversation.status_message = null
      }

      if (conversation.is_friend) {
        conversation.my_side_active = true
        conversation.partner_side_active = true
        conversation.status_message = null
      }
    }

    if (message.receiver_id === userId && message.read_at === null) {
      conversation.unread_count++
    }
  }

  let filteredConversations = Array.from(conversationsMap.values())

  if (tab === 'invitations') {
    filteredConversations = filteredConversations.filter(
      (conv) => !conv.my_side_active
    )
  } else {
    filteredConversations = filteredConversations.filter(
      (conv) => conv.my_side_active
    )
  }

  filteredConversations.sort(
    (a, b) =>
      new Date(b.last_message.created_at).getTime() -
      new Date(a.last_message.created_at).getTime()
  )

  for (const conv of filteredConversations) {
    const myCompletedAt = myCompletionMap.get(conv.partner_id)
    const partnerCompletedAt = partnerCompletionMap.get(conv.partner_id)
    const lastMessageTime = new Date(conv.last_message.created_at)
    const isLastMessageFromMe = conv.last_message.sender_id === userId

    let mySideActive = !myCompletedAt
    let partnerSideActive = !partnerCompletedAt

    conv.my_side_active = mySideActive
    conv.partner_side_active = partnerSideActive

    if (partnerCompletedAt) {
      const partnerCompletedTime = new Date(partnerCompletedAt)

      if (lastMessageTime <= partnerCompletedTime) {
        conv.status_message = 'partner_completed'
      } else if (isLastMessageFromMe) {
        conv.status_message = 'waiting_for_accept'
      } else {
        conv.status_message = null
      }
    } else {
      conv.status_message = null
    }

    if (conv.is_friend) {
      conv.my_side_active = true
      conv.partner_side_active = true
      conv.status_message = null
    }
  }

  const conversationsWithNames = await Promise.all(
    filteredConversations.map(async (conv) => {
      try {
        const portfolio = await getHumanPortfolio(conv.partner_id)
        if (portfolio) {
          const metadata = portfolio.metadata as any
          const basic = metadata?.basic || {}
          const displayName = basic.name || metadata?.username || 'User'
          const avatarUrl =
            typeof basic.avatar === 'string' && basic.avatar.trim().length > 0
              ? basic.avatar.trim()
              : null
          return {
            ...conv,
            partner_name: displayName,
            partner_avatar_url: avatarUrl,
          }
        }
      } catch (error) {
        console.error(
          `Error fetching partner name for ${conv.partner_id}:`,
          error
        )
      }
      return {
        ...conv,
        partner_name: 'User',
        partner_avatar_url: null,
      }
    })
  )

  return conversationsWithNames as ConversationSummary[]
}

