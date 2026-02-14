'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { UserAvatar } from '@/components/ui'
import { createHumanPortfolioHelpers } from '@/lib/portfolio/human-client'
import { HumanPortfolio } from '@/types/portfolio'

export function AuthNav() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    const checkUser = async () => {
      const getUserStartTime = Date.now();
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

        // Use getUser() for security - it authenticates with the server
        // getSession() reads from storage and may not be authentic
        const getUserPromise = supabase.auth.getUser();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('getUser timeout after 10s')), 10000));
        const {
          data: { user },
          error,
        } = await Promise.race([getUserPromise, timeoutPromise]) as any;
        
        const getUserDuration = Date.now() - getUserStartTime;

        if (error) {
          console.error('[AuthNav] Error getting user:', error.message)
          if (isSafari) {
            console.error('[AuthNav] Safari: This may be a cookie/ITP issue')
          }
        }
        
        // Only update state if component is still mounted
        if (isMountedRef.current) {
          setUser(user)
        }
      } catch (error: any) {
        console.error('[AuthNav] Error in checkUser:', error)
      } finally {
        // Only update state if component is still mounted
        if (isMountedRef.current) {
          setLoading(false)
        }
      }
    }

    checkUser()

    // Listen for auth changes - this will catch session updates and token refreshes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
      // Only process auth state changes if component is still mounted
      if (!isMountedRef.current) return
      
      // Handle all auth state changes
      if (event === 'TOKEN_REFRESHED') {
        // When token is refreshed, get updated user data
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (isMountedRef.current) {
          setUser(user ?? null)
        }
      } else if (event === 'SIGNED_OUT') {
        if (isMountedRef.current) {
          setUser(null)
        }
      } else {
        // For other events (SIGNED_IN, USER_UPDATED, etc.), use session user
        if (isMountedRef.current) {
          setUser(session?.user ?? null)
        }
      }
    })

    return () => {
      isMountedRef.current = false
      subscription.unsubscribe()
    }
  }, []) // Removed supabase dependency - it's now memoized and stable

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
      const portfolioHelpers = createHumanPortfolioHelpers(supabase)
      
      try {
        // Add timeout to prevent infinite loading (10 seconds)
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('Timeout loading human portfolio'))
          }, 10000)
        })

        const portfolioPromise = portfolioHelpers.ensureHumanPortfolio(userId)
        const portfolio = await Promise.race([portfolioPromise, timeoutPromise]) as HumanPortfolio
        
        if (timeoutId) {
          clearTimeout(timeoutId)
        }

        if (isMounted) {
          setHumanPortfolio(portfolio)
          setError(null)
        }
      } catch (error: any) {
        if (isMounted) {
          setError(error?.message || 'Failed to load profile')
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        if (isMounted) {
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
  const displayName = basic.name || metadata?.username || 'User'
  const avatarUrl = basic?.avatar || metadata?.avatar_url

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
    <UserAvatar
      userId={userId}
      name={displayName}
      avatar={avatarUrl}
      size={32}
      href={humanPortfolioUrl}
    />
  )
}

