'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { createHumanPortfolioHelpers } from '@/lib/portfolio/human-client'
import { Title, Content, UIText, UIButtonText, Dropdown } from '@/components/ui'
import { Archive } from 'lucide-react'

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
    note_id?: string | null
    annotation_id?: string | null
    message_type?: string | null
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
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [partnerInfos, setPartnerInfos] = useState<Map<string, PartnerInfo>>(
    new Map()
  )
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'invitations' | 'active'>('active')
  const [inviteUnreadCount, setInviteUnreadCount] = useState(0)
  const [activeUnreadCount, setActiveUnreadCount] = useState(0)
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
      setConversations(data.conversations || [])

      if (tab === 'invitations') {
        const total = (data.conversations || []).reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0)
        setInviteUnreadCount(total)
      } else {
        const total = (data.conversations || []).reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0)
        setActiveUnreadCount(total)
      }

      // Load partner info for each conversation
      const infos = new Map<string, PartnerInfo>(partnerInfos)
      for (const conv of data.conversations || []) {
        if (!infos.has(conv.partner_id)) {
          try {
            const portfolio = await portfolioHelpers.getHumanPortfolio(conv.partner_id)
            if (portfolio) {
              const metadata = portfolio.metadata as any
              const basic = metadata?.basic || {}
              const displayName = basic.name || metadata?.username || 'User'
              const avatarUrl = basic?.avatar || metadata?.avatar_url
              const finalAvatarUrl =
                avatarUrl ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`
              infos.set(conv.partner_id, { id: conv.partner_id, name: displayName, avatar: finalAvatarUrl })
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

  // Fetch invite unread count on mount so Invite tab can show red dot without switching tabs
  const loadInviteUnreadCount = async () => {
    try {
      const response = await fetch('/api/messages?tab=invitations')
      if (response.ok) {
        const data = await response.json()
        const total = (data.conversations || []).reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0)
        setInviteUnreadCount(total)
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadConversations(activeTab)
  }, [activeTab])

  useEffect(() => {
    loadInviteUnreadCount()
  }, [])

  const formatRelativeTime = (isoString: string): string => {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHr = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHr / 24)

    if (diffSec < 60) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHr < 24) return `${diffHr}h ago`
    if (diffDay === 1) return 'Yesterday'
    if (diffDay < 7) return `${diffDay}d ago`
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center"><Content>Loading conversations...</Content></div>
      </div>
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
              onClick={(e) => {
                e.preventDefault()
                setActiveTab('active')
              }}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                activeTab === 'active'
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <UIText>Active</UIText>
                {activeUnreadCount > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-red-600 min-w-[1.25rem] h-5 px-1.5">
                    <UIText style={{ color: 'white' }}>{activeUnreadCount}</UIText>
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                setActiveTab('invitations')
              }}
              className={`relative px-4 py-2 rounded-lg text-sm transition-colors ${
                activeTab === 'invitations'
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <UIText>Invitations</UIText>
              {inviteUnreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 bg-red-600 rounded-full h-2 w-2" aria-label="Unread invitations" />
              )}
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

                const last = conv.last_message
                const isSentByMe = last.sender_id !== conv.partner_id
                const baseText = (last.text || '').trim()
                const hasUnread = conv.unread_count > 0

                let previewText = baseText

                if (!previewText) {
                  const hasNote = !!last.note_id
                  const isCommentPreview = last.message_type === 'comment_preview'
                  const hasAnnotation = !!last.annotation_id

                  if (isCommentPreview) {
                    if (hasAnnotation) {
                      // Comment notification
                      previewText = isSentByMe
                        ? 'You commented on: ...'
                        : 'Sent you a comment on: ...'
                    } else if (hasNote) {
                      // Reaction (like) notification on a note
                      previewText = isSentByMe
                        ? 'You reacted to a note with ❤️ ...'
                        : 'Reacted to your note with ❤️ ...'
                    } else {
                      // Fallback comment preview
                      previewText = isSentByMe
                        ? 'You sent an update on: ...'
                        : 'Sent you an update on: ...'
                    }
                  } else if (hasNote) {
                    // Generic note/share preview
                    previewText = isSentByMe
                      ? 'You shared a note: ...'
                      : 'Shared a note with you: ...'
                  } else {
                    // Generic fallback so the preview is never empty
                    previewText = isSentByMe ? 'You sent a message' : 'New message'
                  }
                }

                return (
                  <div
                    key={conv.partner_id}
                    className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <Link
                      href={`/messages/${conv.partner_id}`}
                      className="flex-1 min-w-0 flex items-center gap-4 text-left"
                    >
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        className="h-12 w-12 rounded-full object-cover border-2 border-gray-300"
                      />
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <UIText as="h3" className="truncate">
                              {hasUnread ? <strong>{displayName}</strong> : displayName}
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
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {hasUnread && (
                              <span className="inline-flex items-center justify-center rounded-full bg-red-600 min-w-[1.25rem] h-5 px-1.5">
                                <UIButtonText style={{ color: 'white' }}>{conv.unread_count}</UIButtonText>
                              </span>
                            )}
                            <UIButtonText as="span" className="text-gray-500">
                              {formatRelativeTime(conv.last_message.created_at)}
                            </UIButtonText>
                          </div>
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
                          <UIButtonText
                            as="p"
                            className="truncate mt-1 max-w-full block text-gray-500"
                          >
                            {hasUnread ? <strong>{previewText}</strong> : previewText}
                          </UIButtonText>
                        )}
                      </div>
                    </Link>
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

