'use client'

import { useEffect, useState, useMemo } from 'react'
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
      try {
        // Debug: Check cookies before getUser
        const cookies = document.cookie.split(';').map(c => c.trim())
        const authCookies = cookies.filter(c => 
          c.includes('auth-token') || 
          c.includes('supabase') ||
          c.startsWith('sb-')
        )
        
        // Safari-specific debugging
        const isSafari = /safari/.test(navigator.userAgent.toLowerCase()) && 
                        !/chrome/.test(navigator.userAgent.toLowerCase()) &&
                        !/chromium/.test(navigator.userAgent.toLowerCase())
        
        if (authCookies.length === 0) {
          console.warn('[TopNav] No auth cookies found. Available cookies:', cookies.length)
          if (isSafari) {
            console.warn('[TopNav] Safari detected - cookies may be blocked by ITP')
            console.warn('[TopNav] Available cookie names:', cookies.map(c => c.split('=')[0]).join(', ') || 'NONE')
          }
        } else {
          console.log('[TopNav] Found auth cookies:', authCookies.length)
          if (isSafari) {
            console.log('[TopNav] Safari: Cookie names found:', authCookies.map(c => c.split('=')[0]).join(', '))
          }
        }

        // Try getSession first (reads from cookies directly)
        // This is more reliable in Safari
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.error('[TopNav] Session error:', sessionError.message)
        }
        
        if (session?.user) {
          console.log('[TopNav] User from session:', session.user.id)
          setUser(session.user)
          setLoading(false)
          return
        }

        // Fallback to getUser() which may refresh tokens
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser()
        
        if (error) {
          console.error('[TopNav] Error getting user:', error.message)
          if (isSafari) {
            console.error('[TopNav] Safari: This may be a cookie/ITP issue')
          }
        }
        
        setUser(user)
      } catch (error) {
        console.error('[TopNav] Error in checkUser:', error)
      } finally {
        setLoading(false)
      }
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
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let isMounted = true
    let timeoutId: NodeJS.Timeout | null = null

    const loadHumanPortfolio = async () => {
      console.log('[UserAvatarClient] Starting to load portfolio for userId:', userId)
      const portfolioHelpers = createHumanPortfolioHelpers(supabase)
      
      // Safari detection
      const isSafari = typeof window !== 'undefined' && 
                       /safari/.test(navigator.userAgent.toLowerCase()) && 
                       !/chrome/.test(navigator.userAgent.toLowerCase()) &&
                       !/chromium/.test(navigator.userAgent.toLowerCase())
      
      try {
        // In Safari, try getSession first as it's more reliable
        if (isSafari) {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          if (sessionError) {
            console.error('[UserAvatarClient] Safari session error:', sessionError.message)
          }
          if (session?.user) {
            console.log('[UserAvatarClient] Safari: Using session user:', session.user.id)
            // Continue with session user
          }
        }
        
        // Verify auth before loading portfolio
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
        if (authError) {
          console.error('[UserAvatarClient] Auth error:', authError.message)
          if (isSafari) {
            console.error('[UserAvatarClient] Safari: Auth error may be due to cookie/ITP restrictions')
          }
          throw new Error(`Auth error: ${authError.message}`)
        }
        if (!authUser) {
          console.error('[UserAvatarClient] No authenticated user')
          if (isSafari) {
            console.error('[UserAvatarClient] Safari: User not found - cookies may be blocked')
          }
          throw new Error('No authenticated user')
        }
        console.log('[UserAvatarClient] User authenticated:', authUser.id)

        // Add timeout to prevent infinite loading (10 seconds)
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('Timeout loading human portfolio'))
          }, 10000)
        })

        console.log('[UserAvatarClient] Calling ensureHumanPortfolio...')
        const portfolioPromise = portfolioHelpers.ensureHumanPortfolio(userId)
        
        const portfolio = await Promise.race([portfolioPromise, timeoutPromise]) as HumanPortfolio
        
        if (timeoutId) {
          clearTimeout(timeoutId)
        }

        console.log('[UserAvatarClient] Portfolio loaded successfully:', portfolio?.id)

        if (isMounted) {
          console.log('[UserAvatarClient] Setting portfolio state')
          setHumanPortfolio(portfolio)
          setError(null)
        }
      } catch (error: any) {
        console.error('[UserAvatarClient] Error loading human portfolio:', error)
        // Log additional details for debugging
        if (error?.message) {
          console.error('[UserAvatarClient] Error message:', error.message)
        }
        if (error?.stack) {
          console.error('[UserAvatarClient] Error stack:', error.stack)
        }
        // Check if it's an auth error
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) {
            console.warn('[UserAvatarClient] User not authenticated when loading portfolio')
          }
        } catch (authError) {
          console.warn('[UserAvatarClient] Failed to check auth status:', authError)
        }
        
        if (isMounted) {
          setError(error?.message || 'Failed to load profile')
          // Still set loading to false so we can show fallback UI
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        if (isMounted) {
          console.log('[UserAvatarClient] Setting loading to false')
          setLoading(false)
        }
      }
    }

    loadHumanPortfolio()

    return () => {
      isMounted = false
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [userId, supabase])

  const metadata = humanPortfolio?.metadata as any
  const basic = metadata?.basic || {}
  // Prioritize basic.name from human portfolio, fallback to username
  const displayName = basic.name || metadata?.username || 'User'
  const avatarUrl = basic?.avatar || metadata?.avatar_url
  const finalAvatarUrl =
    avatarUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`

  // Link to human portfolio instead of account page
  const humanPortfolioUrl = humanPortfolio 
    ? `/portfolio/human/${humanPortfolio.id}`
    : `/portfolio/human/${userId}`

  if (loading) {
    console.log('[UserAvatarClient] Rendering loading skeleton')
    return (
      <div className="h-8 w-8 bg-gray-200 animate-pulse rounded-full"></div>
    )
  }

  console.log('[UserAvatarClient] Rendering avatar. Loading:', loading, 'Error:', error, 'Portfolio:', humanPortfolio?.id)

  // Fallback UI if loading failed - still show avatar with user ID
  if (error || !humanPortfolio) {
    const fallbackDisplayName = 'User'
    const fallbackAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackDisplayName)}&background=random`
    
    return (
      <Link
        href={`/portfolio/human/${userId}`}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        title={error ? `Error: ${error}` : 'Loading profile...'}
      >
        <img
          src={fallbackAvatarUrl}
          alt={fallbackDisplayName}
          className="h-8 w-8 rounded-full border-2 border-gray-300 object-cover"
        />
        <span className="text-sm font-medium text-gray-700 hidden sm:inline">
          {fallbackDisplayName}
        </span>
      </Link>
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
        onError={(e) => {
          // Fallback to generated avatar if image fails to load
          const target = e.target as HTMLImageElement
          target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`
        }}
      />
      <span className="text-sm font-medium text-gray-700 hidden sm:inline">
        {displayName}
      </span>
    </Link>
  )
}

