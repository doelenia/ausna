'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { createHumanPortfolioHelpers } from '@/lib/portfolio/human-client'
import { Title, Content, UIText, Dropdown } from '@/components/ui'
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
              <UIText>Active</UIText>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                setActiveTab('invitations')
              }}
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
                    <Link
                      href={`/messages/${conv.partner_id}`}
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

