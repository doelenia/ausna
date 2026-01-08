'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { UserAvatar } from '@/components/ui'
import { StickerAvatar } from '@/components/portfolio/StickerAvatar'
import { Content, UIText, UIButtonText } from '@/components/ui'
import { PortfolioType } from '@/types/portfolio'

interface SearchResult {
  id: string
  type: PortfolioType
  name: string
  description?: string
  avatar?: string | null
  emoji?: string | null
  username?: string | null
  projectType?: string | null
  user_id: string
}

interface MutualInfo {
  mutualFriends: Array<{ id: string; name: string; user_id: string }>
  mutualCommunities: Array<{ id: string; name: string }>
}

interface SearchResultItemProps {
  result: SearchResult
  currentUserId?: string | null
}

export function SearchResultItem({ result, currentUserId }: SearchResultItemProps) {
  const [mutualInfo, setMutualInfo] = useState<MutualInfo | null>(null)
  const [loadingMutual, setLoadingMutual] = useState(false)

  // Lazy-load mutual info when component is visible
  useEffect(() => {
    if (!currentUserId || result.type === 'human' && result.user_id === currentUserId) {
      return // Skip for visitors or own profile
    }

    // Load mutual info after a short delay to prioritize showing description first
    const timer = setTimeout(() => {
      setLoadingMutual(true)
      fetch(`/api/portfolios/search/mutual?portfolioId=${result.id}`)
        .then(res => {
          if (!res.ok) {
            // If unauthorized or error, just don't show mutual info
            return null
          }
          return res.json()
        })
        .then((data: MutualInfo | null) => {
          if (data) {
            setMutualInfo(data)
          }
          setLoadingMutual(false)
        })
        .catch((error) => {
          console.error('Error loading mutual info:', error)
          setLoadingMutual(false)
        })
    }, 100)

    return () => clearTimeout(timer)
  }, [result.id, result.type, result.user_id, currentUserId])

  // Determine second line content and whether it should be bold
  const getSecondLine = (): { text: string; isBold: boolean } => {
    if (loadingMutual) {
      return { text: result.description || '', isBold: false }
    }

    if (mutualInfo) {
      if (result.type === 'human') {
        // Prioritize mutual communities, then mutual friends
        if (mutualInfo.mutualCommunities.length > 0) {
          const community = mutualInfo.mutualCommunities[0]
          if (mutualInfo.mutualCommunities.length === 1 && community.name) {
            return { text: `Both in ${community.name}`, isBold: true }
          }
          if (mutualInfo.mutualCommunities.length > 1) {
            return { text: `${mutualInfo.mutualCommunities.length} mutual communities`, isBold: true }
          }
        }
        if (mutualInfo.mutualFriends.length > 0) {
          const friend = mutualInfo.mutualFriends[0]
          if (mutualInfo.mutualFriends.length === 1 && friend.name) {
            return { text: `Mutual friend: ${friend.name}`, isBold: true }
          }
          if (mutualInfo.mutualFriends.length > 1) {
            return { text: `${mutualInfo.mutualFriends.length} mutual friends`, isBold: true }
          }
        }
      } else if (result.type === 'projects') {
        // Show friends who are members
        if (mutualInfo.mutualFriends.length > 0) {
          const friend = mutualInfo.mutualFriends[0]
          if (mutualInfo.mutualFriends.length === 1 && friend.name) {
            return { text: `${friend.name} is on this project`, isBold: true }
          }
          if (mutualInfo.mutualFriends.length > 1) {
            return { text: `${mutualInfo.mutualFriends.length} friends are on this project`, isBold: true }
          }
        }
      } else if (result.type === 'community') {
        // Show friends who are members
        if (mutualInfo.mutualFriends.length > 0) {
          const friend = mutualInfo.mutualFriends[0]
          if (mutualInfo.mutualFriends.length === 1 && friend.name) {
            return { text: `${friend.name} joined this community`, isBold: true }
          }
          if (mutualInfo.mutualFriends.length > 1) {
            return { text: `${mutualInfo.mutualFriends.length} friends joined this community`, isBold: true }
          }
        }
      }
    }

    // Default to description
    return { text: result.description || '', isBold: false }
  }

  const secondLine = getSecondLine()
  const portfolioUrl = `/portfolio/${result.type}/${result.id}`

  return (
    <Link
      href={portfolioUrl}
      className="flex items-start gap-4 p-4 hover:bg-gray-100 transition-colors rounded-lg"
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        {result.type === 'human' ? (
          <UserAvatar
            userId={result.user_id}
            name={result.name}
            avatar={result.avatar}
            size={48}
            showLink={false}
          />
        ) : (
          <StickerAvatar
            src={result.avatar ?? undefined}
            alt={result.name}
            type={result.type}
            size={48}
            emoji={result.emoji ?? undefined}
            name={result.name}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {/* First row: Name + Username/Type */}
        <div className="flex items-baseline gap-2 mb-0.5 min-w-0">
          <Content className="truncate min-w-0">{result.name}</Content>
          {result.type === 'human' && result.username && (
            <UIButtonText className="text-gray-500 flex-shrink-0">@{result.username}</UIButtonText>
          )}
          {result.type === 'projects' && result.projectType && (
            <UIButtonText className="text-gray-500 flex-shrink-0">{result.projectType}</UIButtonText>
          )}
          {result.type === 'community' && (
            <UIButtonText className="text-gray-500 flex-shrink-0">Community</UIButtonText>
          )}
        </div>

        {/* Second row: Description or mutual context */}
        {secondLine.text && (
          <div className="min-w-0 overflow-hidden">
            <UIButtonText 
              className={`text-gray-500 truncate block w-full ${secondLine.isBold ? '!font-bold' : ''}`}
              style={secondLine.isBold ? { fontWeight: 700 } : undefined}
            >
              {secondLine.text}
            </UIButtonText>
          </div>
        )}
      </div>
    </Link>
  )
}

