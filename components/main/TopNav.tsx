'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { createHumanPortfolioHelpers } from '@/lib/portfolio/human-client'
import { HumanPortfolio } from '@/types/portfolio'

export function TopNav() {
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

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left side - Home link */}
          <div className="flex items-center">
            <Link 
              href="/main" 
              className="text-xl font-bold text-gray-900 hover:text-gray-700 transition-colors"
            >
              Ausna
            </Link>
          </div>

          {/* Right side - Avatar or Sign In */}
          <div className="flex items-center gap-4">
            {loading ? (
              <div className="h-8 w-8 bg-gray-200 animate-pulse rounded-full"></div>
            ) : user ? (
              <>
                <Link
                  href="/messages"
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                  title="Messages"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  <span className="hidden sm:inline">Messages</span>
                </Link>
                <UserAvatarClient userId={user.id} />
              </>
            ) : (
              <Link
                href="/login"
                className="text-blue-600 hover:text-blue-500 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}

function UserAvatarClient({ userId }: { userId: string }) {
  const [humanPortfolio, setHumanPortfolio] = useState<HumanPortfolio | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const portfolioHelpers = createHumanPortfolioHelpers(supabase)

  useEffect(() => {
    const loadHumanPortfolio = async () => {
      try {
        const portfolio = await portfolioHelpers.ensureHumanPortfolio(userId)
        setHumanPortfolio(portfolio)
      } catch (error) {
        console.error('Error loading human portfolio:', error)
      } finally {
        setLoading(false)
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

  if (loading) {
    return (
      <div className="h-8 w-8 bg-gray-200 animate-pulse rounded-full"></div>
    )
  }

  return (
    <Link
      href={humanPortfolioUrl}
      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
    >
      <img
        src={finalAvatarUrl}
        alt={displayName}
        className="h-8 w-8 rounded-full border-2 border-gray-300 object-cover"
      />
      <span className="text-sm font-medium text-gray-700 hidden sm:inline">
        {username ? `@${username}` : displayName}
      </span>
    </Link>
  )
}

