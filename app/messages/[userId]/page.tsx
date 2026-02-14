'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createHumanPortfolioHelpers } from '@/lib/portfolio/human-client'
import Link from 'next/link'
import { PortfolioInvitationCard } from '@/components/portfolio/PortfolioInvitationCard'
import { Portfolio } from '@/types/portfolio'
import { MessageNoteCard } from '@/components/notes/MessageNoteCard'
import { Content, UIText, Button, Dropdown, Card } from '@/components/ui'
import { Archive } from 'lucide-react'

interface PartnerInfo {
  id: string
  name: string
  avatar: string
}

function ConversationViewContent() {
  const params = useParams()
  const router = useRouter()
  const userId = params.userId as string
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
  const [localPartnerInfo, setLocalPartnerInfo] = useState<PartnerInfo | null>(null)
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
    if (!localPartnerInfo) {
      try {
        const portfolio = await portfolioHelpers.getHumanPortfolio(userId)
        if (portfolio) {
          const metadata = portfolio.metadata as any
          const basic = metadata?.basic || {}
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
    loadPartnerInfo()
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
  }, [userId])

  useEffect(() => {
    loadMessages(false)
    loadFriendStatus()
    loadPortfolioInvitations()
    loadConversationStatus()
    loadPartnerInfo()

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
        async (payload: any) => {
          const newMessage = payload.new as any
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return
          
          const isRelevantMessage = 
            (newMessage.sender_id === user.id && newMessage.receiver_id === userId) ||
            (newMessage.sender_id === userId && newMessage.receiver_id === user.id)
          
          if (isRelevantMessage) {
            setMessages(prev => {
              const exists = prev.some(m => m.id === newMessage.id)
              if (exists) return prev
              
              const updated = [...prev, newMessage]
              const container = messagesContainerRef.current
              const isNearBottom = container && container.scrollTop < 200
              return isNearBottom && updated.length > 100 ? updated.slice(-100) : updated
            })
            
            if (newMessage.receiver_id === user.id && !newMessage.read_at) {
              supabase
                .from('messages')
                .update({ read_at: new Date().toISOString() })
                .eq('id', newMessage.id)
                .then(() => {
                  loadConversationStatus()
                  window.dispatchEvent(new CustomEvent('messagesMarkedAsRead'))
                })
            }
          }
        }
      )
      .subscribe()

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
      
      if (conv) {
        setConversationStatus({
          my_side_active: conv.my_side_active,
          partner_side_active: conv.partner_side_active,
          status_message: conv.status_message,
          partner_name: conv.partner_name,
        })
      } else {
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: invitations, error } = await supabase
        .from('portfolio_invitations')
        .select('id, portfolio_id, inviter_id, invitee_id, status, created_at, invitation_type')
        .or(`and(inviter_id.eq.${user.id},invitee_id.eq.${userId}),and(inviter_id.eq.${userId},invitee_id.eq.${user.id})`)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading portfolio invitations:', error)
        return
      }

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
        const container = messagesContainerRef.current
        const previousScrollHeight = container?.scrollHeight || 0
        const previousScrollTop = container?.scrollTop || 0

        const before = messages.length > 0 ? messages[0].created_at : undefined
        const url = `/api/messages/${userId}?limit=10${before ? `&before=${encodeURIComponent(before)}` : ''}`
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error('Failed to load messages')
        }
        const data = await response.json()
        const newMessages = data.messages || []
        
        setMessages(prev => [...newMessages, ...prev])
        setHasMore(newMessages.length === 10)

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (container) {
              const newScrollHeight = container.scrollHeight
              const heightDifference = newScrollHeight - previousScrollHeight
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
        
        setMessages(newMessages)
        setHasMore(newMessages.length === 10)
        if (newMessages.length > 0) {
          lastMessageIdRef.current = newMessages[newMessages.length - 1].id
        }
        if (isInitialLoad && newMessages.length > 0) {
          shouldScrollToBottomRef.current = true
        }
        
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

  const scrollToBottomStable = useCallback((smooth: boolean = true) => {
    const container = messagesContainerRef.current
    if (container) {
      requestAnimationFrame(() => {
        if (smooth) {
          container.scrollTo({
            top: 0,
            behavior: 'smooth'
          })
        } else {
          container.scrollTop = 0
        }
      })
    }
  }, [])

  useEffect(() => {
    if (shouldScrollToBottomRef.current && messages.length > 0 && !loading && !loadingMore) {
      requestAnimationFrame(() => {
        scrollToBottomStable(false)
        shouldScrollToBottomRef.current = false
        setIsInitialLoad(false)
      })
    }
  }, [messages.length, loading, loadingMore, scrollToBottomStable, portfolioInvitations.size, portfolioDetails.size])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container || isInitialLoad || loading || loadingMore) return
    
    const messagesLengthChanged = messages.length !== lastMessagesLengthRef.current
    lastMessagesLengthRef.current = messages.length
    
    const isNearBottom = container.scrollTop < 200
    
    if (!messagesLengthChanged && isNearBottom && !isUserScrollingRef.current) {
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = 0
        }
      })
    } else if (!messagesLengthChanged && preservedScrollTopRef.current !== null && !isUserScrollingRef.current) {
      requestAnimationFrame(() => {
        if (container && preservedScrollTopRef.current !== null) {
          container.scrollTop = preservedScrollTopRef.current
        }
      })
    }
  }, [messages, loading, loadingMore, isInitialLoad, portfolioInvitations.size, portfolioDetails.size])

  useEffect(() => {
    if (messages.length > 0 && !loadingMore && !loading && !isInitialLoad) {
      const container = messagesContainerRef.current
      if (container) {
        const latestMessage = messages[messages.length - 1]
        const isNewMessage = latestMessage && latestMessage.id !== lastMessageIdRef.current
        
        if (isNewMessage) {
          const isNearBottom = container.scrollTop < 200
          
          if (isNearBottom && !isUserScrollingRef.current) {
            scrollToBottomStable(true)
            setHasNewMessages(false)
          } else if (!isNearBottom) {
            setHasNewMessages(true)
          }
          
          lastMessageIdRef.current = latestMessage.id
        }
      }
    }
  }, [messages, loadingMore, loading, isInitialLoad, scrollToBottomStable])

  const scrollToBottom = useCallback(() => {
    scrollToBottomStable(true)
    setHasNewMessages(false)
  }, [scrollToBottomStable])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget
    isUserScrollingRef.current = true
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    scrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false
    }, 500)
    
    preservedScrollTopRef.current = container.scrollTop
    
    const scrollHeight = container.scrollHeight
    const clientHeight = container.clientHeight
    const scrollTop = container.scrollTop
    const maxScrollTop = scrollHeight - clientHeight
    
    const threshold = 300
    const isNearTop = maxScrollTop > 0 && scrollTop >= Math.max(0, maxScrollTop - threshold)
    
    if (isNearTop && hasMore && !loadingMore && !loading && messages.length > 0) {
      loadMessages(true)
    }
    
    const isNearBottom = container.scrollTop < 200
    if (isNearBottom && hasNewMessages) {
      setHasNewMessages(false)
    }
  }, [hasMore, loadingMore, loading, messages.length, hasNewMessages])

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageText.trim() || sending) return

    const textToSend = messageText.trim()
    setMessageText('')
    setSending(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSending(false)
      return
    }

    const tempId = `temp-${Date.now()}-${Math.random()}`
    const optimisticMessage = {
      id: tempId,
      sender_id: user.id,
      receiver_id: userId,
      text: textToSend,
      created_at: new Date().toISOString(),
      read_at: null,
      isOptimistic: true,
    }

    setMessages(prev => [...prev, optimisticMessage])
    
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
      const realMessage = data.message || data

      setMessages(prev => {
        const filtered = prev.filter(msg => msg.id !== tempId)
        const cleanMessage = { ...realMessage }
        delete (cleanMessage as any).isOptimistic
        return [...filtered, cleanMessage]
      })

      if (realMessage.id) {
        lastMessageIdRef.current = realMessage.id
      }

      loadFriendStatus()
      loadPortfolioInvitations()
      loadConversationStatus()
      window.dispatchEvent(new CustomEvent('messagesMarkedAsRead'))
    } catch (error) {
      console.error('Error sending message:', error)
      setMessages(prev => prev.filter(msg => msg.id !== tempId))
      alert('Failed to send message')
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
        await loadMessages()
        window.dispatchEvent(new CustomEvent('messagesMarkedAsRead'))
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
        await loadMessages()
        window.dispatchEvent(new CustomEvent('messagesMarkedAsRead'))
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
        await loadPortfolioInvitations()
        await loadMessages()
        window.dispatchEvent(new CustomEvent('messagesMarkedAsRead'))
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('You must be logged in to cancel invitations')
        return
      }

      const response = await fetch(`/api/portfolios/${portfolioId}/invitations/${inviteeId}`, {
        method: 'DELETE',
      })

      const responseData = await response.json()

      if (response.ok) {
        await loadPortfolioInvitations()
        await new Promise(resolve => setTimeout(resolve, 200))
        await loadPortfolioInvitations()
        await loadMessages()
        setRefreshKey(prev => prev + 1)
        window.dispatchEvent(new CustomEvent('messagesMarkedAsRead'))
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
        await loadConversationStatus()
        window.dispatchEvent(new CustomEvent('messagesMarkedAsRead'))
      }
    } catch (error) {
      console.error('Error completing conversation:', error)
      alert('Failed to complete conversation')
    } finally {
      setIsCompleting(false)
    }
  }

  const displayName = localPartnerInfo?.name || conversationStatus?.partner_name || 'User'
  const avatarUrl =
    localPartnerInfo?.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: any } }) => {
      setCurrentUserId(user?.id || null)
    })
  }, [supabase])

  // Component for displaying comment preview messages
  const CommentPreviewCard = ({ message, isSent }: { message: any; isSent: boolean }) => {
    const [commentNote, setCommentNote] = useState<any>(null)
    const [parentNoteId, setParentNoteId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
      const loadCommentData = async () => {
        try {
          const { data: note } = await supabase
            .from('notes')
            .select('id, text, mentioned_note_id, owner_account_id, created_at')
            .eq('id', message.note_id)
            .single()

          if (note) {
            setCommentNote(note)
            setParentNoteId(note.mentioned_note_id)
          }
        } catch (error) {
          console.error('Error loading comment:', error)
        } finally {
          setLoading(false)
        }
      }

      loadCommentData()
    }, [message.note_id])

    if (loading) {
      return (
        <Card variant="subtle" className="p-3">
          <UIText className="text-sm text-gray-500">Loading comment...</UIText>
        </Card>
      )
    }

    if (!commentNote) {
      return (
        <Card variant="subtle" className="p-3">
          <UIText className="text-sm text-gray-500 italic">Comment is no longer available</UIText>
        </Card>
      )
    }

    return (
      <Card variant="subtle" className="p-4 border-2 border-blue-200">
        <div className="mb-2">
          <UIText className="text-xs font-medium text-blue-700 mb-1">New comment on your note</UIText>
          <Content as="p" className="text-sm line-clamp-3">
            {message.text || commentNote.text}
          </Content>
        </div>
        {parentNoteId && (
          <Link
            href={`/notes/${parentNoteId}`}
            className="inline-block mt-2"
          >
            <Button variant="primary" size="sm">
              <UIText>View comment</UIText>
            </Button>
          </Link>
        )}
      </Card>
    )
  }

  return (
    <div className="bg-transparent flex flex-col" style={{ height: 'calc(100dvh - 4rem)', maxHeight: 'calc(100dvh - 4rem)' }}>
      {/* Header */}
      <div className="flex items-center gap-4 p-4 border-b border-gray-200">
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
              
              let portfolioInvitation: { invitationId: string; portfolioId: string; status: 'pending_sent' | 'pending_received' | 'accepted' | 'cancelled' | null; created_at: string; inviter_id: string; invitee_id: string; invitation_type?: string } | null = null
              if (isPortfolioInvitationMessage && portfolioInvitations.size > 0 && currentUserId) {
                const expectedInviterId = isInviteMessage ? message.sender_id : message.receiver_id
                const expectedInviteeId = isInviteMessage ? message.receiver_id : message.sender_id

                const match = message.text.match(/(?:invited you to (?:join|become a manager of)|accepted your invitation to (?:join|become a manager of))\s+(.+?)\s+\((project|community)\)/)
                const portfolioNameFromMessage = match ? match[1].trim() : null

                const matchingInvitations: Array<{ invitationId: string; portfolioId: string; status: 'pending_sent' | 'pending_received' | 'accepted' | 'cancelled' | null; created_at: string; inviter_id: string; invitee_id: string; invitation_type?: string }> = []
                
                portfolioInvitations.forEach((invitation) => {
                  if (invitation.inviter_id === expectedInviterId && 
                      invitation.invitee_id === expectedInviteeId) {
                    const invitationType = invitation.invitation_type || 'member'
                    if ((isManagerInviteMessage || isManagerAcceptMessage) && invitationType === 'manager') {
                      matchingInvitations.push(invitation)
                    } else if (!isManagerInviteMessage && !isManagerAcceptMessage && invitationType === 'member') {
                      matchingInvitations.push(invitation)
                    }
                  }
                })

                if (portfolioNameFromMessage && matchingInvitations.length > 0) {
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
              const invitationMatchesMessage = portfolioInvitation ? true : false
              const isReceivedPortfolioInvitation = !isSent && isPortfolioInvitationMessage && portfolioInvitation && portfolioInvitation.status === 'pending_received' && invitationMatchesMessage
              const isSentPortfolioInvitation = isSent && isPortfolioInvitationMessage && portfolioInvitation && portfolioInvitation.status === 'pending_sent' && invitationMatchesMessage
              
              const portfolio = portfolioInvitation 
                ? portfolioDetails.get(portfolioInvitation.portfolioId) 
                : null

              return (
                <div
                  key={`${message.id}-${refreshKey}`}
                  className={`flex flex-col ${isSent ? 'items-end' : 'items-start'}`}
                >
                  {message.note_id && message.message_type === 'comment_preview' ? (
                    <div className={`mb-1 max-w-xs lg:max-w-md`}>
                      <CommentPreviewCard 
                        message={message}
                        isSent={isSent}
                      />
                    </div>
                  ) : message.note_id ? (
                    <div className={`mb-1 max-w-xs lg:max-w-md`}>
                      <MessageNoteCard 
                        noteId={message.note_id} 
                        isSent={isSent}
                      />
                    </div>
                  ) : null}
                  
                  {isPortfolioInvitationMessage && portfolio && (
                    <div className={`mb-1 max-w-xs lg:max-w-md`}>
                      <PortfolioInvitationCard 
                        portfolio={portfolio as Portfolio} 
                        isSent={isSent}
                      />
                    </div>
                  )}
                  
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
                              if (portfolioInvitation && portfolioInvitation.invitee_id) {
                                handleCancelPortfolioInvitation(portfolioInvitation.portfolioId, portfolioInvitation.invitee_id)
                              } else {
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

export default function ConversationPage() {
  return (
    <Suspense fallback={
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center"><Content>Loading...</Content></div>
      </div>
    }>
      <ConversationViewContent />
    </Suspense>
  )
}

