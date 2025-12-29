'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createHumanPortfolioHelpers } from '@/lib/portfolio/human-client'
import Link from 'next/link'

interface Conversation {
  partner_id: string
  last_message: {
    id: string
    sender_id: string
    receiver_id: string
    text: string
    created_at: string
    read_at: string | null
  }
  unread_count: number
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
        const username = metadata?.username || basic.name
        const avatarUrl = basic?.avatar || metadata?.avatar_url
        const displayName = username || basic.name || 'User'
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

  const loadConversations = async () => {
    try {
      const response = await fetch('/api/messages')
      if (!response.ok) {
        throw new Error('Failed to load conversations')
      }
      const data = await response.json()
      setConversations(data.conversations || [])

      // Load partner info for each conversation
      const infos = new Map<string, PartnerInfo>()
      for (const conv of data.conversations || []) {
        try {
          const portfolio = await portfolioHelpers.getHumanPortfolio(
            conv.partner_id
          )
          if (portfolio) {
            const metadata = portfolio.metadata as any
            const basic = metadata?.basic || {}
            const username = metadata?.username || basic.name
            const avatarUrl = basic?.avatar || metadata?.avatar_url
            const displayName = username || basic.name || 'User'
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
      setPartnerInfos(infos)
    } catch (error) {
      console.error('Error loading conversations:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConversations()
  }, [])

  useEffect(() => {
    const userId = searchParams.get('userId')
    if (userId && !partnerInfos.has(userId)) {
      loadPartnerInfo(userId)
    }
  }, [searchParams, partnerInfos])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="text-center">Loading conversations...</div>
          </div>
        </div>
      </div>
    )
  }

  if (selectedUserId) {
    return (
      <ConversationView
        userId={selectedUserId}
        partnerInfo={partnerInfos.get(selectedUserId)}
        onBack={() => setSelectedUserId(null)}
        onMessageSent={() => {
          loadConversations()
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-2xl font-bold mb-6">Messages</h1>

          {conversations.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              No conversations yet. Start a conversation from a user's portfolio
              page.
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => {
                const partnerInfo = partnerInfos.get(conv.partner_id)
                const displayName = partnerInfo?.name || 'User'
                const avatarUrl =
                  partnerInfo?.avatar ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`

                return (
                  <button
                    key={conv.partner_id}
                    onClick={() => setSelectedUserId(conv.partner_id)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 rounded-lg transition-colors text-left"
                  >
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="h-12 w-12 rounded-full object-cover border-2 border-gray-300"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-gray-900 truncate">
                          {displayName}
                        </h3>
                        <span className="text-sm text-gray-500 ml-2">
                          {new Date(
                            conv.last_message.created_at
                          ).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 truncate mt-1">
                        {conv.last_message.text}
                      </p>
                    </div>
                    {conv.unread_count > 0 && (
                      <span className="bg-blue-600 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center">
                        {conv.unread_count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ConversationView({
  userId,
  partnerInfo,
  onBack,
  onMessageSent,
}: {
  userId: string
  partnerInfo?: PartnerInfo
  onBack: () => void
  onMessageSent: () => void
}) {
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [messageText, setMessageText] = useState('')
  const supabase = createClient()

  useEffect(() => {
    loadMessages()
    // Poll for new messages every 3 seconds
    const interval = setInterval(loadMessages, 3000)
    return () => clearInterval(interval)
  }, [userId])

  const loadMessages = async () => {
    try {
      const response = await fetch(`/api/messages/${userId}`)
      if (!response.ok) {
        throw new Error('Failed to load messages')
      }
      const data = await response.json()
      setMessages(data.messages || [])
    } catch (error) {
      console.error('Error loading messages:', error)
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageText.trim() || sending) return

    setSending(true)
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receiver_id: userId,
          text: messageText.trim(),
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      setMessageText('')
      loadMessages()
      onMessageSent()
    } catch (error) {
      console.error('Error sending message:', error)
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const displayName = partnerInfo?.name || 'User'
  const avatarUrl =
    partnerInfo?.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`

  // Get current user ID
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id || null)
    })
  }, [supabase])

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow rounded-lg flex flex-col" style={{ height: '80vh' }}>
          {/* Header */}
          <div className="flex items-center gap-4 p-4 border-b border-gray-200">
            <button
              onClick={onBack}
              className="text-gray-600 hover:text-gray-900"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <Link
              href={`/portfolio/human/${userId}`}
              className="flex items-center gap-3 flex-1"
            >
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-10 w-10 rounded-full object-cover border-2 border-gray-300"
              />
              <h2 className="text-lg font-semibold">{displayName}</h2>
            </Link>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading ? (
              <div className="text-center text-gray-500">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                No messages yet. Start the conversation!
              </div>
            ) : (
              messages.map((message) => {
                const isSent = message.sender_id === currentUserId
                return (
                  <div
                    key={message.id}
                    className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        isSent
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-900'
                      }`}
                    >
                      <p className="text-sm">{message.text}</p>
                      <p
                        className={`text-xs mt-1 ${
                          isSent ? 'text-blue-100' : 'text-gray-500'
                        }`}
                      >
                        {new Date(message.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>

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
              <button
                type="submit"
                disabled={!messageText.trim() || sending}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function MessagesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="text-center">Loading...</div>
          </div>
        </div>
      </div>
    }>
      <MessagesPageContent />
    </Suspense>
  )
}

