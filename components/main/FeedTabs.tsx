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
    <div className="bg-transparent border-b border-gray-200 sticky top-0 md:top-16 z-40">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-1 overflow-x-auto scrollbar-hide">
          {/* All feed tab */}
          <button
            onClick={() => handleTabClick('all')}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeFeed === 'all' && !activeCommunityId
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            All
          </button>

          {/* Friends feed tab */}
          <button
            onClick={() => handleTabClick('friends')}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeFeed === 'friends'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Friends
          </button>

          {/* Community tabs */}
          {loading ? (
            <div className="px-4 py-3 text-sm text-gray-500">Loading communities...</div>
          ) : (
            communities.map((community) => (
              <button
                key={community.id}
                onClick={() => handleTabClick('community', community.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeFeed === 'community' && activeCommunityId === community.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {community.name}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

