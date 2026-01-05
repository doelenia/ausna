'use client'

import Link from 'next/link'
import { useMemo } from 'react'

export interface UserAvatarProps {
  userId: string
  name?: string | null
  avatar?: string | null
  size?: number
  className?: string
  href?: string
  showLink?: boolean
}

/**
 * Generate initials from a name
 * Takes first letter of first word and first letter of last word
 * Falls back to first two characters if only one word
 */
function getInitials(name: string | null | undefined): string {
  if (!name || name.trim() === '') {
    return 'U'
  }

  const words = name.trim().split(/\s+/)
  
  if (words.length === 0) {
    return 'U'
  }
  
  if (words.length === 1) {
    // Single word: take first two characters
    const word = words[0]
    if (word.length >= 2) {
      return word.substring(0, 2).toUpperCase()
    }
    return word.charAt(0).toUpperCase()
  }
  
  // Multiple words: take first letter of first and last word
  const first = words[0].charAt(0).toUpperCase()
  const last = words[words.length - 1].charAt(0).toUpperCase()
  return `${first}${last}`
}

/**
 * Reusable UserAvatar component
 * - Shows avatar image if provided
 * - Falls back to gray background with initials if no avatar
 * - Supports linking to user's portfolio
 * - Consistent styling across the application
 */
export function UserAvatar({
  userId,
  name,
  avatar,
  size = 32,
  className = '',
  href,
  showLink = true,
}: UserAvatarProps) {
  const initials = useMemo(() => getInitials(name), [name])
  const avatarUrl = avatar || null
  const portfolioUrl = href || `/portfolio/human/${userId}`

  const sizeStyle = {
    width: `${size}px`,
    height: `${size}px`,
    fontSize: `${size * 0.4}px`,
  }

  const avatarContent = (
    <div
      className={`rounded-full flex items-center justify-center flex-shrink-0 bg-gray-300 overflow-hidden ${className}`}
      style={{
        ...sizeStyle,
        border: '1px solid rgba(156, 163, 175, 0.5)', // Match StickerAvatar human avatar border
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name || `User ${userId.slice(0, 8)}`}
          className="w-full h-full rounded-full object-cover"
          onError={(e) => {
            // Hide image and show initials on error
            const target = e.target as HTMLImageElement
            target.style.display = 'none'
            const parent = target.parentElement
            if (parent) {
              const initialsEl = parent.querySelector('.initials-fallback')
              if (initialsEl) {
                (initialsEl as HTMLElement).style.display = 'flex'
              }
            }
          }}
        />
      ) : null}
      <div
        className={`initials-fallback ${avatarUrl ? 'hidden' : 'flex'} items-center justify-center text-gray-700 font-medium`}
        style={{ fontSize: sizeStyle.fontSize }}
      >
        {initials}
      </div>
    </div>
  )

  if (showLink) {
    return (
      <Link href={portfolioUrl} className="hover:opacity-80 transition-opacity">
        {avatarContent}
      </Link>
    )
  }

  return avatarContent
}

