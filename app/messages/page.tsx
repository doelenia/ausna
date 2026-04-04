'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { Title, Content, UIText, UIButtonText, Dropdown } from '@/components/ui'
import { MessagesInboxSkeleton } from '@/components/main/MessagesInboxSkeleton'
import { getInboxListCache, putInboxListCache } from '@/lib/messages/inboxListCache'
import { Archive } from 'lucide-react'

interface Conversation {
  partner_id: string
  partner_name?: string
  partner_avatar_url?: string | null
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

function MessagesPageContent() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'invitations' | 'active'>('active')
  const [inviteUnreadCount, setInviteUnreadCount] = useState(0)
  const [activeUnreadCount, setActiveUnreadCount] = useState(0)

  const applyConversationsPayload = (
    tab: 'invitations' | 'active',
    list: Conversation[]
  ) => {
    setConversations(list)
    const total = list.reduce((sum, c) => sum + (c.unread_count || 0), 0)
    if (tab === 'invitations') {
      setInviteUnreadCount(total)
    } else {
      setActiveUnreadCount(total)
    }
  }

  const loadConversations = async (tab: 'invitations' | 'active' = activeTab) => {
    const warm = getInboxListCache(tab) as Conversation[] | null
    if (warm != null) {
      applyConversationsPayload(tab, warm)
      setLoading(false)
    } else {
      setLoading(true)
    }

    try {
      const response = await fetch(`/api/messages?tab=${tab}`)
      if (!response.ok) {
        throw new Error('Failed to load conversations')
      }
      const data = await response.json()
      const list = (data.conversations || []) as Conversation[]
      applyConversationsPayload(tab, list)
      putInboxListCache(tab, list)
    } catch (error) {
      console.error('Error loading conversations:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch invite unread count on mount so Invite tab can show red dot without switching tabs
  const loadInviteUnreadCount = async () => {
    const warm = getInboxListCache('invitations') as Conversation[] | null
    if (warm != null) {
      const total = warm.reduce((sum, c) => sum + (c.unread_count || 0), 0)
      setInviteUnreadCount(total)
    }
    try {
      const response = await fetch('/api/messages?tab=invitations')
      if (response.ok) {
        const data = await response.json()
        const list = (data.conversations || []) as Conversation[]
        const total = list.reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0)
        setInviteUnreadCount(total)
        putInboxListCache('invitations', list)
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
    return <MessagesInboxSkeleton />
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
                const displayName =
                  (typeof conv.partner_name === 'string' && conv.partner_name.trim()) || 'User'
                const avatarUrl =
                  (typeof conv.partner_avatar_url === 'string' && conv.partner_avatar_url.trim()) ||
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
                      prefetch
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
    <Suspense fallback={<MessagesInboxSkeleton />}>
      <MessagesPageContent />
    </Suspense>
  )
}

