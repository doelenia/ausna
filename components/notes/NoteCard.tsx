'use client'

import Link from 'next/link'
import { Note, NoteReference, ImageReference, UrlReference, NoteSource } from '@/types/note'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getSharedAuth } from '@/lib/auth/browser-auth'
import { Portfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { getUrlDisplayInfo, getFaviconUrl } from '@/lib/notes/url-helpers'
import { formatRelativeTime } from '@/lib/formatRelativeTime'
import { Title, Subtitle, Content, UIText, UIButtonText, Card, UserAvatar, Button } from '@/components/ui'
import { SkeletonAvatar, SkeletonText, SkeletonBanner } from '@/components/ui/Skeleton'
import { StickerAvatar } from '@/components/portfolio/StickerAvatar'
import { NoteActions } from './NoteActions'
import { useRouter } from 'next/navigation'
import { useDataCache } from '@/lib/cache/useDataCache'
import { MessageCircle, Heart, Lock } from 'lucide-react'

interface NoteCardProps {
  note: Note & { feedSource?: NoteSource }
  portfolioId?: string
  currentUserId?: string
  isPreview?: boolean
  isPinned?: boolean
  viewMode?: 'default' | 'collage'
  isViewMode?: boolean
  /**
   * When true, the note uses a flat layout (no card) on mobile,
   * but keeps the card layout on desktop.
   *
   * Used for:
   * - Mobile feed (flat rows with separators)
   * - Mobile note view (white background with extra vertical padding)
   */
  flatOnMobile?: boolean
  onDeleted?: () => void
  onRemovedFromPortfolio?: () => void
  /**
   * When true, show at most 1 comment preview in feed view
   * Comments are loaded lazily when card is in viewport
   */
  showComments?: boolean
  /**
   * Optional callback for when the comment icon is clicked in view mode.
   * When not provided, the comment icon navigates to the note page (#comments).
   */
  onCommentClick?: () => void
}

export function NoteCard({
  note,
  portfolioId,
  currentUserId,
  isPreview = false,
  isPinned = false,
  viewMode = 'default',
  isViewMode = false,
  flatOnMobile = false,
  onDeleted,
  onRemovedFromPortfolio,
  showComments = false,
  onCommentClick,
}: NoteCardProps) {
  const router = useRouter()
  const { getCachedPortfolioData, setCachedPortfolioData, getCachedPortfolio, setCachedPortfolio } = useDataCache()
  const [ownerPortfolio, setOwnerPortfolio] = useState<Portfolio | null>(null)
  const [assignedProjects, setAssignedProjects] = useState<Portfolio[]>([])
  const [loadingPortfolios, setLoadingPortfolios] = useState(true)
  const [sessionRecoveryTrigger, setSessionRecoveryTrigger] = useState(0)
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [touchStartY, setTouchStartY] = useState<number | null>(null)
  const [isSendingToAuthor, setIsSendingToAuthor] = useState(false)
  const [isTextExpanded, setIsTextExpanded] = useState(false)
  const [isTextTruncated, setIsTextTruncated] = useState(false)
  const [wasTruncated, setWasTruncated] = useState(false)
  type ReactionListItem = { id: string; userId: string; createdAt: string }

  const [comments, setComments] = useState<Note[]>([])
  const [commentCount, setCommentCount] = useState<number | null>(null)
  const [newestCommentAuthorPortfolio, setNewestCommentAuthorPortfolio] = useState<Portfolio | null>(null)
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [likeLikers, setLikeLikers] = useState<string[]>([])
  const [hasLiked, setHasLiked] = useState<boolean>(false)
  const [likeLikerProfiles, setLikeLikerProfiles] = useState<Record<string, { name: string; avatar?: string | null }>>({})
  const [showReactionsModal, setShowReactionsModal] = useState(false)
  const [reactionItems, setReactionItems] = useState<ReactionListItem[]>([])
  const [reactionsTotalCount, setReactionsTotalCount] = useState<number | null>(null)
  const [reactionsLoading, setReactionsLoading] = useState(false)
  const [reactionsOffset, setReactionsOffset] = useState(0)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const carouselRef = useRef<HTMLDivElement | null>(null)
  const textRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [localVisibility, setLocalVisibility] = useState<'public' | 'private' | null>(null)

  useEffect(() => {
    setLocalVisibility(null)
  }, [note.id])

  useEffect(() => {
    const fetchPortfolios = async (retryCount = 0) => {
      const MAX_RETRIES = 2
      const RETRY_DELAY = 1000 // 1 second

      // Check cache first
      const cachedData = getCachedPortfolioData(note.id)
      if (cachedData) {
        setOwnerPortfolio(cachedData.ownerPortfolio)
        setAssignedProjects(cachedData.assignedProjects)
        setLoadingPortfolios(false)
        
        // Still fetch fresh data in background to update cache
        // (don't await, let it run in background)
        fetchPortfolios(0).catch(() => {
          // Silently fail background fetch
        })
        return
      }

      try {
        const supabase = createClient()
        
        // Use app-wide shared auth (single in-flight request) so we don't add more load in Safari
        let sessionReady = false
        const authTimeoutMs = 3000
        try {
          const authPromise = getSharedAuth()
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('auth timeout')), authTimeoutMs)
          )
          const auth = await Promise.race([authPromise, timeoutPromise])
          if (auth?.user) {
            sessionReady = true
          }
        } catch (_) {
          // Timeout or other error: proceed anyway; session-recovered event will trigger retry
        }
        
        // Fetch owner's human portfolio with error checking
        // Note: maybeSingle() returns null for both "not found" and "blocked by RLS"
        // We can't distinguish these cases client-side, but we can detect actual errors
        const { data: ownerPortfolios, error: ownerError } = await supabase
          .from('portfolios')
          .select('*')
          .eq('type', 'human')
          .eq('user_id', note.owner_account_id)
          .maybeSingle()

        if (ownerError) {
          // Real error occurred (network, auth, RLS blocking, etc.)
          console.error('[NoteCard] Error fetching owner portfolio:', {
            error: ownerError,
            errorCode: ownerError.code,
            errorMessage: ownerError.message,
            ownerAccountId: note.owner_account_id,
            noteId: note.id,
            retryCount,
            authReady: sessionReady,
          })
          
          // Retry on network errors, rate limits, RLS errors, or auth errors
          if (retryCount < MAX_RETRIES && (
            ownerError.code === 'PGRST116' || // Network/connection error
            ownerError.message?.includes('rate limit') ||
            ownerError.message?.includes('timeout') ||
            ownerError.code === '42501' || // Insufficient privilege (RLS)
            ownerError.code === 'PGRST301' || // JWT expired
            ownerError.message?.includes('JWT') || // Any JWT/auth related error
            ownerError.message?.includes('token')
          )) {
            // If it's an auth error, try refreshing the session before retry
            if (ownerError.code === 'PGRST301' || ownerError.message?.includes('JWT') || ownerError.message?.includes('token')) {
              console.log('[NoteCard] Auth error detected, refreshing session before retry')
              await supabase.auth.getUser() // This will refresh the token
              await new Promise(resolve => setTimeout(resolve, 500)) // Give it a moment
            }
            
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)))
            return fetchPortfolios(retryCount + 1)
          }
        } else if (ownerPortfolios) {
          // Portfolio found successfully
          const portfolio = ownerPortfolios as Portfolio
          setOwnerPortfolio(portfolio)
          // Cache the portfolio
          setCachedPortfolio(portfolio.id, portfolio)
        } else {
          // No error, but no data - portfolio doesn't exist (expected for some users)
          // This is normal and will use the fallback name
        }

        // Fetch assigned portfolios (any type currently used for notes, e.g. projects/activities)
        // First try from note's assigned_portfolios
        if (note.assigned_portfolios && note.assigned_portfolios.length > 0) {
          const { data: assignedPortfolios, error: projectError } = await supabase
            .from('portfolios')
            .select('*')
            .in('id', note.assigned_portfolios)

          if (projectError) {
            console.error('[NoteCard] Error fetching assigned projects:', {
              error: projectError,
              errorCode: projectError.code,
              assignedPortfolios: note.assigned_portfolios,
              noteId: note.id,
              authReady: sessionReady,
            })
            
            // Retry on auth errors
            if (retryCount < MAX_RETRIES && (
              projectError.code === 'PGRST301' || // JWT expired
              projectError.message?.includes('JWT') ||
              projectError.message?.includes('token')
            )) {
              await supabase.auth.getUser() // Refresh token
              await new Promise(resolve => setTimeout(resolve, 500))
            }
          } else if (assignedPortfolios && assignedPortfolios.length > 0) {
            const portfolios = assignedPortfolios as Portfolio[]
            setAssignedProjects(portfolios)
            // Cache each portfolio
            portfolios.forEach(p => {
              setCachedPortfolio(p.id, p)
            })
          } else {
            // Fallback: if portfolioId is provided, use it
            if (portfolioId) {
              const { data: portfolioData, error: fallbackError } = await supabase
                .from('portfolios')
                .select('*')
                .eq('id', portfolioId)
                .maybeSingle()
              
              if (fallbackError) {
                console.error('[NoteCard] Error fetching fallback portfolio:', {
                  error: fallbackError,
                  errorCode: fallbackError.code,
                  portfolioId,
                  noteId: note.id,
                })
              } else if (portfolioData) {
                const portfolio = portfolioData as Portfolio
                setAssignedProjects([portfolio])
                // Cache the portfolio
                setCachedPortfolio(portfolio.id, portfolio)
              }
            }
          }
        } else if (portfolioId) {
          // If note has no assigned_portfolios but portfolioId is provided, load that portfolio
          const { data: portfolioData, error: portfolioError } = await supabase
            .from('portfolios')
            .select('*')
            .eq('id', portfolioId)
            .maybeSingle()
          
          if (portfolioError) {
            console.error('[NoteCard] Error fetching portfolio by ID:', {
              error: portfolioError,
              errorCode: portfolioError.code,
              portfolioId,
              noteId: note.id,
            })
          } else if (portfolioData) {
            const portfolio = portfolioData as Portfolio
            setAssignedProjects([portfolio])
            // Cache the portfolio
            setCachedPortfolio(portfolio.id, portfolio)
          }
        }
      } catch (error) {
        console.error('[NoteCard] Unexpected error fetching portfolios:', {
          error,
          noteId: note.id,
          ownerAccountId: note.owner_account_id,
          retryCount,
        })
        
        // Retry on unexpected errors
        if (retryCount < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)))
          return fetchPortfolios(retryCount + 1)
        }
      } finally {
        setLoadingPortfolios(false)
      }
    }

    fetchPortfolios()
  }, [note.assigned_portfolios, note.owner_account_id, portfolioId, note.id, sessionRecoveryTrigger])

  // When TopNav recovers session after timeout (e.g. Safari), retry loading user/project so they can show
  useEffect(() => {
    const onRecovered = () => setSessionRecoveryTrigger((t) => t + 1)
    window.addEventListener('supabase-session-recovered', onRecovered)
    return () => window.removeEventListener('supabase-session-recovered', onRecovered)
  }, [])

  // Lazy load comments when showComments=true and card is in viewport
  useEffect(() => {
    if (!showComments || commentsLoaded || isViewMode) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !commentsLoaded) {
          setCommentsLoaded(true)
          loadComments()
        }
      },
      {
        rootMargin: '200px', // Start loading 200px before card is visible
      }
    )

    if (cardRef.current) {
      observer.observe(cardRef.current)
    }

    return () => {
      if (cardRef.current) {
        observer.unobserve(cardRef.current)
      }
    }
  }, [showComments, commentsLoaded, isViewMode, note.id])

  // Load like reactions (top 5) when note changes
  useEffect(() => {
    let cancelled = false
    const loadReactions = async () => {
      try {
        const response = await fetch(`/api/notes/${note.id}/reactions?type=like&limit=5`)
        if (!response.ok) return
        const data = await response.json()
        if (cancelled) return
        if (data.success) {
          setLikeLikers(Array.isArray(data.likers) ? data.likers : [])
          setHasLiked(!!data.hasReacted)
          if (typeof data.totalCount === 'number') {
            setReactionsTotalCount(data.totalCount)
          }
        }
      } catch (error) {
        console.error('Error loading reactions:', error)
      }
    }
    loadReactions()
    return () => {
      cancelled = true
    }
  }, [note.id])

  const loadMoreReactions = async () => {
    if (reactionsLoading) return
    const total = reactionsTotalCount ?? 0
    if (reactionItems.length >= total && total > 0) return

    try {
      setReactionsLoading(true)
      const response = await fetch(
        `/api/notes/${note.id}/reactions?type=like&view=list&limit=10&offset=${reactionsOffset}`
      )
      if (!response.ok) {
        return
      }
      const data = await response.json()
      if (!data.success) return

      const items: ReactionListItem[] = Array.isArray(data.reactions)
        ? data.reactions.map((r: any) => ({
            id: String(r.id),
            userId: String(r.userId),
            createdAt: String(r.createdAt),
          }))
        : []

      setReactionItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.id))
        const merged = [...prev]
        for (const item of items) {
          if (!existingIds.has(item.id)) {
            merged.push(item)
          }
        }
        return merged
      })

      if (typeof data.totalCount === 'number') {
        setReactionsTotalCount(data.totalCount)
      }
      setReactionsOffset((prev) => prev + items.length)
    } catch (error) {
      console.error('Error loading reactions list:', error)
    } finally {
      setReactionsLoading(false)
    }
  }

  // Load basic profile info (name, avatar) for likers so avatars render correctly
  useEffect(() => {
    const loadLikerProfiles = async () => {
      if (!likeLikers || likeLikers.length === 0) return

      // Determine which userIds we still need to fetch
      const missingIds = likeLikers.filter((userId) => !likeLikerProfiles[userId])
      if (missingIds.length === 0) return

      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('portfolios')
          .select('*')
          .eq('type', 'human')
          .in('user_id', missingIds)

        if (error) {
          console.error('[NoteCard] Error loading liker profiles:', error)
          return
        }

        const nextProfiles: Record<string, { name: string; avatar?: string | null }> = { ...likeLikerProfiles }
        for (const row of data || []) {
          const portfolio = row as Portfolio
          const basic = getPortfolioBasic(portfolio)
          const userId = portfolio.user_id
          if (!userId) continue
          nextProfiles[userId] = {
            name: basic.name || `User ${userId.slice(0, 8)}`,
            avatar: basic.avatar || undefined,
          }
        }

        // Ensure we at least have a fallback entry so we don't try to refetch repeatedly
        missingIds.forEach((userId) => {
          if (!nextProfiles[userId]) {
            nextProfiles[userId] = {
              name: `User ${userId.slice(0, 8)}`,
              avatar: undefined,
            }
          }
        })

        setLikeLikerProfiles(nextProfiles)
      } catch (error) {
        console.error('[NoteCard] Unexpected error loading liker profiles:', error)
      }
    }

    loadLikerProfiles()
    // We intentionally depend on likeLikers and likeLikerProfiles so we only fetch missing ones
  }, [likeLikers, likeLikerProfiles])

  const handleToggleLike = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!currentUserId) {
      router.push('/login')
      return
    }
    // Optimistic toggle in UI
    setHasLiked((prev) => !prev)
    setLikeLikers((prev) => {
      const alreadyLiked = prev.includes(currentUserId)
      if (alreadyLiked) {
        return prev.filter((id) => id !== currentUserId)
      }
      // Add current user to front
      return [currentUserId, ...prev.filter((id) => id !== currentUserId)]
    })

    // Immediately sync with server (no debounce) so likes persist reliably
    try {
      const response = await fetch(`/api/notes/${note.id}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'like' }),
      })
      if (!response.ok) {
        console.error('Failed to sync like reaction with server')
        return
      }
      const data = await response.json()
      if (data.success) {
        setLikeLikers(Array.isArray(data.likers) ? data.likers : [])
        setHasLiked(!!data.hasReacted)
      }
    } catch (error) {
      console.error('Error syncing like reaction:', error)
    }
  }

  const loadComments = async () => {
    setLoadingComments(true)
    setNewestCommentAuthorPortfolio(null)
    try {
      const response = await fetch(`/api/notes/${note.id}/annotations?offset=0&limit=1&order=desc`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setCommentCount(data.totalCount || 0)
          if (data.annotations && data.annotations.length > 0) {
            const annotation = data.annotations[0].annotation as Note
            setComments([annotation])
            const ownerId = annotation.owner_account_id
            const supabase = createClient()
            const { data: portfolio } = await supabase
              .from('portfolios')
              .select('*')
              .eq('type', 'human')
              .eq('user_id', ownerId)
              .maybeSingle()
            setNewestCommentAuthorPortfolio((portfolio as Portfolio) || null)
          }
        }
      }
    } catch (error) {
      console.error('Error loading comments:', error)
    } finally {
      setLoadingComments(false)
    }
  }

  const renderReference = (ref: NoteReference, index: number) => {
    if (ref.type === 'image') {
      const imageRef = ref as ImageReference
      return (
        <div 
          key={index} 
          className="rounded-lg overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={imageRef.url}
            alt={`Note image ${index + 1}`}
            className="w-full h-auto max-h-96 object-contain"
          />
        </div>
      )
    } else if (ref.type === 'url') {
      const urlRef = ref as UrlReference
      
      // Always get host name and icon (with fallbacks)
      const { hostName: displayHostName, hostIcon: displayHostIcon } = getUrlDisplayInfo(urlRef)
      
      return (
        <div 
          key={index} 
          className="border border-gray-200 rounded-lg p-4 bg-gray-50"
          onClick={(e) => e.stopPropagation()}
        >
          {urlRef.headerImage && (
            <img
              src={urlRef.headerImage}
              alt={urlRef.title || 'URL preview'}
              className="w-full h-48 object-cover rounded mb-3"
            />
          )}
          <div className="flex items-start gap-3">
            {/* Always show host icon */}
            <img
              src={displayHostIcon}
              alt={displayHostName}
              className="w-6 h-6 rounded flex-shrink-0"
              onError={(e) => {
                // Fallback to a default icon if image fails to load
                const target = e.target as HTMLImageElement
                target.src = `https://www.google.com/s2/favicons?domain=${displayHostName}&sz=64`
              }}
            />
            <div className="flex-1">
              {urlRef.title && (
                <Title as="h4" className="mb-1">{urlRef.title}</Title>
              )}
              {urlRef.description && (
                <Content as="p" className="mb-2">{urlRef.description}</Content>
              )}
              {/* Always show host name */}
              <a
                href={urlRef.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <UIText>{displayHostName}</UIText>
              </a>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  // Render references section (images as carousel, URLs as previews)
  const renderReferencesSection = () => {
    if (!references || references.length === 0 || isCollageView) return null

    const urlReferences = references.filter(ref => ref && ref.type === 'url') as UrlReference[]

    return (
      <div className="mb-4">
        {/* Image carousel */}
        {imageReferences.length > 0 && (
          <>
            <div
              ref={carouselRef}
              className="relative w-full rounded-lg overflow-hidden bg-gray-100"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* Sliding viewport with aspect-ratio box */}
              <div
                className="relative overflow-hidden w-full"
                style={{
                  width: '100%',
                  aspectRatio: getCarouselAspectRatio(),
                  minHeight: '100px',
                  maxHeight: '800px',
                }}
              >
                <div
                  className="flex h-full transition-transform duration-300 ease-out"
                  style={{
                    width: `${imageReferences.length * 100}%`,
                    transform: `translateX(-${currentImageIndex * (100 / imageReferences.length)}%)`,
                  }}
                >
                  {imageReferences.map((imgRef, index) => (
                    <div
                      key={index}
                      className="flex-shrink-0 h-full w-full flex items-center justify-center bg-gray-100"
                      style={{ width: `${100 / imageReferences.length}%` }}
                    >
                      <img
                        src={imgRef.url}
                        alt={`Note image ${index + 1}`}
                        className="max-w-full max-h-full w-auto object-contain block mx-auto"
                        onLoad={(e) => {
                          if (index === currentImageIndex) {
                            handleImageLoad(e)
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* Arrow buttons (desktop) */}
                {imageReferences.length > 1 && (
                  <>
                    <button
                      onClick={handlePreviousImage}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors hidden sm:flex items-center justify-center z-10"
                      aria-label="Previous image"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={handleNextImage}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors hidden sm:flex items-center justify-center z-10"
                      aria-label="Next image"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Dot indicators - below the gray container */}
            {imageReferences.length > 1 && (
              <div className="flex justify-center gap-1.5 py-2 mb-4">
                {imageReferences.map((_, index) => (
                  <button
                    key={index}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setCurrentImageIndex(index)
                    }}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      index === currentImageIndex ? 'bg-gray-600' : 'bg-gray-300'
                    }`}
                    aria-label={`Go to image ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* URL references */}
        {urlReferences.length > 0 && (
          <div className="space-y-3">
            {urlReferences.map((urlRef, index) => {
              const { hostName: displayHostName, hostIcon: displayHostIcon } = getUrlDisplayInfo(urlRef)
              
              return (
                <a
                  key={index}
                  href={urlRef.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block border border-gray-200 rounded-lg overflow-hidden bg-gray-50 hover:bg-gray-100 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {urlRef.headerImage && (
                    <img
                      src={urlRef.headerImage}
                      alt={urlRef.title || 'URL preview'}
                      className="w-full h-48 object-cover"
                    />
                  )}
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <img
                        src={displayHostIcon}
                        alt={displayHostName}
                        className="w-6 h-6 rounded flex-shrink-0"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.src = `https://www.google.com/s2/favicons?domain=${displayHostName}&sz=64`
                        }}
                      />
                      <div className="flex-1">
                        {urlRef.title && (
                          <Title as="h4" className="mb-1">{urlRef.title}</Title>
                        )}
                        {urlRef.description && (
                          <Content as="p" className="mb-2">{urlRef.description}</Content>
                        )}
                        <UIText className="text-blue-600">{displayHostName}</UIText>
                      </div>
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const ownerBasic = ownerPortfolio ? getPortfolioBasic(ownerPortfolio) : null
  const ownerName = (currentUserId && note.owner_account_id === currentUserId)
    ? 'You'
    : (ownerBasic?.name || `User ${note.owner_account_id.slice(0, 8)}`)

  const isOwner = currentUserId ? note.owner_account_id === currentUserId : false
  const effectiveVisibility = localVisibility ?? (note as any).visibility ?? 'public'
  const isPrivate = effectiveVisibility === 'private'

  const isCollageView = viewMode === 'collage'
  
  // Ensure references is an array
  // Handle case where references might be a JSON string or need parsing
  let references = note.references
  if (typeof references === 'string') {
    try {
      references = JSON.parse(references)
    } catch (e) {
      console.error('[NoteCard] Failed to parse references as JSON:', e)
      references = []
    }
  }
  references = Array.isArray(references) ? references : []
  
  // Check if note is text-only (no images, no URLs)
  // More robust check - handle cases where ref might be null or type might be missing
  const hasImages = references.some(ref => {
    if (!ref) return false
    // Check if it's an image reference by type or by having url without other url-specific fields
    return ref.type === 'image' || (ref.url && !ref.title && !ref.hostName)
  }) || false
  const hasUrls = references.some(ref => ref && ref.type === 'url') || false
  const isTextOnly = isCollageView && !hasImages && !hasUrls

  // Reset expansion state when note changes (separate effect)
  useEffect(() => {
    setIsTextExpanded(false)
    setWasTruncated(false)
  }, [note.id, note.text])

  // Check if text is truncated (only for feed/collage views, not in view mode)
  useEffect(() => {
    if (isViewMode || isTextOnly) {
      setIsTextTruncated(false)
      return
    }

    const checkTruncation = () => {
      const element = textRef.current
      if (!element) {
        // Retry after a short delay if element isn't ready
        setTimeout(checkTruncation, 100)
        return
      }

      // Only check if we're in collapsed state (has line-clamp)
      if (isTextExpanded) {
        setIsTextTruncated(false)
        return
      }

      // Check if line-clamp is actually applied
      const hasLineClamp = element.classList.contains('line-clamp-3')
      
      if (!hasLineClamp) {
        // If line-clamp isn't applied yet, wait a bit and retry
        setTimeout(checkTruncation, 100)
        return
      }

      // Create a temporary element without line-clamp to measure full height
      // Copy all computed styles to ensure accurate measurement
      const computedStyle = window.getComputedStyle(element)
      const tempDiv = document.createElement('div')
      
      // Copy all relevant styles
      tempDiv.style.position = 'absolute'
      tempDiv.style.visibility = 'hidden'
      tempDiv.style.width = element.offsetWidth + 'px'
      tempDiv.style.whiteSpace = computedStyle.whiteSpace
      tempDiv.style.fontSize = computedStyle.fontSize
      tempDiv.style.fontFamily = computedStyle.fontFamily
      tempDiv.style.lineHeight = computedStyle.lineHeight
      tempDiv.style.fontWeight = computedStyle.fontWeight
      tempDiv.style.fontStyle = computedStyle.fontStyle
      tempDiv.style.letterSpacing = computedStyle.letterSpacing
      tempDiv.style.wordSpacing = computedStyle.wordSpacing
      tempDiv.style.padding = computedStyle.padding
      tempDiv.style.margin = computedStyle.margin
      tempDiv.style.boxSizing = computedStyle.boxSizing
      tempDiv.style.maxHeight = 'none'
      tempDiv.style.overflow = 'visible'
      tempDiv.style.display = computedStyle.display
      
      // Use the same content structure
      const contentElement = element.querySelector('p')
      if (contentElement) {
        const contentStyle = window.getComputedStyle(contentElement)
        const p = document.createElement('p')
        p.style.margin = contentStyle.margin
        p.style.padding = contentStyle.padding
        p.textContent = note.text
        tempDiv.appendChild(p)
      } else {
        tempDiv.textContent = note.text
      }
      
      document.body.appendChild(tempDiv)
      const fullHeight = tempDiv.scrollHeight
      document.body.removeChild(tempDiv)
      
      // Get the actual rendered height with line-clamp
      const clampedHeight = element.scrollHeight
      
      // Calculate expected height for 3 lines more accurately
      const lineHeight = parseFloat(computedStyle.lineHeight)
      const fontSize = parseFloat(computedStyle.fontSize)
      const actualLineHeight = isNaN(lineHeight) ? fontSize * 1.5 : lineHeight
      const expectedMaxHeight = actualLineHeight * 3
      
      // Text is truncated only if:
      // 1. Full height is significantly larger than clamped height (with larger tolerance), AND
      // 2. Clamped height is at or near the expected 3-line height
      // This prevents false positives when text naturally fits in 3 lines
      const heightDifference = fullHeight - clampedHeight
      const isNearMaxHeight = clampedHeight >= expectedMaxHeight * 0.9 && clampedHeight <= expectedMaxHeight * 1.1
      
      // Only consider truncated if there's a meaningful difference (at least 20px) 
      // and the clamped height is near the 3-line limit
      const isTruncated = heightDifference > 20 && isNearMaxHeight
      
      setIsTextTruncated(isTruncated)
      // Remember if text was truncated (so we can show "less" button when expanded)
      if (isTruncated) {
        setWasTruncated(true)
      }
    }

    // Check after delays to ensure layout is complete (including images)
    const timeoutId1 = setTimeout(checkTruncation, 300)
    const timeoutId2 = setTimeout(checkTruncation, 800) // Check again after images might have loaded
    
    // Also check on window resize
    window.addEventListener('resize', checkTruncation)
    
    // Check when images in the note finish loading
    const images = document.querySelectorAll(`#note-${note.id} img`)
    const imageLoadPromises = Array.from(images).map((img) => {
      return new Promise<void>((resolve) => {
        const imgElement = img as HTMLImageElement
        if (imgElement.complete) {
          resolve()
        } else {
          imgElement.addEventListener('load', () => resolve(), { once: true })
          imgElement.addEventListener('error', () => resolve(), { once: true })
        }
      })
    })
    
    Promise.all(imageLoadPromises).then(() => {
      setTimeout(checkTruncation, 100)
    })
    
    return () => {
      clearTimeout(timeoutId1)
      clearTimeout(timeoutId2)
      window.removeEventListener('resize', checkTruncation)
    }
  }, [note.text, isViewMode, isTextOnly, note.id])
  
  // Get first image for image notes in collage view
  const firstImageRef = hasImages && references.length > 0
    ? references.find(ref => {
        if (!ref) return false
        return ref.type === 'image' || (ref.url && !ref.title && !ref.hostName)
      })
    : null
  
  // Normalize to ImageReference format
  const firstImage: ImageReference | null = firstImageRef && firstImageRef.url
    ? {
        type: 'image',
        url: firstImageRef.url,
      }
    : null
    
  const hasImageInCollage = isCollageView && hasImages && firstImage && firstImage.url
  
  // Get first URL reference for URL notes in collage view
  const firstUrlRef = hasUrls && references.length > 0
    ? references.find(ref => ref && ref.type === 'url') as UrlReference | undefined
    : undefined
    
  const hasUrlInCollage = isCollageView && hasUrls && firstUrlRef

  // Calculate aspect ratio for image notes in collage view
  // Constrain between 1:1 (square) and 1:2 (vertical)
  const getAspectRatio = () => {
    if (!imageAspectRatio) {
      return '1 / 1' // Default to square while loading
    }
    // Constrain between 1:1 (1.0) and 1:2 (0.5)
    // aspectRatio is width/height, so 1:1 = 1.0, 1:2 = 0.5
    const constrained = Math.max(0.5, Math.min(1.0, imageAspectRatio))
    return `${constrained} / 1`
  }

  // Calculate aspect ratio for the inline carousel in default view.
  // Allow wider images than 1:1, but still clamp to avoid extremes.
  const getCarouselAspectRatio = () => {
    if (!imageAspectRatio) {
      return '1 / 1'
    }
    // Allow from 1:2 (vertical) up to 2:1 (horizontal)
    const constrained = Math.max(0.5, Math.min(2.0, imageAspectRatio))
    return `${constrained} / 1`
  }

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (img.naturalWidth && img.naturalHeight) {
      const ratio = img.naturalWidth / img.naturalHeight
      setImageAspectRatio(ratio)
    }
  }

  // Image carousel handlers
  const imageReferences = references.filter(ref => {
    if (!ref) return false
    return ref.type === 'image' || (ref.url && !ref.title && !ref.hostName)
  }) as ImageReference[]

  const handlePreviousImage = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCurrentImageIndex(prev => (prev > 0 ? prev - 1 : imageReferences.length - 1))
  }

  const handleNextImage = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCurrentImageIndex(prev => (prev < imageReferences.length - 1 ? prev + 1 : 0))
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX)
    setTouchStartY(e.touches[0].clientY)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return
    
    const touchEndX = e.touches[0].clientX
    const touchEndY = e.touches[0].clientY
    const diffX = touchStartX - touchEndX
    const diffY = touchStartY - touchEndY
    
    // Only handle horizontal swipes (more horizontal than vertical)
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      if (diffX > 0) {
        // Swipe left - next image
        handleNextImage(e as any)
      } else {
        // Swipe right - previous image
        handlePreviousImage(e as any)
      }
      setTouchStartX(null)
      setTouchStartY(null)
    }
  }

  const handleTouchEnd = () => {
    setTouchStartX(null)
    setTouchStartY(null)
  }

  // Talk to author handler
  const handleTalkToAuthor = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!currentUserId || currentUserId === note.owner_account_id) return
    
    setIsSendingToAuthor(true)
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receiver_id: note.owner_account_id,
          text: '',
          note_id: note.id,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send note')
      }

      router.push(`/messages?userId=${note.owner_account_id}`)
    } catch (error) {
      console.error('Error sending note:', error)
      alert('Failed to send note')
    } finally {
      setIsSendingToAuthor(false)
    }
  }

  // For URL notes in collage view, render special layout
  if (hasUrlInCollage) {
    const { hostName: displayHostName, hostIcon: displayHostIcon } = getUrlDisplayInfo(firstUrlRef!)
    
    return (
      <div 
        className="bg-white border border-gray-200 rounded-xl relative overflow-hidden" 
        style={{ aspectRatio: '1 / 1', minHeight: '200px' }}
      >
        <Link 
          href={`/notes/${note.id}`} 
          className="block relative w-full h-full cursor-pointer"
          prefetch={true}
        >
          {/* Blurred and dimmed header image background */}
          {firstUrlRef!.headerImage && (
            <div className="absolute inset-0 z-0">
              <img
                src={firstUrlRef!.headerImage}
                alt=""
                className="w-full h-full object-cover"
                style={{
                  filter: 'blur(20px) brightness(0.4)',
                  transform: 'scale(1.1)', // Scale up to avoid blur edges
                }}
              />
            </div>
          )}
          
          {/* Content overlay */}
          <div className="relative z-10 h-full flex flex-col p-4">
            {/* Top: Favicon and host name */}
            <div className="flex items-center gap-2 mb-3">
              <img
                src={displayHostIcon}
                alt={displayHostName}
                className="w-5 h-5 rounded flex-shrink-0"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.src = `https://www.google.com/s2/favicons?domain=${displayHostName}&sz=64`
                }}
              />
              <UIText as="span" className="text-white">
                {displayHostName}
              </UIText>
            </div>
            
            {/* Title */}
            {firstUrlRef!.title && (
              <Subtitle as="h3" className="text-white">
                {firstUrlRef!.title}
              </Subtitle>
            )}
          </div>
          
          {/* Text label at bottom - positioned like image notes */}
          {note.text && (
            <div className="absolute bottom-0 left-0 right-0 p-2 z-10">
              <div className="bg-white rounded-md px-2 py-1.5 w-fit max-w-full">
                <UIText as="p" className="line-clamp-2 whitespace-pre-wrap">
                  {note.text}
                </UIText>
              </div>
            </div>
          )}
        </Link>
        {isOwner && isPrivate && (
          <Lock className="absolute right-3 top-3 w-4 h-4 text-gray-500 z-20 pointer-events-none" aria-label="Private" />
        )}
      </div>
    )
  }

  // For image notes in collage view, render special layout
  if (hasImageInCollage) {
    return (
      <div 
        className="bg-white border border-gray-200 rounded-xl relative overflow-hidden" 
        style={{ aspectRatio: getAspectRatio(), minHeight: '200px' }}
      >
        <Link 
          href={`/notes/${note.id}`} 
          className="block relative w-full h-full cursor-pointer"
          prefetch={true}
        >
          {/* Image fills the card */}
          <img
            ref={imageRef}
            src={firstImage!.url}
            alt={`Note image`}
            className="absolute inset-0 w-full h-full object-cover"
            onLoad={handleImageLoad}
          />
          {/* Text overlay at bottom */}
          {note.text && (
            <div className="absolute bottom-0 left-0 right-0 p-2 z-10">
              <div className="bg-white rounded-md px-2 py-1.5 w-fit max-w-full">
                <UIText as="p" className="line-clamp-2 whitespace-pre-wrap">
                  {note.text}
                </UIText>
              </div>
            </div>
          )}
        </Link>
        {isOwner && isPrivate && (
          <Lock className="absolute right-3 top-3 w-4 h-4 text-gray-500 z-20 pointer-events-none" aria-label="Private" />
        )}
      </div>
    )
  }

  // Portfolio Assignment Banner - rendered at the end of the main card content,
  // visually matching search result items (avatar + name/type + second line)
  const projectBanner = loadingPortfolios ? (
    <SkeletonBanner avatarSize={48} />
  ) : assignedProjects.length > 0 ? (() => {
    const portfolio = assignedProjects[0]
    const basic = getPortfolioBasic(portfolio)
    const metadata = portfolio.metadata as any
    const emoji = metadata?.basic?.emoji
    // Match search result logic: use project_type_specific when available
    const projectType: string | null = metadata?.project_type_specific || null
    const description: string | undefined = basic.description

    return (
      <Link
        href={getPortfolioUrl(portfolio.type, portfolio.id)}
        onClick={(e) => e.stopPropagation()}
        className="mt-3 flex items-start gap-3 p-3 rounded-lg bg-gray-100"
      >
        {/* Avatar (same size/feel as search results) */}
        <div className="flex-shrink-0">
          <StickerAvatar
            src={basic.avatar}
            alt={basic.name}
            type={portfolio.type}
            size={48}
            emoji={emoji}
            name={basic.name}
          />
        </div>

        {/* Text content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {/* First row: Name + Type label */}
          <div className="flex items-baseline gap-2 mb-0.5 min-w-0">
            <Content className="truncate min-w-0">
              {basic.name}
            </Content>
            {projectType && (
              <UIButtonText className="text-gray-500 flex-shrink-0">
                {projectType}
              </UIButtonText>
            )}
          </div>

          {/* Second row: Description (if any) */}
          {description && (
            <div className="min-w-0 overflow-hidden">
              <UIText className="text-gray-500 truncate block w-full">
                {description}
              </UIText>
            </div>
          )}
        </div>
      </Link>
    )
  })() : null

  const hasMediaInDefaultView = !isCollageView && (hasImages || hasUrls)
  const hasReferences = !isCollageView && references && references.length > 0

  const cardContent = (
    <>
      {/* Header - Owner and Date (hidden in collage view) - moved to top */}
      {!isCollageView && (
        <div className="px-3 pt-3">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-3 flex-wrap">
              {loadingPortfolios ? (
                <div className="flex items-center gap-2">
                  <SkeletonAvatar size={32} />
                  <SkeletonText lines={1} width={100} lineHeight={16} />
                </div>
              ) : (
                <Link
                  href={`/portfolio/human/${note.owner_account_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <UserAvatar
                    userId={note.owner_account_id}
                    name={ownerName}
                    avatar={ownerBasic?.avatar}
                    size={32}
                    showLink={false}
                  />
                  <UIText as="span" className="hover:text-blue-600">
                    {ownerName}
                  </UIText>
                </Link>
              )}
              <UIButtonText as="span" className="text-gray-500">
                {formatRelativeTime(note.created_at)}
              </UIButtonText>
              {/* Feed source label - only show in "all" feed */}
              {note.feedSource && (
                <UIText as="span" className="px-2 py-1 rounded-full bg-gray-100">
                  {note.feedSource.type === 'friend' && 'Friend'}
                  {note.feedSource.type === 'community' && `From ${note.feedSource.communityName}`}
                  {note.feedSource.type === 'subscribed' && 'Subscribed'}
                </UIText>
              )}
            </div>
            
            {/* View Mode Actions (and private lock to the left when in view mode) */}
            {isViewMode && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {isOwner && isPrivate && (
                  <Lock className="w-4 h-4 text-gray-500 flex-shrink-0" aria-label="Private" />
                )}
                {/* Talk to Author Button */}
                {currentUserId && currentUserId !== note.owner_account_id && (
                  <Button
                    variant="text"
                    size="sm"
                    onClick={handleTalkToAuthor}
                    disabled={isSendingToAuthor}
                    className="flex items-center gap-1.5"
                  >
                    <svg
                      className="w-4 h-4"
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
                    <UIText>{isSendingToAuthor ? 'Opening...' : 'Talk to Author'}</UIText>
                  </Button>
                )}
                
                {/* More Menu */}
                {isOwner && (
                  <NoteActions
                    note={note}
                    portfolioId={portfolioId}
                    currentUserId={currentUserId}
                    onDelete={onDeleted}
                    onRemoveFromPortfolio={onRemovedFromPortfolio}
                    onVisibilityChange={setLocalVisibility}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top media section (images + URL previews) with tighter padding - after user row */}
      {!isCollageView && (
        <div className="px-1">
          {renderReferencesSection()}
        </div>
      )}

      {/* Main body with more generous padding */}
      <div className={`px-4 pb-4 ${
        hasMediaInDefaultView 
          ? 'pt-0' 
          : hasReferences 
            ? 'pt-4' 
            : 'pt-2'
      }`}>
        {/* Text content */}
        <div 
          className={isTextOnly ? 'mb-2' : 'mb-4'}
          style={isTextOnly ? {
            display: '-webkit-box',
            WebkitLineClamp: 9,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          } : undefined}
        >
          <div
            ref={textRef}
            className={`whitespace-pre-wrap ${
              isViewMode 
                ? '' 
                : isTextOnly 
                  ? '' 
                  : !isTextExpanded 
                    ? 'line-clamp-3' 
                    : ''
            }`}
          >
            <Content as="p">
              {note.text}
            </Content>
          </div>
          {/* Show "more"/"less" button in feed/collage views when text is truncated or was truncated */}
          {!isViewMode && !isTextOnly && (isTextTruncated || (isTextExpanded && wasTruncated)) && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setIsTextExpanded(!isTextExpanded)
              }}
              className="mt-1 text-gray-600 hover:text-gray-900 text-sm font-normal"
              style={{ 
                cursor: 'pointer', 
                background: 'none', 
                border: 'none', 
                padding: 0,
                display: 'inline-block'
              }}
            >
              {isTextExpanded ? 'less' : 'more'}
            </button>
          )}
        </div>

        {/* References preview - show all references (excluding first image in collage view) - only for collage view */}
        {isCollageView && note.references && note.references.length > 0 && (
          <div className="mb-4 space-y-3">
            {note.references.map((ref, index) => {
              // Skip first image in collage view since it's already displayed
              if (ref.type === 'image' && index === 0 && hasImages) {
                return null
              }
              return renderReference(ref, index)
            })}
          </div>
        )}

        {/* Mentioned note indicator */}
        {note.mentioned_note_id && (
          <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded">
            <UIText as="p" className="text-blue-700">
              Annotation
            </UIText>
          </div>
        )}

        {/* Project banner at the end of the main card (not in collage view) */}
        {!isCollageView && projectBanner}

        {/* Reactions & comments row (icons + like pill) */}
        {!isCollageView && (
          <div className="mt-3 flex items-center justify-between gap-3">
            {/* Left: like + comment icons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleLike}
                className={`inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
                  hasLiked
                    ? 'text-red-600 bg-red-50 hover:bg-red-100'
                    : 'text-gray-600 hover:text-red-600 hover:bg-gray-100'
                }`}
                aria-label="Like"
                title="Like"
              >
                <Heart
                  className="w-5 h-5"
                  strokeWidth={1.5}
                  fill={hasLiked ? 'currentColor' : 'none'}
                />
              </button>
              {isViewMode ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (onCommentClick) {
                      onCommentClick()
                    } else {
                      if (typeof window !== 'undefined') {
                        const el = document.getElementById('comments')
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }
                      }
                    }
                  }}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  aria-label="Comment"
                  title="Comment"
                >
                  <MessageCircle className="w-5 h-5" strokeWidth={1.5} />
                </button>
              ) : (
                <Link
                  href={currentUserId ? `/notes/${note.id}#comments` : '/login'}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  aria-label="Comment"
                  title="Comment"
                >
                  <MessageCircle className="w-5 h-5" strokeWidth={1.5} />
                </Link>
              )}
            </div>

            {/* Right: like pill with stacked avatars (top 5 likers) - clickable to open reactions popup */}
            {likeLikers.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setShowReactionsModal(true)
                  if (reactionItems.length === 0) {
                    // Load initial page of reactions for popup
                    loadMoreReactions().catch(() => {})
                  }
                }}
                className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-gray-100 flex-shrink-0 min-w-0 hover:bg-gray-200 transition-colors"
                aria-label="View reactions"
              >
                <Heart className="w-4 h-4 text-red-600" strokeWidth={1.5} fill="currentColor" />
                <div className="flex -space-x-2 flex-shrink-0">
                  {likeLikers.slice(0, 5).map((userId, index) => (
                    <div
                      key={userId}
                      className="relative"
                      style={{ zIndex: likeLikers.length - index }}
                    >
                      {(() => {
                        const profile = likeLikerProfiles[userId]
                        const name = profile?.name ?? `User ${userId.slice(0, 8)}`
                        const avatar = profile?.avatar
                        return (
                          <UserAvatar
                            userId={userId}
                            name={name}
                            avatar={avatar}
                            size={24}
                            showLink={false}
                          />
                        )
                      })()}
                    </div>
                  ))}
                </div>
              </button>
            )}
          </div>
        )}

        {/* Comment preview (feed view only, when enabled) */}
        {showComments && !isViewMode && !isCollageView && commentCount !== null && commentCount > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {commentCount > 0 && (
              <>
                {comments.length > 0 && (() => {
                  const comment = comments[0]
                  const isCommentAuthorSelf = currentUserId && comment.owner_account_id === currentUserId
                  const commentAuthorPortfolioBasic = newestCommentAuthorPortfolio
                    ? getPortfolioBasic(newestCommentAuthorPortfolio)
                    : null
                  const commentAuthorName = isCommentAuthorSelf
                    ? 'You'
                    : (commentAuthorPortfolioBasic?.name ?? `User ${comment.owner_account_id.slice(0, 8)}`)
                  const commentAuthorAvatar = commentAuthorPortfolioBasic?.avatar
                  return (
                    <Link
                      href={`/notes/${note.id}#comments`}
                      onClick={(e) => e.stopPropagation()}
                      className="block p-2 -mx-2 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      {/* Avatar and name on same row so they align vertically */}
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          <UserAvatar
                            userId={comment.owner_account_id}
                            name={commentAuthorName}
                            avatar={commentAuthorAvatar}
                            size={32}
                            showLink={false}
                          />
                        </div>
                        <div className="flex items-baseline gap-2 min-w-0 flex-1">
                          <UIText as="span" className="font-medium">{commentAuthorName}</UIText>
                          <UIButtonText as="span" className="text-gray-500 text-xs">
                            {formatRelativeTime(comment.created_at)}
                          </UIButtonText>
                        </div>
                      </div>
                      {/* Comment text below, indented to align with name */}
                      <div className="mt-1 pl-11">
                        <Content as="p" className="text-sm text-gray-700 line-clamp-2 whitespace-pre-wrap">
                          {comment.text}
                        </Content>
                      </div>
                    </Link>
                  )
                })()}
                <Link
                  href={`/notes/${note.id}#comments`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline transition-colors inline-block"
                >
                  <UIText>View more</UIText>
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* Reactions popup modal */}
      {showReactionsModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black bg-opacity-40"
          onClick={() => setShowReactionsModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-lg w-full max-w-sm mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 flex items-center justify-center">
              <UIText>Reactions</UIText>
            </div>
            <div
              className="px-4 py-3 overflow-y-auto"
              style={{ maxHeight: '60vh' }}
              onScroll={(e) => {
                const target = e.currentTarget
                const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight
                if (
                  distanceToBottom < 64 &&
                  !reactionsLoading &&
                  reactionsTotalCount !== null &&
                  reactionItems.length < reactionsTotalCount
                ) {
                  loadMoreReactions().catch(() => {})
                }
              }}
            >
              {reactionItems.length === 0 && !reactionsLoading && (
                <UIText className="text-center text-gray-500">No reactions yet.</UIText>
              )}
              {reactionItems.map((item) => {
                const profile = likeLikerProfiles[item.userId]
                const name = profile?.name ?? `User ${item.userId.slice(0, 8)}`
                const avatar = profile?.avatar
                return (
                  <div key={item.id} className="flex items-center justify-between py-2 gap-3">
                    <Link
                      href={`/portfolio/human/${item.userId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                    >
                      <UserAvatar
                        userId={item.userId}
                        name={name}
                        avatar={avatar}
                        size={32}
                        showLink={false}
                      />
                      <UIText as="span">{name}</UIText>
                    </Link>
                    <div className="flex items-center justify-center">
                      <Heart className="w-4 h-4 text-red-600" strokeWidth={1.5} fill="currentColor" />
                    </div>
                  </div>
                )
              })}
              {reactionsLoading && (
                <div className="py-2">
                  <UIText className="text-center text-gray-500">Loading...</UIText>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )

  const wrappedContent = isViewMode ? (
    cardContent
  ) : (
    <Link 
      href={`/notes/${note.id}`} 
      className="block cursor-pointer"
      prefetch={true}
    >
      {cardContent}
    </Link>
  )

  // In view mode the lock is in the header (left of more button). Otherwise use absolute top-right (portfolio/feed).
  const privateLock = isOwner && isPrivate && !isViewMode ? (
    <Lock className="absolute right-3 top-3 w-4 h-4 text-gray-500 z-20 pointer-events-none" aria-label="Private" />
  ) : null

  // Flat layout on mobile (no card), card layout on desktop
  if (flatOnMobile) {
    return (
      <div ref={cardRef} className="w-full md:max-w-xl md:mx-auto">
        {/* Mobile: flat layout
            - Feed: white background only, rely on internal padding
            - Note view: no extra padding (use original inner padding), background provided by page
        */}
        <div className={`md:hidden relative ${isViewMode ? '' : 'bg-white'}`}>
          {wrappedContent}
          {privateLock}
        </div>

        {/* Desktop: keep subtle card. Render lock after content so it paints on top. */}
        <div className="hidden md:block relative">
          <Card
            variant="subtle"
            className="relative overflow-hidden"
            padding="none"
          >
            {wrappedContent}
            {privateLock}
          </Card>
        </div>
      </div>
    )
  }

  // Default behavior: card on all viewports. Render lock after content so it paints on top.
  return (
    <div ref={cardRef} className="w-full md:max-w-xl md:mx-auto">
      <Card
        variant="subtle"
        className="relative overflow-hidden"
        padding="none"
      >
        {wrappedContent}
        {privateLock}
      </Card>
    </div>
  )
}
