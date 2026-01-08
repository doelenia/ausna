'use client'

import { useState, useEffect } from 'react'

export interface Community {
  id: string
  name: string
  slug: string
}

export type FeedType = 'all' | 'friends' | 'community'

interface FeedTabsProps {
  activeFeed: FeedType
  activeCommunityId?: string | null
  onFeedChange: (feedType: FeedType, communityId?: string | null) => void
}

export function FeedTabs({
  activeFeed,
  activeCommunityId,
  onFeedChange,
}: FeedTabsProps) {
  const [communities, setCommunities] = useState<Community[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCommunities = async () => {
      try {
        const response = await fetch('/api/feed/communities')
        if (response.ok) {
          const data = await response.json()
          setCommunities(data.communities || [])
        }
      } catch (error) {
        console.error('Error fetching communities:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchCommunities()
  }, [])

  const handleTabClick = (feedType: FeedType, communityId?: string | null) => {
    onFeedChange(feedType, communityId)
  }

  return (
    <div className="sticky top-0 md:top-16 z-40">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div 
          className="rounded-xl bg-gray-50/80 backdrop-blur-xl p-1"
          style={{
            WebkitBackdropFilter: 'blur(24px)',
            backdropFilter: 'blur(24px)',
            WebkitTransform: 'translateZ(0)',
            transform: 'translateZ(0)',
            isolation: 'isolate',
          } as React.CSSProperties}
        >
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {/* All feed tab */}
            <button
              onClick={() => handleTabClick('all')}
              className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                activeFeed === 'all' && !activeCommunityId
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>

            {/* Friends feed tab */}
            <button
              onClick={() => handleTabClick('friends')}
              className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                activeFeed === 'friends'
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              Friends
            </button>

            {/* Community tabs */}
            {loading ? (
              <div className="px-4 py-2 text-sm text-gray-500">Loading communities...</div>
            ) : (
              communities.map((community) => (
                <button
                  key={community.id}
                  onClick={() => handleTabClick('community', community.id)}
                  className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                    activeFeed === 'community' && activeCommunityId === community.id
                      ? 'bg-gray-200 text-gray-700'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {community.name}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

