'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { UserAvatar } from '@/components/main/UserAvatar'
import { createHumanPortfolioHelpers } from '@/lib/portfolio/human-client'
import { HumanPortfolio } from '@/types/portfolio'

export function AuthNav() {
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
          console.warn('[AuthNav] No auth cookies found. Available cookies:', cookies.length)
          if (isSafari) {
            console.warn('[AuthNav] Safari detected - cookies may be blocked by ITP')
          }
        } else {
          console.log('[AuthNav] Found auth cookies:', authCookies.length)
        }

        // Try getSession first (more reliable in Safari)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.error('[AuthNav] Session error:', sessionError.message)
        }
        
        if (session?.user) {
          console.log('[AuthNav] User from session:', session.user.id)
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
          console.error('[AuthNav] Error getting user:', error.message)
          if (isSafari) {
            console.error('[AuthNav] Safari: This may be a cookie/ITP issue')
          }
        }
        
        setUser(user)
      } catch (error) {
        console.error('[AuthNav] Error in checkUser:', error)
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
  const [humanPortfolio, setHumanPortfolio] = useState<HumanPortfolio | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let isMounted = true
    let timeoutId: NodeJS.Timeout | null = null

    const loadHumanPortfolio = async () => {
      console.log('[AuthNav.UserAvatarClient] Starting to load portfolio for userId:', userId)
      const portfolioHelpers = createHumanPortfolioHelpers(supabase)
      
      try {
        // Verify auth before loading portfolio
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
        if (authError) {
          console.error('[AuthNav.UserAvatarClient] Auth error:', authError.message)
          throw new Error(`Auth error: ${authError.message}`)
        }
        if (!authUser) {
          console.error('[AuthNav.UserAvatarClient] No authenticated user')
          throw new Error('No authenticated user')
        }
        console.log('[AuthNav.UserAvatarClient] User authenticated:', authUser.id)

        // Add timeout to prevent infinite loading (10 seconds)
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('Timeout loading human portfolio'))
          }, 10000)
        })

        console.log('[AuthNav.UserAvatarClient] Calling ensureHumanPortfolio...')
        const portfolioPromise = portfolioHelpers.ensureHumanPortfolio(userId)
        
        const portfolio = await Promise.race([portfolioPromise, timeoutPromise]) as HumanPortfolio
        
        if (timeoutId) {
          clearTimeout(timeoutId)
        }

        console.log('[AuthNav.UserAvatarClient] Portfolio loaded successfully:', portfolio?.id)

        if (isMounted) {
          console.log('[AuthNav.UserAvatarClient] Setting portfolio state')
          setHumanPortfolio(portfolio)
          setError(null)
        }
      } catch (error: any) {
        console.error('[AuthNav.UserAvatarClient] Error loading human portfolio:', error)
        // Log additional details for debugging
        if (error?.message) {
          console.error('[AuthNav.UserAvatarClient] Error message:', error.message)
        }
        if (error?.stack) {
          console.error('[AuthNav.UserAvatarClient] Error stack:', error.stack)
        }
        // Check if it's an auth error
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) {
            console.warn('[AuthNav.UserAvatarClient] User not authenticated when loading portfolio')
          }
        } catch (authError) {
          console.warn('[AuthNav.UserAvatarClient] Failed to check auth status:', authError)
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
          console.log('[AuthNav.UserAvatarClient] Setting loading to false')
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

  if (loading) {
    return (
      <div className="h-8 w-8 bg-gray-200 animate-pulse rounded-full"></div>
    )
  }

  // Fallback UI if loading failed - still show avatar with user ID
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

  // Fallback UI if loading failed
  if (error || !humanPortfolio) {
    const fallbackDisplayName = 'User'
    const fallbackAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackDisplayName)}&background=random`
    
    return (
      <Link
        href={`/portfolio/human/${userId}`}
        className="hover:opacity-80 transition-opacity"
        title={error ? `Error: ${error}` : 'Loading profile...'}
      >
        <img
          src={fallbackAvatarUrl}
          alt={fallbackDisplayName}
          className="h-8 w-8 rounded-full border-2 border-gray-300 object-cover"
        />
      </Link>
    )
  }

  return (
    <Link
      href={humanPortfolioUrl}
      className="hover:opacity-80 transition-opacity"
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
    </Link>
  )
}

