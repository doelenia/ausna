'use client'

import { useState, useEffect } from 'react'
import { getPinnedItems } from '@/app/portfolio/[type]/[id]/actions'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import Link from 'next/link'
import { Title, Content, UIText } from '@/components/ui'

interface PinnedItemWithData {
  type: 'portfolio' | 'note'
  id: string
  portfolio?: {
    id: string
    type: string
    name: string
    avatar?: string
    slug: string
    role?: 'manager' | 'member' // Role of the human portfolio owner in this pinned portfolio
  }
  note?: {
    id: string
    text: string
    owner_account_id: string
    created_at: string
  }
}

interface PinnedSectionProps {
  portfolioId: string
}

export function PinnedSection({ portfolioId }: PinnedSectionProps) {
  const [items, setItems] = useState<PinnedItemWithData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchPinnedItems = async () => {
      setLoading(true)
      setError(null)
      
      const result = await getPinnedItems(portfolioId)
      
      if (result.success && result.items) {
        setItems(result.items)
      } else {
        setError(result.error || 'Failed to load pinned items')
      }
      
      setLoading(false)
    }

    fetchPinnedItems()
  }, [portfolioId])

  if (loading) {
    return (
      <div className="mb-6">
        <UIText>Loading...</UIText>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-6">
        <UIText className="text-red-500">{error}</UIText>
      </div>
    )
  }

  if (items.length === 0) {
    return null // Don't show section if no pinned items
  }

  return (
    <div className="mb-6 pb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => {
          if (item.type === 'portfolio' && item.portfolio) {
            const portfolio = item.portfolio
            return (
              <Link
                key={`portfolio-${item.id}`}
                href={getPortfolioUrl(portfolio.type as any, portfolio.id)}
                className="block bg-transparent rounded-lg border border-gray-200 transition-opacity hover:opacity-80 overflow-hidden"
              >
                {portfolio.avatar ? (
                  <img
                    src={portfolio.avatar}
                    alt={portfolio.name}
                    className="w-full h-32 object-cover"
                  />
                ) : (
                  <div className="w-full h-32 bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                    <svg
                      className="h-12 w-12 text-white opacity-50"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Title as="h3" className="truncate">
                      {portfolio.name}
                    </Title>
                    {portfolio.role && (
                      <UIText as="span" className={`px-2 py-0.5 rounded-full flex-shrink-0 ${
                        portfolio.role === 'manager'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {portfolio.role === 'manager' ? 'Manager' : 'Member'}
                      </UIText>
                    )}
                  </div>
                </div>
              </Link>
            )
          } else if (item.type === 'note' && item.note) {
            const note = item.note
            return (
              <Link
                key={`note-${item.id}`}
                href={`/notes/${item.id}`}
                className="block bg-transparent rounded-lg border border-gray-200 transition-opacity hover:opacity-80 p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <UIText as="span">
                    {new Date(note.created_at).toLocaleDateString()}
                  </UIText>
                </div>
                <Content as="p" className="line-clamp-3">
                  {note.text}
                </Content>
              </Link>
            )
          }
          return null
        })}
      </div>
    </div>
  )
}

