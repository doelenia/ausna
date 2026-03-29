'use client'

import { useState, useEffect } from 'react'

export interface FeedSpaceTab {
  id: string
  name: string
  slug: string
}

export type FeedType = 'all' | 'friends' | 'space'

interface FeedTabsProps {
  activeFeed: FeedType
  activeSpaceId?: string | null
  onFeedChange: (feedType: FeedType, spaceId?: string | null) => void
}

export function FeedTabs({
  activeFeed,
  activeSpaceId,
  onFeedChange,
}: FeedTabsProps) {
  const [spaces, setSpaces] = useState<FeedSpaceTab[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSpaces = async () => {
      try {
        const response = await fetch('/api/feed/communities')
        if (response.ok) {
          const data = await response.json()
          setSpaces(data.spaces || data.communities || [])
        }
      } catch (error) {
        console.error('Error fetching feed spaces:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSpaces()
  }, [])

  const handleTabClick = (feedType: FeedType, spaceId?: string | null) => {
    onFeedChange(feedType, spaceId)
  }

  return (
    <div className="sticky top-0 z-40">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div
          className="rounded-xl bg-gray-50/80 backdrop-blur-xl p-1"
          style={
            {
              WebkitBackdropFilter: 'blur(24px)',
              backdropFilter: 'blur(24px)',
              WebkitTransform: 'translateZ(0)',
              transform: 'translateZ(0)',
              isolation: 'isolate',
            } as React.CSSProperties
          }
        >
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={(e) => {
                e.preventDefault()
                handleTabClick('all')
              }}
              className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                activeFeed === 'all' && !activeSpaceId
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>

            <button
              onClick={(e) => {
                e.preventDefault()
                handleTabClick('friends')
              }}
              className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                activeFeed === 'friends'
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              Friends
            </button>

            {loading ? (
              <div className="px-4 py-2 text-sm text-gray-500">Loading spaces...</div>
            ) : (
              spaces.map((space) => (
                <button
                  key={space.id}
                  onClick={(e) => {
                    e.preventDefault()
                    handleTabClick('space', space.id)
                  }}
                  className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                    activeFeed === 'space' && activeSpaceId === space.id
                      ? 'bg-gray-200 text-gray-700'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {space.name}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
