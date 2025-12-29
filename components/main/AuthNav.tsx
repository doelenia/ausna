'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { UserAvatar } from '@/components/main/UserAvatar'
import { createHumanPortfolioHelpers } from '@/lib/portfolio/human-client'

export function AuthNav() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      // getUser() automatically refreshes expired tokens
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }

    checkUser()

    // Listen for auth changes - this will catch session updates and token refreshes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Handle all auth state changes
      if (event === 'TOKEN_REFRESHED') {
        // When token is refreshed, get updated user data
        const {
          data: { user },
        } = await supabase.auth.getUser()
        setUser(user ?? null)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
      } else {
        // For other events (SIGNED_IN, USER_UPDATED, etc.), use session user
        setUser(session?.user ?? null)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  if (loading) {
    return (
      <div className="h-8 w-20 bg-gray-200 animate-pulse rounded"></div>
    )
  }

  return (
    <>
      {user ? (
        <UserAvatarClient userId={user.id} />
      ) : (
        <Link
          href="/login"
          className="text-blue-600 hover:text-blue-500 px-3 py-2 rounded-md text-sm font-medium"
        >
          Sign In
        </Link>
      )}
    </>
  )
}

function UserAvatarClient({ userId }: { userId: string }) {
  const [humanPortfolio, setHumanPortfolio] = useState<{ metadata?: any } | null>(null)
  const supabase = createClient()
  const portfolioHelpers = createHumanPortfolioHelpers(supabase)

  useEffect(() => {
    const loadHumanPortfolio = async () => {
      try {
        const portfolio = await portfolioHelpers.ensureHumanPortfolio(userId)
        setHumanPortfolio(portfolio)
      } catch (error) {
        console.error('Error loading human portfolio:', error)
      }
    }

    loadHumanPortfolio()
  }, [userId, portfolioHelpers])

  const metadata = humanPortfolio?.metadata as any
  const basic = metadata?.basic || {}
  const username = metadata?.username || basic.name
  const avatarUrl = basic?.avatar || metadata?.avatar_url
  const displayName = username || 'User'
  const finalAvatarUrl =
    avatarUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`

  // Link to human portfolio instead of account page
  const humanPortfolioUrl = humanPortfolio 
    ? `/portfolio/human/${humanPortfolio.id}`
    : `/portfolio/human/${userId}`

  return (
    <Link
      href={humanPortfolioUrl}
      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
    >
      <img
        src={finalAvatarUrl}
        alt={displayName}
        className="h-8 w-8 rounded-full border-2 border-gray-300"
      />
      <span className="text-sm font-medium text-gray-700 hidden sm:inline">
        {username ? `@${username}` : displayName}
      </span>
    </Link>
  )
}

