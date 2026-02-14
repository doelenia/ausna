'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getSharedAuth, AUTH_SESSION_EXPIRED_EVENT } from '@/lib/auth/browser-auth'
import Link from 'next/link'
import { createHumanPortfolioHelpers } from '@/lib/portfolio/human-client'
import { HumanPortfolio } from '@/types/portfolio'
import { UIText, IconButton, UserAvatar, Button, Card, Title, Content } from '@/components/ui'
import { Home, MessageCircle, Pen, Search } from 'lucide-react'
import { StickerAvatar } from '@/components/portfolio/StickerAvatar'

export function TopNav() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState(false)
  const [safariCookieHint, setSafariCookieHint] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [showProjectSelector, setShowProjectSelector] = useState(false)
  const [userProjects, setUserProjects] = useState<Array<{ id: string; name: string; avatar?: string; emoji?: string }>>([])
  const [userProjectsLoading, setUserProjectsLoading] = useState(false)
  const [isApproved, setIsApproved] = useState<boolean | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    getSharedAuth()
      .then((auth) => {
        if (isMountedRef.current && auth?.user) {
          setUser(auth.user)
        }
      })
      .catch(() => {
        if (isMountedRef.current) {
          setUser(null)
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setLoading(false)
        }
      })

    const onSessionExpired = () => {
      if (isMountedRef.current) {
        setUser(null)
        setSessionExpiredMessage(true)
      }
    }
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired)

    const onSafariCookieBlocked = () => {
      if (isMountedRef.current) setSafariCookieHint(true)
    }
    window.addEventListener('safari-auth-cookies-blocked', onSafariCookieBlocked)

    const onRecovered = () => {
      if (!isMountedRef.current) return
      getSharedAuth().then((auth) => {
        if (isMountedRef.current && auth?.user) setUser(auth.user)
      })
    }
    window.addEventListener('supabase-session-recovered', onRecovered)

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      if (!isMountedRef.current) return
      if (event === 'SIGNED_OUT') {
        setUser(null)
      } else if (session?.user) {
        setUser(session.user)
      }
    })
    return () => {
      isMountedRef.current = false
      window.removeEventListener('supabase-session-recovered', onRecovered)
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired)
      window.removeEventListener('safari-auth-cookies-blocked', onSafariCookieBlocked)
      subscription.unsubscribe()
    }
  }, [])

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

  // Fetch unread message count from active conversations.
  // Delay first fetch briefly so session cookies are available on the server (avoids "Load failed" right after login).
  useEffect(() => {
    if (!user) {
      setUnreadCount(0)
      return
    }

    const fetchUnreadCount = async (retry = false): Promise<void> => {
      try {
        const response = await fetch('/api/messages?tab=active')
        if (response.ok) {
          const data = await response.json()
          const conversations = data.conversations || []
          const totalUnread = conversations.reduce((sum: number, conv: any) => {
            return sum + (conv.unread_count || 0)
          }, 0)
          if (isMountedRef.current) setUnreadCount(totalUnread)
        }
      } catch (error) {
        if (!retry && isMountedRef.current) {
          setTimeout(() => fetchUnreadCount(true), 1500)
        }
      }
    }

    const t = setTimeout(() => fetchUnreadCount(), 1200)

    const handleMessagesRead = () => {
      fetchUnreadCount()
    }
    window.addEventListener('messagesMarkedAsRead', handleMessagesRead)

    const interval = setInterval(() => fetchUnreadCount(), 30000)

    return () => {
      clearTimeout(t)
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
      {safariCookieHint && (
        <div className="w-full bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-between gap-2">
          <UIText className="text-blue-900">
            Sign-in may not work in Safari when tracking prevention is on. Try: Safari → Settings for this Website → turn off Prevent Cross-Site Tracking, or use another browser.
          </UIText>
          <button
            type="button"
            onClick={() => setSafariCookieHint(false)}
            className="text-blue-800 hover:text-blue-900 underline shrink-0"
            aria-label="Dismiss"
          >
            <UIText>Dismiss</UIText>
          </button>
        </div>
      )}
      {sessionExpiredMessage && (
        <div className="w-full bg-amber-100 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-2">
          <UIText className="text-amber-900">Session expired. Please sign in again.</UIText>
          <button
            type="button"
            onClick={() => setSessionExpiredMessage(false)}
            className="text-amber-800 hover:text-amber-900 underline"
            aria-label="Dismiss"
          >
            <UIText>Dismiss</UIText>
          </button>
        </div>
      )}
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

