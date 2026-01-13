'use client'

import { useEffect, useState, Suspense, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createHumanPortfolioHelpers } from '@/lib/portfolio/human-client'
import Link from 'next/link'
import { PortfolioInvitationCard } from '@/components/portfolio/PortfolioInvitationCard'
import { Portfolio } from '@/types/portfolio'
import { MessageNoteCard } from '@/components/notes/MessageNoteCard'
import { Title, Content, UIText, Button, Dropdown } from '@/components/ui'
import { Archive, ArrowLeft } from 'lucide-react'

interface Conversation {
  partner_id: string
  partner_name?: string
  last_message: {
    id: string
    sender_id: string
    receiver_id: string
    text: string
    created_at: string
    read_at: string | null
  }
  unread_count: number
  status_message?: string | null
}

interface PartnerInfo {
  id: string
  name: string
  avatar: string
}

function MessagesPageContent() {
  const searchParams = useSearchParams()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [partnerInfos, setPartnerInfos] = useState<Map<string, PartnerInfo>>(
    new Map()
  )
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'invitations' | 'active'>('active')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(
    searchParams.get('userId')
  )
  const supabase = createClient()
  const portfolioHelpers = createHumanPortfolioHelpers(supabase)

  const loadPartnerInfo = async (userId: string) => {
    try {
      const portfolio = await portfolioHelpers.getHumanPortfolio(userId)
      if (portfolio) {
        const metadata = portfolio.metadata as any
        const basic = metadata?.basic || {}
        // Prioritize basic.name from human portfolio, fallback to username
        const displayName = basic.name || metadata?.username || 'User'
        const avatarUrl = basic?.avatar || metadata?.avatar_url
        const finalAvatarUrl =
          avatarUrl ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`

        setPartnerInfos((prev) => {
          const newMap = new Map(prev)
          newMap.set(userId, {
            id: userId,
            name: displayName,
            avatar: finalAvatarUrl,
          })
          return newMap
        })
      }
    } catch (error) {
      console.error('Error loading partner info:', error)
    }
  }

  const loadConversations = async (tab: 'invitations' | 'active' = activeTab) => {
    try {
      const response = await fetch(`/api/messages?tab=${tab}`)
      if (!response.ok) {
        throw new Error('Failed to load conversations')
      }
      const data = await response.json()
      console.log('[DEBUG] Loaded conversations:', {
        tab,
        count: data.conversations?.length || 0,
        conversations: data.conversations?.map((c: any) => ({
          partner_id: c.partner_id,
          partner_name: c.partner_name,
          status_message: c.status_message,
          my_side_active: c.my_side_active,
          partner_side_active: c.partner_side_active,
        })),
      })
      setConversations(data.conversations || [])

      // Load partner info for each conversation
      // Merge with existing partnerInfos to prevent losing data
      const infos = new Map<string, PartnerInfo>(partnerInfos)
      for (const conv of data.conversations || []) {
        // Only load if not already in map
        if (!infos.has(conv.partner_id)) {
          try {
            const portfolio = await portfolioHelpers.getHumanPortfolio(
              conv.partner_id
            )
            if (portfolio) {
              const metadata = portfolio.metadata as any
              const basic = metadata?.basic || {}
              // Prioritize basic.name from human portfolio, fallback to username
              const displayName = basic.name || metadata?.username || 'User'
              const avatarUrl = basic?.avatar || metadata?.avatar_url
              const finalAvatarUrl =
                avatarUrl ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`

              infos.set(conv.partner_id, {
                id: conv.partner_id,
                name: displayName,
                avatar: finalAvatarUrl,
              })
            }
          } catch (error) {
            console.error('Error loading partner info:', error)
          }
        }
      }
      setPartnerInfos(infos)
    } catch (error) {
      console.error('Error loading conversations:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConversations(activeTab)
  }, [activeTab])

  useEffect(() => {
    const userId = searchParams.get('userId')
    if (userId) {
      setSelectedUserId(userId)
      if (!partnerInfos.has(userId)) {
        loadPartnerInfo(userId)
      }
    }
  }, [searchParams, partnerInfos])

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center"><Content>Loading conversations...</Content></div>
      </div>
    )
  }

  if (selectedUserId) {
    return (
      <ConversationView
        userId={selectedUserId}
        partnerInfo={partnerInfos.get(selectedUserId)}
        onMessageSent={() => {
          loadConversations()
        }}
      />
    )
  }

  const handleCompleteConversation = async (partnerId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const response = await fetch(`/api/conversations/${partnerId}/complete`, {
        method: 'POST',
      })
      if (response.ok) {
        loadConversations(activeTab)
      }
    } catch (error) {
      console.error('Error completing conversation:', error)
    }
  }

  return (
    <div className="bg-transparent p-6 h-full flex flex-col">
      <Title as="h1" className="mb-6">Messages</Title>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                activeTab === 'active'
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <UIText>Active</UIText>
            </button>
            <button
              onClick={() => setActiveTab('invitations')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                activeTab === 'invitations'
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <UIText>Invitations</UIText>
            </button>
          </div>

          {conversations.length === 0 ? (
            <div className="text-center py-12">
              <Content>
              {activeTab === 'active'
                ? 'No active conversations yet.'
                : 'No invitations yet.'}
              </Content>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv: any) => {
                const partnerInfo = partnerInfos.get(conv.partner_id)
                const displayName = partnerInfo?.name || 'User'
                const avatarUrl =
                  partnerInfo?.avatar ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`

                console.log('[DEBUG] Rendering conversation:', {
                  partner_id: conv.partner_id,
                  partner_name: conv.partner_name,
                  status_message: conv.status_message,
                  my_side_active: conv.my_side_active,
                  displayName,
                })

                return (
                  <div
                    key={conv.partner_id}
                    className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <button
                      onClick={() => setSelectedUserId(conv.partner_id)}
                      className="flex-1 flex items-center gap-4 text-left"
                    >
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        className="h-12 w-12 rounded-full object-cover border-2 border-gray-300"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <UIText as="h3" className="truncate">
                              {displayName}
                            </UIText>
                            {conv.status_message === 'waiting_for_accept' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                Waiting
                              </span>
                            )}
                            {conv.status_message === 'partner_completed' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                Archived
                              </span>
                            )}
                          </div>
                          <UIText as="span" className="ml-2">
                            {new Date(
                              conv.last_message.created_at
                            ).toLocaleDateString()}
                          </UIText>
                        </div>
                        {conv.status_message === 'waiting_for_accept' ? (
                          <UIText as="p" className="text-yellow-600 italic mt-1">
                            Waiting for {conv.partner_name || displayName} to accept invite
                          </UIText>
                        ) : conv.status_message === 'partner_completed' ? (
                          <UIText as="p" className="italic mt-1">
                            Chat is archived by {conv.partner_name || displayName}
                          </UIText>
                        ) : (
                          <UIText as="p" className="truncate mt-1">
                            {conv.last_message.text}
                          </UIText>
                        )}
                      </div>
                      {conv.unread_count > 0 && (
                        <span className="bg-blue-600 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center">
                          {conv.unread_count}
                        </span>
                      )}
                    </button>
                    {activeTab === 'active' && conv.my_side_active && (
                      <Dropdown
                        items={[
                          {
                            label: 'Archive',
                            onClick: () => {
                              const syntheticEvent = { stopPropagation: () => {} } as React.MouseEvent
                              handleCompleteConversation(conv.partner_id, syntheticEvent)
                            },
                            icon: Archive,
                          },
                        ]}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
    </div>
  )
}

function ConversationView({
  userId,
  partnerInfo,
  onMessageSent,
}: {
  userId: string
  partnerInfo?: PartnerInfo
  onMessageSent: () => void
}) {
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [sending, setSending] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [friendStatus, setFriendStatus] = useState<{
    isFriend: boolean
    status: 'pending_sent' | 'pending_received' | 'accepted' | null
  }>({ isFriend: false, status: null })
  const [portfolioInvitations, setPortfolioInvitations] = useState<Map<string, {
    invitationId: string
    portfolioId: string
    status: 'pending_sent' | 'pending_received' | 'accepted' | 'cancelled' | null
    created_at: string
    inviter_id: string
    invitee_id: string
    invitation_type?: string
  }>>(new Map())
  const [portfolioDetails, setPortfolioDetails] = useState<Map<string, any>>(new Map())
  const [isCompleting, setIsCompleting] = useState(false)
  const [conversationStatus, setConversationStatus] = useState<{
    my_side_active: boolean
    partner_side_active: boolean
    status_message: string | null
    partner_name?: string
  } | null>(null)
  const [localPartnerInfo, setLocalPartnerInfo] = useState<PartnerInfo | null>(partnerInfo || null)
  const lastMessageIdRef = useRef<string | null>(null)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const shouldScrollToBottomRef = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isUserScrollingRef = useRef(false)
  const preservedScrollTopRef = useRef<number | null>(null)
  const lastMessagesLengthRef = useRef(0)
  const supabase = createClient()
  const portfolioHelpers = createHumanPortfolioHelpers(supabase)

  const loadPartnerInfo = async () => {
    // Load partner info if not already loaded
    if (!localPartnerInfo) {
      try {
        const portfolio = await portfolioHelpers.getHumanPortfolio(userId)
        if (portfolio) {
          const metadata = portfolio.metadata as any
          const basic = metadata?.basic || {}
          // Prioritize basic.name from human portfolio, fallback to username
          const displayName = basic.name || metadata?.username || 'User'
          const avatarUrl = basic?.avatar || metadata?.avatar_url
          const finalAvatarUrl =
            avatarUrl ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`

          setLocalPartnerInfo({
            id: userId,
            name: displayName,
            avatar: finalAvatarUrl,
          })
        }
      } catch (error) {
        console.error('Error loading partner info:', error)
      }
    }
  }

  useEffect(() => {
    // Update local partner info if prop changes
    if (partnerInfo) {
      setLocalPartnerInfo(partnerInfo)
    } else {
      loadPartnerInfo()
    }
    // Reset scroll state when switching conversations
    setIsInitialLoad(true)
    shouldScrollToBottomRef.current = false
    lastMessageIdRef.current = null
    setHasNewMessages(false)
    isUserScrollingRef.current = false
    preservedScrollTopRef.current = null
    lastMessagesLengthRef.current = 0
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = null
    }
  }, [userId, partnerInfo])

  useEffect(() => {
    let currentUserId: string | null = null
    
    // Get current user ID first
    supabase.auth.getUser().then(({ data: { user } }) => {
      currentUserId = user?.id || null
    })

    loadMessages(false)
    loadFriendStatus()
    loadPortfolioInvitations()
    loadConversationStatus()
    loadPartnerInfo() // Ensure partner info is loaded

    // Set up realtime subscription for new messages
    const channel = supabase
      .channel(`messages:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `or(sender_id.eq.${userId},receiver_id.eq.${userId})`,
        },
        async (payload) => {
          const newMessage = payload.new as any
          
          // Get current user to verify message is for this conversation
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return
          
          // Only add message if it's between current user and conversation partner
          const isRelevantMessage = 
            (newMessage.sender_id === user.id && newMessage.receiver_id === userId) ||
            (newMessage.sender_id === userId && newMessage.receiver_id === user.id)
          
          if (isRelevantMessage) {
            // Check if message already exists (avoid duplicates)
            setMessages(prev => {
              const exists = prev.some(m => m.id === newMessage.id)
              if (exists) return prev
              
              // Add new message at the end (newest messages)
              const updated = [...prev, newMessage]
              // Only limit to last 100 messages if we're at the bottom (user hasn't scrolled up)
              // Check if user is near bottom (scrollTop < 200 in column-reverse)
              const container = messagesContainerRef.current
              const isNearBottom = container && container.scrollTop < 200
              // If user has scrolled up to load older messages, keep all messages
              // Otherwise, limit to 100 for performance
              return isNearBottom && updated.length > 100 ? updated.slice(-100) : updated
            })
            
            // Mark as read if current user is receiver
            if (newMessage.receiver_id === user.id && !newMessage.read_at) {
              supabase
                .from('messages')
                .update({ read_at: new Date().toISOString() })
                .eq('id', newMessage.id)
                .then(() => {
                  // Refresh conversation status to update unread count
      loadConversationStatus()
                  onMessageSent() // Refresh conversations list
                })
            }
          }
        }
      )
      .subscribe()

    // Set up subscription for conversation status changes
    const conversationChannel = supabase
      .channel(`conversations:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_completions',
        },
        () => {
          loadConversationStatus()
        }
      )
      .subscribe()

    // Set up subscription for portfolio invitations
    const invitationsChannel = supabase
      .channel(`invitations:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'portfolio_invitations',
        },
        () => {
      loadPortfolioInvitations()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
      conversationChannel.unsubscribe()
      invitationsChannel.unsubscribe()
    }
  }, [userId])

  const loadConversationStatus = async () => {
    try {
      // Query both active and invitations tabs to find the conversation
      // since we don't know which tab it's in
      const [activeResponse, invitationsResponse] = await Promise.all([
        fetch('/api/messages?tab=active'),
        fetch('/api/messages?tab=invitations'),
      ])
      
      let conv: any = null
      if (activeResponse.ok) {
        const data = await activeResponse.json()
        conv = data.conversations?.find((c: any) => c.partner_id === userId)
      }
      
      if (!conv && invitationsResponse.ok) {
        const data = await invitationsResponse.json()
        conv = data.conversations?.find((c: any) => c.partner_id === userId)
      }
      
      console.log('[DEBUG] Conversation status for', userId, ':', {
        found: !!conv,
        conversation: conv ? {
          partner_id: conv.partner_id,
          partner_name: conv.partner_name,
          status_message: conv.status_message,
          my_side_active: conv.my_side_active,
          partner_side_active: conv.partner_side_active,
        } : null,
      })
      
      if (conv) {
        setConversationStatus({
          my_side_active: conv.my_side_active,
          partner_side_active: conv.partner_side_active,
          status_message: conv.status_message,
          partner_name: conv.partner_name,
        })
      } else {
        // If not found in either tab, set to null to clear any previous status
        setConversationStatus(null)
      }
    } catch (error) {
      console.error('Error loading conversation status:', error)
    }
  }

  const loadFriendStatus = async () => {
    try {
      const response = await fetch(`/api/friends/${userId}`)
      if (response.ok) {
        const data = await response.json()
        setFriendStatus({
          isFriend: data.isFriend || false,
          status: data.status || null,
        })
      }
    } catch (error) {
      console.error('Error loading friend status:', error)
    }
  }

  const loadPortfolioInvitations = async () => {
    try {
      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Query ALL invitations (pending, accepted, cancelled) where current user is inviter or invitee
      // and the other party is the conversation partner
      // Note: We load ALL statuses including 'cancelled' so cancelled invitations can be matched to messages
      // This ensures portfolio cards show correctly for all invite messages, even cancelled ones
      const { data: invitations, error } = await supabase
        .from('portfolio_invitations')
        .select('id, portfolio_id, inviter_id, invitee_id, status, created_at, invitation_type')
        .or(`and(inviter_id.eq.${user.id},invitee_id.eq.${userId}),and(inviter_id.eq.${userId},invitee_id.eq.${user.id})`)
        .order('created_at', { ascending: false }) // Most recent first

      if (error) {
        console.error('Error loading portfolio invitations:', error)
        return
      }

      // Map invitation IDs to invitation details
      // Store all invitations, not just one per portfolio, so we can match messages accurately
      const invitationMap = new Map<string, {
        invitationId: string
        portfolioId: string
        status: 'pending_sent' | 'pending_received' | 'accepted' | 'cancelled' | null
        created_at: string
        inviter_id: string
        invitee_id: string
        invitation_type?: string
      }>()

      invitations?.forEach((invitation: any) => {
        let status: 'pending_sent' | 'pending_received' | 'accepted' | 'cancelled' | null = null
        if (invitation.status === 'accepted') {
          status = 'accepted'
        } else if (invitation.status === 'cancelled') {
          status = 'cancelled'
        } else if (invitation.inviter_id === user.id) {
            status = 'pending_sent'
          } else {
            status = 'pending_received'
          }
        
        // Use invitation ID as key to store all invitations
        invitationMap.set(invitation.id, {
          invitationId: invitation.id,
            portfolioId: invitation.portfolio_id,
            status,
            created_at: invitation.created_at,
          inviter_id: invitation.inviter_id,
          invitee_id: invitation.invitee_id,
          invitation_type: invitation.invitation_type || 'member',
          })
      })

      setPortfolioInvitations(invitationMap)

      // Load portfolio details for all unique portfolios
      const portfolioIds = Array.from(new Set(Array.from(invitationMap.values()).map(inv => inv.portfolioId)))
      if (portfolioIds.length > 0) {
        const { data: portfolios, error: portfoliosError } = await supabase
          .from('portfolios')
          .select('*')
          .in('id', portfolioIds)

        if (!portfoliosError && portfolios) {
          const portfolioMap = new Map<string, any>()
          portfolios.forEach((portfolio: any) => {
            portfolioMap.set(portfolio.id, portfolio)
          })
          setPortfolioDetails(portfolioMap)
        }
      }
    } catch (error) {
      console.error('Error loading portfolio invitations:', error)
    }
  }

  const loadMessages = async (loadOlder: boolean = false) => {
    try {
      if (loadOlder) {
        setLoadingMore(true)
        // Save scroll position before loading older messages
        const container = messagesContainerRef.current
        const previousScrollHeight = container?.scrollHeight || 0
        const previousScrollTop = container?.scrollTop || 0

        // Get the oldest message timestamp if loading older messages
        const before = messages.length > 0 ? messages[0].created_at : undefined

        const url = `/api/messages/${userId}?limit=10${before ? `&before=${encodeURIComponent(before)}` : ''}`
        const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Failed to load messages')
      }
      const data = await response.json()
        const newMessages = data.messages || []
        
        // Prepend older messages (they'll appear at the top in column-reverse)
        setMessages(prev => [...newMessages, ...prev])
        setHasMore(newMessages.length === 10) // If we got less than 10, there are no more

        // Restore scroll position after new messages are rendered
        // In column-reverse, we need to preserve distance from top (oldest messages)
        // The scroll position should maintain the same distance from the top after new content is added
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (container) {
              const newScrollHeight = container.scrollHeight
              const heightDifference = newScrollHeight - previousScrollHeight
              // Adjust scrollTop to maintain the same visual position
              // In column-reverse, we add the height difference to scrollTop
              container.scrollTop = previousScrollTop + heightDifference
            }
          })
        })
      } else {
        setLoading(true)

        const url = `/api/messages/${userId}?limit=10`
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error('Failed to load messages')
        }
        const data = await response.json()
        const newMessages = data.messages || []
        
        // Replace with new messages (initial load or refresh)
        setMessages(newMessages)
        setHasMore(newMessages.length === 10)
        // Set the last message ID for auto-scroll detection
        if (newMessages.length > 0) {
          lastMessageIdRef.current = newMessages[newMessages.length - 1].id
        }
        // Mark that we should scroll to bottom on initial load
        // We'll do this after render is complete to avoid scroll jumps
        if (isInitialLoad && newMessages.length > 0) {
          shouldScrollToBottomRef.current = true
        }
        
        // Notify TopNav to refresh unread count immediately when entering conversation
        // Messages are marked as read by the API route when fetched
        if (isInitialLoad) {
          window.dispatchEvent(new CustomEvent('messagesMarkedAsRead'))
        }
      }
    } catch (error) {
      console.error('Error loading messages:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  // Stable scroll to bottom function - with column-reverse, scrollTop 0 is the bottom
  const scrollToBottomStable = useCallback((smooth: boolean = true) => {
    const container = messagesContainerRef.current
    if (container) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        if (smooth) {
          container.scrollTo({
            top: 0, // In column-reverse, 0 is the bottom
            behavior: 'smooth'
          })
        } else {
          container.scrollTop = 0 // In column-reverse, 0 is the bottom
        }
      })
    }
  }, [])


  // Handle initial scroll to bottom after all data is loaded (including invitations)
  // With column-reverse, the container naturally starts at bottom, but we ensure it's scrolled to 0
  useEffect(() => {
    if (shouldScrollToBottomRef.current && messages.length > 0 && !loading && !loadingMore) {
      // With column-reverse, we just need to ensure scrollTop is 0 (which is the bottom)
      // No need for complex timing since CSS handles the positioning
      requestAnimationFrame(() => {
        scrollToBottomStable(false) // Instant scroll to 0 (bottom in column-reverse)
        shouldScrollToBottomRef.current = false
        setIsInitialLoad(false)
      })
    }
  }, [messages.length, loading, loadingMore, scrollToBottomStable, portfolioInvitations.size, portfolioDetails.size])

  // Preserve scroll position during re-renders (e.g., when invitations load)
  // With column-reverse, scrollTop 0 = bottom, higher scrollTop = scrolled up
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container || isInitialLoad || loading || loadingMore) return
    
    // Only preserve scroll if:
    // 1. Messages array length hasn't changed (not loading new/old messages)
    // 2. User is not actively scrolling
    const messagesLengthChanged = messages.length !== lastMessagesLengthRef.current
    lastMessagesLengthRef.current = messages.length
    
    // If user is near bottom (scrollTop < 200) and not scrolling, maintain bottom position (scrollTop = 0)
    const isNearBottom = container.scrollTop < 200
    
    if (!messagesLengthChanged && isNearBottom && !isUserScrollingRef.current) {
      // After render, maintain bottom position (scrollTop = 0)
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = 0 // Bottom in column-reverse
        }
      })
    } else if (!messagesLengthChanged && preservedScrollTopRef.current !== null && !isUserScrollingRef.current) {
      // For other cases, preserve absolute scroll position
      requestAnimationFrame(() => {
        if (container && preservedScrollTopRef.current !== null) {
          container.scrollTop = preservedScrollTopRef.current
        }
      })
    }
  }, [messages, loading, loadingMore, isInitialLoad, portfolioInvitations.size, portfolioDetails.size])

  // Track new messages and show indicator if user is not at bottom
  // With column-reverse, scrollTop 0 means at bottom, scrollTop > 0 means scrolled up
  useEffect(() => {
    if (messages.length > 0 && !loadingMore && !loading && !isInitialLoad) {
      const container = messagesContainerRef.current
      if (container) {
        const latestMessage = messages[messages.length - 1]
        const isNewMessage = latestMessage && latestMessage.id !== lastMessageIdRef.current
        
        if (isNewMessage) {
          // In column-reverse, scrollTop 0 is bottom, so check if scrollTop is near 0 (within 200px)
          const isNearBottom = container.scrollTop < 200
          
          if (isNearBottom && !isUserScrollingRef.current) {
            // User is at bottom, scroll to show new message and clear indicator
            scrollToBottomStable(true) // Smooth scroll to 0 (bottom in column-reverse)
            setHasNewMessages(false)
          } else if (!isNearBottom) {
            // User is not at bottom, show indicator
            setHasNewMessages(true)
          }
          
          lastMessageIdRef.current = latestMessage.id
        }
      }
    }
  }, [messages, loadingMore, loading, isInitialLoad, scrollToBottomStable])

  // Handler to scroll to bottom when clicking "new messages" indicator
  const scrollToBottom = useCallback(() => {
    scrollToBottomStable(true)
    setHasNewMessages(false)
  }, [scrollToBottomStable])

  // Handle scroll to load more messages and check for new messages indicator
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget
    // Mark that user is actively scrolling
    isUserScrollingRef.current = true
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    // Reset flag after scroll ends (500ms of no scrolling)
    scrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false
    }, 500)
    
    // Preserve scroll position
    preservedScrollTopRef.current = container.scrollTop
    
    // In column-reverse, scrollTop near maxScrollHeight means scrolled to top (oldest messages)
    // Check if scrolled near the top (oldest messages) to load more
    // In column-reverse:
    // - scrollTop = 0 means scrolled to bottom (newest messages)
    // - scrollTop increases as you scroll up
    // - scrollTop = scrollHeight - clientHeight means scrolled to top (oldest messages)
    const scrollHeight = container.scrollHeight
    const clientHeight = container.clientHeight
    const scrollTop = container.scrollTop
    const maxScrollTop = scrollHeight - clientHeight
    
    // We want to load when scrollTop is close to maxScrollTop (within 300px of the top)
    // Also ensure we have scrollable content (maxScrollTop > 0)
    // In column-reverse, maxScrollTop is the maximum scrollTop value (top of scrollable area)
    const threshold = 300 // Increased threshold for more reliable detection
    const isNearTop = maxScrollTop > 0 && scrollTop >= Math.max(0, maxScrollTop - threshold)
    
    // Debug logging (can be removed later)
    if (isNearTop && hasMore && !loadingMore && !loading && messages.length > 0) {
      console.log('[DEBUG] Loading older messages:', {
        scrollTop,
        maxScrollTop,
        scrollHeight,
        clientHeight,
        hasMore,
        loadingMore,
        loading,
        messagesLength: messages.length
      })
      loadMessages(true)
    }
    
    // Hide new messages indicator if user scrolls to bottom (scrollTop near 0)
    const isNearBottom = container.scrollTop < 200
    if (isNearBottom && hasNewMessages) {
      setHasNewMessages(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, loading, messages.length, hasNewMessages])

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageText.trim() || sending) return

    const textToSend = messageText.trim()
    setMessageText('')
    setSending(true)

    // Get current user ID for optimistic update
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSending(false)
      return
    }

    // Create optimistic message (temporary ID, will be replaced with real message)
    const tempId = `temp-${Date.now()}-${Math.random()}`
    const optimisticMessage = {
      id: tempId,
      sender_id: user.id,
      receiver_id: userId,
      text: textToSend,
      created_at: new Date().toISOString(),
      read_at: null,
      isOptimistic: true, // Flag to identify optimistic messages
    }

    // Add optimistic message immediately for instant feedback
    setMessages(prev => [...prev, optimisticMessage])
    
    // Scroll to bottom immediately to show the new message
    requestAnimationFrame(() => {
      scrollToBottomStable(true)
      setHasNewMessages(false)
    })

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receiver_id: userId,
          text: textToSend,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      const data = await response.json()
      // The API returns { message: {...} } or just the message object
      const realMessage = data.message || data

      // Replace optimistic message with real message from server
      setMessages(prev => {
        const filtered = prev.filter(msg => msg.id !== tempId)
        // Ensure the real message doesn't have isOptimistic flag
        const cleanMessage = { ...realMessage }
        delete (cleanMessage as any).isOptimistic
        return [...filtered, cleanMessage]
      })

      // Update last message ID for tracking
      if (realMessage.id) {
        lastMessageIdRef.current = realMessage.id
      }

      // Refresh other data in background (don't wait for it)
      loadFriendStatus()
      loadPortfolioInvitations()
      loadConversationStatus()
      onMessageSent()
    } catch (error) {
      console.error('Error sending message:', error)
      // Remove optimistic message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempId))
      alert('Failed to send message')
      // Restore message text so user can retry
      setMessageText(textToSend)
    } finally {
      setSending(false)
    }
  }

  const handleAcceptFriendRequest = async () => {
    try {
      const response = await fetch(`/api/friends/${userId}`, {
        method: 'PUT',
      })

      if (response.ok) {
        await loadFriendStatus()
        await loadConversationStatus()
        await loadMessages() // Refresh messages to show acceptance message
        onMessageSent() // Refresh conversations list
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to accept friend request')
      }
    } catch (error) {
      console.error('Error accepting friend request:', error)
      alert('Failed to accept friend request')
    }
  }

  const handleCancelFriendRequest = async () => {
    try {
      const response = await fetch(`/api/friends/${userId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        await loadFriendStatus()
        await loadConversationStatus()
        await loadMessages() // Refresh messages
        onMessageSent() // Refresh conversations list
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to cancel friend request')
      }
    } catch (error) {
      console.error('Error canceling friend request:', error)
      alert('Failed to cancel friend request')
    }
  }

  const handleAcceptPortfolioInvitation = async (portfolioId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const response = await fetch(`/api/portfolios/${portfolioId}/invitations/${user.id}`, {
        method: 'PUT',
      })

      if (response.ok) {
        // Refresh invitations to update status
        await loadPortfolioInvitations()
        await loadMessages() // Refresh messages to show acceptance message
        onMessageSent() // Refresh conversations list
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to accept invitation')
      }
    } catch (error) {
      console.error('Error accepting portfolio invitation:', error)
      alert('Failed to accept invitation')
    }
  }

  const handleCancelPortfolioInvitation = async (portfolioId: string, inviteeId: string) => {
    try {
      console.log('[DEBUG] Canceling invitation:', { portfolioId, inviteeId })
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('You must be logged in to cancel invitations')
        return
      }

      const response = await fetch(`/api/portfolios/${portfolioId}/invitations/${inviteeId}`, {
        method: 'DELETE',
      })

      const responseData = await response.json()
      console.log('[DEBUG] Cancel invitation response:', { status: response.status, data: responseData })

      if (response.ok) {
        // Immediately refresh invitations to update status
        await loadPortfolioInvitations()
        // Small delay to ensure database is updated
        await new Promise(resolve => setTimeout(resolve, 200))
        await loadPortfolioInvitations() // Refresh again to be sure
        await loadMessages() // Refresh messages to trigger re-render
        // Force a re-render by updating refresh key
        setRefreshKey(prev => prev + 1)
        onMessageSent() // Refresh conversations list
        
        console.log('[DEBUG] Invitation cancelled, refreshing UI...')
      } else {
        alert(responseData.error || 'Failed to cancel invitation')
      }
    } catch (error) {
      console.error('Error canceling portfolio invitation:', error)
      alert(`Failed to cancel invitation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleCompleteConversation = async () => {
    setIsCompleting(true)
    try {
      const response = await fetch(`/api/conversations/${userId}/complete`, {
        method: 'POST',
      })
      if (response.ok) {
        // Refresh conversation status instead of going back
        await loadConversationStatus()
        onMessageSent() // Refresh conversations list (in case user goes back)
      }
    } catch (error) {
      console.error('Error completing conversation:', error)
      alert('Failed to complete conversation')
    } finally {
      setIsCompleting(false)
    }
  }

  // Use local partner info (which loads from human portfolio) or fallback
  const displayName = localPartnerInfo?.name || conversationStatus?.partner_name || 'User'
  const avatarUrl =
    localPartnerInfo?.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`

  // Get current user ID
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id || null)
    })
  }, [supabase])

  return (
    <div className="bg-transparent flex flex-col" style={{ height: 'calc(100dvh - 4rem)', maxHeight: 'calc(100dvh - 4rem)' }}>
          {/* Header */}
          <div className="flex items-center gap-4 p-4 border-b border-gray-200">
            <Link
              href="/messages"
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Back to messages"
              title="Back to messages"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
            </Link>
            <Link
              href={`/portfolio/human/${userId}`}
              className="flex items-center gap-3 flex-1"
            >
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-10 w-10 rounded-full object-cover border-2 border-gray-300"
              />
              <UIText as="h2">{displayName}</UIText>
            </Link>
            {conversationStatus?.my_side_active && (
              <Dropdown
                items={[
                  {
                    label: isCompleting ? 'Archiving...' : 'Archive',
                    onClick: handleCompleteConversation,
                    disabled: isCompleting,
                    icon: Archive,
                  },
                ]}
              />
            )}
          </div>

          {/* Status Banner */}
          {conversationStatus?.status_message && (
            <div className={`px-4 py-3 border-b flex items-center justify-center gap-2 ${
              conversationStatus.status_message === 'waiting_for_accept'
                ? 'bg-yellow-50 border-yellow-200'
                : 'bg-gray-50 border-gray-200'
            }`}>
              {conversationStatus.status_message === 'waiting_for_accept' ? (
                <>
                  <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <UIText as="p" className="text-yellow-700 italic">
                    Waiting for {conversationStatus.partner_name || displayName} to accept invite
                  </UIText>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <UIText as="p" className="italic">
                    Chat is archived by {conversationStatus.partner_name || displayName}
                  </UIText>
                </>
              )}
            </div>
          )}

          {/* Messages */}
          <div 
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4"
            style={{
              display: 'flex',
              flexDirection: 'column-reverse',
              gap: '1rem'
            }}
            onScroll={handleScroll}
          >
            {loading ? (
              <div className="text-center"><Content>Loading messages...</Content></div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12">
                <Content>No messages yet. Start the conversation!</Content>
              </div>
            ) : (
              <div 
                role="log" 
                aria-live="polite" 
                aria-label="Chat messages"
                style={{ display: 'flex', flexDirection: 'column-reverse', gap: '1rem' }}
              >
                {[...messages].reverse().map((message) => {
                const isSent = message.sender_id === currentUserId
                const isFriendRequestMessage = message.text.includes('friend request')
                const isInviteMessage = message.text.includes('invited you to join') || message.text.includes('invited you to become a manager')
                const isManagerInviteMessage = message.text.includes('invited you to become a manager')
                const isAcceptMessage = message.text.includes('accepted your invitation to join') || message.text.includes('accepted your invitation to become a manager')
                const isManagerAcceptMessage = message.text.includes('accepted your invitation to become a manager')
                const isPortfolioInvitationMessage = isInviteMessage || isAcceptMessage
                
                // Find portfolio invitation for this message
                // Match by extracting portfolio name from message text and finding the matching invitation
                let portfolioInvitation: { invitationId: string; portfolioId: string; status: 'pending_sent' | 'pending_received' | 'accepted' | 'cancelled' | null; created_at: string; inviter_id: string; invitee_id: string; invitation_type?: string } | null = null
                if (isPortfolioInvitationMessage && portfolioInvitations.size > 0 && currentUserId) {
                  // For "invited you to join" messages: sender is inviter, receiver is invitee
                  // For "accepted your invitation to join" messages: sender is invitee (who accepted), receiver is inviter
                  const expectedInviterId = isInviteMessage ? message.sender_id : message.receiver_id
                  const expectedInviteeId = isInviteMessage ? message.receiver_id : message.sender_id

                  // Extract portfolio name from message text
                  // Format: "invited you to join {portfolioName} (project/community)"
                  // Format: "invited you to become a manager of {portfolioName} (project/community)"
                  // Format: "accepted your invitation to join {portfolioName} (project/community)"
                  // Format: "accepted your invitation to become a manager of {portfolioName} (project/community)"
                  const match = message.text.match(/(?:invited you to (?:join|become a manager of)|accepted your invitation to (?:join|become a manager of))\s+(.+?)\s+\((project|community)\)/)
                  const portfolioNameFromMessage = match ? match[1].trim() : null

                  // Find invitations that match the users and invitation type
                  // Include all invitations (including cancelled) so portfolio cards show for all invite messages
                  const matchingInvitations: Array<{ invitationId: string; portfolioId: string; status: 'pending_sent' | 'pending_received' | 'accepted' | 'cancelled' | null; created_at: string; inviter_id: string; invitee_id: string; invitation_type?: string }> = []
                  
                  portfolioInvitations.forEach((invitation) => {
                    if (invitation.inviter_id === expectedInviterId && 
                        invitation.invitee_id === expectedInviteeId) {
                      // Match invitation type: manager invitations for manager messages, member invitations for member messages
                      const invitationType = invitation.invitation_type || 'member'
                      if ((isManagerInviteMessage || isManagerAcceptMessage) && invitationType === 'manager') {
                        matchingInvitations.push(invitation)
                      } else if (!isManagerInviteMessage && !isManagerAcceptMessage && invitationType === 'member') {
                        matchingInvitations.push(invitation)
                      }
                    }
                  })

                  // If we have a portfolio name from the message, try to match by name first
                  if (portfolioNameFromMessage && matchingInvitations.length > 0) {
                    // Find portfolio that matches the name
                    for (const invitation of matchingInvitations) {
                      const portfolio = portfolioDetails.get(invitation.portfolioId)
                      if (portfolio) {
                        const metadata = portfolio.metadata as any
                        const basic = metadata?.basic || {}
                        const portfolioName = basic.name || ''
                        if (portfolioName === portfolioNameFromMessage) {
                          portfolioInvitation = invitation
                          break
                        }
                      }
                    }
                  }

                  // If no match by name, or no name extracted, use timestamp-based matching
                  // (closest invitation to message time, but no time limit)
                  if (!portfolioInvitation && matchingInvitations.length > 0) {
                    const messageTime = new Date(message.created_at).getTime()
                    let closestInvitation = matchingInvitations[0]
                    let minTimeDiff = Math.abs(messageTime - new Date(closestInvitation.created_at).getTime())

                    for (const invitation of matchingInvitations) {
                    const invitationTime = new Date(invitation.created_at).getTime()
                    const timeDiff = Math.abs(messageTime - invitationTime)
                      if (timeDiff < minTimeDiff) {
                      minTimeDiff = timeDiff
                      closestInvitation = invitation
                    }
                    }
                  portfolioInvitation = closestInvitation
                  }
                }

                const isReceivedFriendRequest = !isSent && isFriendRequestMessage && friendStatus.status === 'pending_received'
                const isSentFriendRequest = isSent && isFriendRequestMessage && friendStatus.status === 'pending_sent'
                // Only show accept/cancel buttons if invitation exists and matches this message
                // For invite messages, verify the invitation was created close to the message time
                // For accept messages, the invitation should exist (already matched above)
                const invitationMatchesMessage = portfolioInvitation ? true : false
                const isReceivedPortfolioInvitation = !isSent && isPortfolioInvitationMessage && portfolioInvitation && portfolioInvitation.status === 'pending_received' && invitationMatchesMessage
                const isSentPortfolioInvitation = isSent && isPortfolioInvitationMessage && portfolioInvitation && portfolioInvitation.status === 'pending_sent' && invitationMatchesMessage
                
                // Get portfolio details if this is an invitation message
                const portfolio = portfolioInvitation 
                  ? portfolioDetails.get(portfolioInvitation.portfolioId) 
                  : null

                return (
                  <div
                    key={`${message.id}-${refreshKey}`}
                    className={`flex flex-col ${isSent ? 'items-end' : 'items-start'}`}
                  >
                    {/* Note Card - Show above message if note_id is present */}
                    {message.note_id && (
                      <div className={`mb-1 max-w-xs lg:max-w-md`}>
                        <MessageNoteCard 
                          noteId={message.note_id} 
                          isSent={isSent}
                        />
                      </div>
                    )}
                    
                    {/* Portfolio Card - Show above invitation messages */}
                    {isPortfolioInvitationMessage && portfolio && (
                      <div className={`mb-1 max-w-xs lg:max-w-md`}>
                        <PortfolioInvitationCard 
                          portfolio={portfolio as Portfolio} 
                          isSent={isSent}
                        />
                      </div>
                    )}
                    
                    {/* Only show text bubble if there's text (not just a note) */}
                    {message.text && message.text.trim() && (
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          isSent
                            ? 'bg-white text-gray-900'
                            : 'bg-gray-200 text-gray-900'
                        } ${(message as any).isOptimistic ? 'opacity-75' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <UIText as="p">{message.text}</UIText>
                          {(message as any).isOptimistic && (
                            <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          )}
                        </div>
                        <p
                          className={`text-xs mt-1 ${
                            isSent ? 'text-blue-100' : 'text-gray-500'
                          }`}
                        >
                          {(message as any).isOptimistic ? (
                            <span className="italic">Sending...</span>
                          ) : (
                            new Date(message.created_at).toLocaleTimeString()
                          )}
                        </p>
                        {/* Show accept button for received friend request */}
                        {isReceivedFriendRequest && (
                          <div className="mt-2 pt-2 border-t border-gray-300">
                            <Button
                              variant="success"
                              size="sm"
                              fullWidth
                              onClick={handleAcceptFriendRequest}
                            >
                              <UIText>Accept Invite</UIText>
                            </Button>
                          </div>
                        )}
                        {/* Show cancel button for sent friend request */}
                        {isSentFriendRequest && (
                          <div className="mt-2 pt-2 border-t border-blue-400">
                            <Button
                              variant="danger"
                              size="sm"
                              fullWidth
                              onClick={handleCancelFriendRequest}
                            >
                              <UIText>Cancel Invitation</UIText>
                            </Button>
                          </div>
                        )}
                        {/* Show accept button for received portfolio invitation */}
                        {isReceivedPortfolioInvitation && portfolioInvitation && (
                          <div className="mt-2 pt-2 border-t border-gray-300">
                            <Button
                              variant="success"
                              size="sm"
                              fullWidth
                              onClick={() => {
                                handleAcceptPortfolioInvitation(portfolioInvitation!.portfolioId)
                              }}
                            >
                              <UIText>Accept Invite</UIText>
                            </Button>
                          </div>
                        )}
                        {/* Show cancel button for sent portfolio invitation */}
                        {isSentPortfolioInvitation && portfolioInvitation && (
                          <div className="mt-2 pt-2 border-t border-blue-400">
                            <Button
                              variant="danger"
                              size="sm"
                              fullWidth
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                console.log('[DEBUG] Cancel button clicked:', { 
                                  portfolioId: portfolioInvitation!.portfolioId, 
                                  inviteeId: portfolioInvitation!.invitee_id,
                                  portfolioInvitation: portfolioInvitation,
                                  isSentPortfolioInvitation,
                                  status: portfolioInvitation!.status
                                })
                                if (portfolioInvitation && portfolioInvitation.invitee_id) {
                                  handleCancelPortfolioInvitation(portfolioInvitation.portfolioId, portfolioInvitation.invitee_id)
                                } else {
                                  console.error('[DEBUG] Missing invitee_id in portfolioInvitation:', portfolioInvitation)
                                  alert('Error: Missing invitation data')
                                }
                              }}
                            >
                              <UIText>Cancel Invitation</UIText>
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Show timestamp for note-only messages (when there's no text bubble) */}
                    {message.note_id && (!message.text || !message.text.trim()) && (
                      <p
                        className={`text-xs mt-1 ${
                          isSent ? 'text-blue-100' : 'text-gray-500'
                        }`}
                      >
                        {(message as any).isOptimistic ? (
                          <span className="italic">Sending...</span>
                        ) : (
                          new Date(message.created_at).toLocaleTimeString()
                        )}
                      </p>
                    )}
                  </div>
                )
              })}
                {loadingMore && (
                  <div className="text-center py-4"><Content>Loading older messages...</Content></div>
                )}
                {!hasMore && messages.length > 10 && (
                  <div className="text-center py-4"><UIText>No more messages</UIText></div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* New Messages Indicator */}
          {hasNewMessages && (
            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
              <Button
                variant="text"
                fullWidth
                onClick={scrollToBottom}
              >
                <UIText>↓ New messages below</UIText>
              </Button>
            </div>
          )}

          {/* Message Input */}
          <form onSubmit={sendMessage} className="p-4 border-t border-gray-200">
            <div className="flex gap-2">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={sending}
              />
              <Button
                type="submit"
                variant="primary"
                disabled={!messageText.trim() || sending}
              >
                <UIText>{sending ? 'Sending...' : 'Send'}</UIText>
              </Button>
            </div>
          </form>
    </div>
  )
}

export default function MessagesPage() {
  return (
    <Suspense fallback={
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center"><Content>Loading...</Content></div>
      </div>
    }>
      <MessagesPageContent />
    </Suspense>
  )
}

