'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { createHumanPortfolioHelpers } from '@/lib/portfolio/human-client'
import { HumanPortfolio } from '@/types/portfolio'
import { UIText, IconButton, UserAvatar, Button, Card, Title, Content } from '@/components/ui'
import { Home, MessageCircle, Pen, Search } from 'lucide-react'
import { StickerAvatar } from '@/components/portfolio/StickerAvatar'

/** Shared in-flight getUser so both desktop and mobile TopNav instances reuse one request. */
let sharedGetUserPromise: Promise<{ user: any; error: any }> | null = null

export function TopNav() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [showProjectSelector, setShowProjectSelector] = useState(false)
  const [userProjects, setUserProjects] = useState<Array<{ id: string; name: string; avatar?: string; emoji?: string }>>([])
  const [userProjectsLoading, setUserProjectsLoading] = useState(false)
  const [isApproved, setIsApproved] = useState<boolean | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    const checkUser = async () => {
      const isSafari = typeof navigator !== 'undefined' && /safari/.test(navigator.userAgent.toLowerCase()) && !/chrome/.test(navigator.userAgent.toLowerCase()) && !/chromium/.test(navigator.userAgent.toLowerCase());
      try {
        // Debug: Check cookies before getUser
        const cookies = document.cookie.split(';').map(c => c.trim())
        const authCookies = cookies.filter(c => 
          c.includes('auth-token') || 
          c.includes('supabase') ||
          c.startsWith('sb-')
        )
        
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

        if (!sharedGetUserPromise) {
          sharedGetUserPromise = (async (): Promise<{ user: any; error: any }> => {
            const getUserPromise = supabase.auth.getUser();
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('getUser timeout after 10s')), 10000)
            );
            try {
              const result = await Promise.race([getUserPromise, timeoutPromise]) as any;
              return { user: result?.data?.user ?? null, error: result?.error ?? null };
            } catch (raceError: any) {
              if (raceError?.message === 'getUser timeout after 10s') {
                const { data: { session } } = await supabase.auth.getSession();
                return { user: session?.user ?? null, error: null };
              }
              throw raceError;
            }
          })().finally(() => { sharedGetUserPromise = null; });
        }

        const { user: resolvedUser, error } = await sharedGetUserPromise;

        if (error) {
          console.error('[TopNav] Error getting user:', error.message)
          if (isSafari) {
            console.error('[TopNav] Safari: This may be a cookie/ITP issue')
          }
        }
        
        if (isMountedRef.current) {
          setUser(resolvedUser)
        }
      } catch (error: any) {
        console.error('[TopNav] Error in checkUser:', error)
      } finally {
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

  // Load current user's approval status for gating creation actions.
  // This now uses the is_current_user_approved() helper on the database,
  // which derives approval from non-pseudo human portfolios (is_pseudo = false).
  useEffect(() => {
    if (!user) {
      setIsApproved(null)
      return
    }

    const checkApproval = async () => {
      try {
        const { data, error } = await supabase.rpc('is_current_user_approved')
        if (error) {
          console.error('[TopNav] Error checking approval status:', error)
          setIsApproved(false)
          return
        }
        setIsApproved(Boolean(data))
      } catch (err) {
        console.error('[TopNav] Exception checking approval status:', err)
        setIsApproved(false)
      }
    }

    checkApproval()
  }, [user, supabase])

  // Fetch unread message count from active conversations
  useEffect(() => {
    if (!user) {
      setUnreadCount(0)
      return
    }

    const fetchUnreadCount = async () => {
      try {
        const response = await fetch('/api/messages?tab=active')
        if (response.ok) {
          const data = await response.json()
          const conversations = data.conversations || []
          const totalUnread = conversations.reduce((sum: number, conv: any) => {
            return sum + (conv.unread_count || 0)
          }, 0)
          setUnreadCount(totalUnread)
        }
      } catch (error) {
        console.error('Error fetching unread count:', error)
      }
    }

    fetchUnreadCount()

    // Listen for custom event to refresh count immediately when messages are marked as read
    const handleMessagesRead = () => {
      fetchUnreadCount()
    }
    window.addEventListener('messagesMarkedAsRead', handleMessagesRead)

    // Poll for updates every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000)

    return () => {
      clearInterval(interval)
      window.removeEventListener('messagesMarkedAsRead', handleMessagesRead)
    }
  }, [user])

  // Fetch all projects user is a member of (for project selector popup)
  useEffect(() => {
    const fetchUserProjects = async () => {
      if (!user) {
        setUserProjects([])
        return
      }

      setUserProjectsLoading(true)
      try {
        // Fetch all projects
        const { data: allProjects } = await supabase
          .from('portfolios')
          .select('id, metadata')
          .eq('type', 'projects')
          .order('created_at', { ascending: false })

        if (!allProjects) {
          setUserProjects([])
          setUserProjectsLoading(false)
          return
        }

        // Filter projects where user is a manager or member
        const userProjectData = allProjects
          .filter((p: any) => {
            const metadata = p.metadata as any
            const managers = metadata?.managers || []
            const members = metadata?.members || []
            return p.user_id === user.id || // Creator
                   (Array.isArray(managers) && managers.includes(user.id)) ||
                   (Array.isArray(members) && members.includes(user.id))
          })
          .map((p: any) => {
            const metadata = p.metadata as any
            const basic = metadata?.basic || {}
            return {
              id: p.id,
              name: basic.name || 'Project',
              avatar: basic.avatar,
              emoji: basic.emoji,
            }
          })

        setUserProjects(userProjectData)
      } catch (error) {
        console.error('Failed to fetch user projects:', error)
        setUserProjects([])
      } finally {
        setUserProjectsLoading(false)
      }
    }

    fetchUserProjects()
  }, [user, supabase])

  return (
    <nav className="sticky bottom-0 md:sticky md:top-0 z-50 bg-gray-50">
      <div className="w-full px-0 md:px-4 lg:px-8">
        <div className="flex justify-between md:justify-between items-center h-16 px-2 md:px-0">
          {/* Mobile: All items spread from end to end, Desktop: Left side */}
          <div className="flex items-center md:flex-none">
            <IconButton 
              icon={Home}
              href="/main" 
              title="Home"
              aria-label="Home"
            />
          </div>

          {/* Mobile: All items spread from end to end, Desktop: Right side grouped */}
          {loading ? (
            <div className="h-8 w-8 bg-gray-200 animate-pulse rounded-full"></div>
          ) : user ? (
            <>
              <IconButton
                icon={Search}
                href="/search"
                title="Search"
                aria-label="Search"
                className="md:hidden"
              />
              <IconButton
                icon={Pen}
                onClick={() => setShowProjectSelector(true)}
                title="Create Note"
                aria-label="Create Note"
                className="md:hidden"
              />
              <IconButton
                icon={MessageCircle}
                href="/messages"
                title="Messages"
                aria-label="Messages"
                className="md:hidden"
                badge={
                  unreadCount > 0 ? (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full h-5 w-5 flex items-center justify-center min-w-[1.25rem]">
                      <UIText className="text-xs">{unreadCount > 99 ? '99+' : unreadCount}</UIText>
                  </span>
                  ) : undefined
                }
              />
              <div className="md:hidden">
                <UserAvatarClient userId={user.id} />
              </div>
              {/* Desktop: Grouped right side */}
              <div className="hidden md:flex items-center gap-4">
                <IconButton
                  icon={Search}
                  href="/search"
                  title="Search"
                  aria-label="Search"
                />
                <IconButton
                  icon={Pen}
                  onClick={() => setShowProjectSelector(true)}
                  title="Create Note"
                  aria-label="Create Note"
                />
                <IconButton
                  icon={MessageCircle}
                  href="/messages"
                  title="Messages"
                  aria-label="Messages"
                  badge={
                    unreadCount > 0 ? (
                      <span className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full h-5 w-5 flex items-center justify-center min-w-[1.25rem]">
                        <UIText className="text-xs">{unreadCount > 99 ? '99+' : unreadCount}</UIText>
                    </span>
                    ) : undefined
                  }
                />
                <UserAvatarClient userId={user.id} />
              </div>
            </>
          ) : (
            <>
              <IconButton
                icon={Search}
                href="/search"
                title="Search"
                aria-label="Search"
                className="md:hidden"
              />
              <Link
                href="/login"
                className="text-blue-600 hover:text-blue-500 px-3 py-2 rounded-md transition-colors md:hidden"
              >
                <UIText>Sign In</UIText>
              </Link>
              {/* Desktop: Grouped right side */}
              <div className="hidden md:flex items-center gap-4">
                <IconButton
                  icon={Search}
                  href="/search"
                  title="Search"
                  aria-label="Search"
                />
                <Link
                  href="/login"
                  className="text-blue-600 hover:text-blue-500 px-3 py-2 rounded-md transition-colors"
                >
                  <UIText>Sign In</UIText>
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Project Selector Popup */}
      {showProjectSelector && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowProjectSelector(false)}
        >
          <div 
            className="bg-white rounded-xl w-auto mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <Card variant="default" padding="sm">
              <div className="mb-6">
                <UIText>Choose a project to post note with</UIText>
              </div>
              
              {userProjectsLoading ? (
                <div className="py-8 text-center">
                  <UIText className="text-gray-500">Loading projects...</UIText>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-x-4 gap-y-8 mb-4">
                  {userProjects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/notes/create?portfolio=${project.id}`}
                      className="flex flex-col items-center gap-4 py-8 px-8 hover:opacity-80 transition-opacity"
                      onClick={() => setShowProjectSelector(false)}
                    >
                      <StickerAvatar
                        src={project.avatar}
                        alt={project.name}
                        type="projects"
                        size={96}
                        emoji={project.emoji}
                        name={project.name}
                      />
                      <UIText className="text-center max-w-[96px] truncate" title={project.name}>
                        {project.name}
                      </UIText>
                    </Link>
                  ))}
                  {/* Create Project Button - only for approved users */}
                  {isApproved && (
                    <Link
                      href="/portfolio/create/projects"
                      className="flex flex-col items-center gap-4 py-4 px-4 hover:opacity-80 transition-opacity"
                      onClick={() => setShowProjectSelector(false)}
                    >
                      <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center">
                        <svg
                          className="h-12 w-12 text-gray-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                      </div>
                      <UIText className="text-center max-w-[96px] truncate">Create Project</UIText>
                    </Link>
                  )}
                </div>
              )}
              
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  onClick={() => setShowProjectSelector(false)}
                >
                  <UIText>Cancel</UIText>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}
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

