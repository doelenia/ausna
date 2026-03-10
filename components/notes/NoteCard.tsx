'use client'

import Link from 'next/link'
import ReactDOM from 'react-dom'
import { Note, NoteReference, ImageReference, UrlReference, NoteSource, type NoteVisibility } from '@/types/note'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getSharedAuth } from '@/lib/auth/browser-auth'
import { Portfolio, isHumanPortfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { getUrlDisplayInfo, getFaviconUrl } from '@/lib/notes/url-helpers'
import { formatRelativeTime } from '@/lib/formatRelativeTime'
import type { ActivityLocationValue } from '@/lib/location'
import { formatActivityLocation } from '@/lib/formatActivityLocation'
import { Title, Subtitle, Content, UIText, UIButtonText, Card, UserAvatar, Button } from '@/components/ui'
import { SkeletonAvatar, SkeletonText, SkeletonBanner } from '@/components/ui/Skeleton'
import { StickerAvatar } from '@/components/portfolio/StickerAvatar'
import { NoteActions } from './NoteActions'
import { useRouter } from 'next/navigation'
import { useDataCache } from '@/lib/cache/useDataCache'
import { MessageCircle, Heart, Lock, Megaphone, Hand, Send, UsersRound } from 'lucide-react'
import type { OpenCallMetadata } from '@/types/note'
import { SendItemModal } from '@/components/messages/SendItemModal'
import { buildLoginHref } from '@/lib/auth/login-redirect'

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
  onLeftCollaboration?: () => void
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
  /** Called after collaborators are updated (e.g. remove) so parent can refetch */
  onCollaboratorsUpdated?: () => void
  /**
   * When true (open call stack preview), reuse exact same layout but hide:
   * - Text content and references
   * - Buttons (NoteActions) and interest pill below
   */
  isOpenCallPreview?: boolean
  /**
   * When true, override the default card border styling (e.g. for special emphasis).
   */
  openCallBorder?: boolean
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
  onLeftCollaboration,
  showComments = false,
  onCommentClick,
  onCollaboratorsUpdated,
  isOpenCallPreview = false,
  openCallBorder = false,
}: NoteCardProps) {
  const useOrangeBorder = openCallBorder
  const isBrowser = typeof window !== 'undefined'
  const renderPortal = (node: React.ReactNode) =>
    isBrowser ? ReactDOM.createPortal(node, document.body) : node
  const router = useRouter()
  const { getCachedPortfolioData, setCachedPortfolioData, getCachedPortfolio, setCachedPortfolio } = useDataCache()
  const [ownerPortfolio, setOwnerPortfolio] = useState<Portfolio | null>(null)
  const [collaboratorPortfolios, setCollaboratorPortfolios] = useState<Portfolio[]>([])
  const [assignedProjects, setAssignedProjects] = useState<Portfolio[]>([])
  const [loadingPortfolios, setLoadingPortfolios] = useState(true)
  const [showAuthorsModal, setShowAuthorsModal] = useState(false)
  const [showEditCollaboratorsModal, setShowEditCollaboratorsModal] = useState(false)
  const [editCollabSearchQuery, setEditCollabSearchQuery] = useState('')
  const [editCollabCandidates, setEditCollabCandidates] = useState<Array<{ id: string; username: string | null; name: string | null; avatar: string | null }>>([])
  const [editCollabCandidatesLoading, setEditCollabCandidatesLoading] = useState(false)
  const [removingCollaboratorId, setRemovingCollaboratorId] = useState<string | null>(null)
  const [sendingInviteToId, setSendingInviteToId] = useState<string | null>(null)
  const [sessionRecoveryTrigger, setSessionRecoveryTrigger] = useState(0)
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [touchStartY, setTouchStartY] = useState<number | null>(null)
  const [showSendModal, setShowSendModal] = useState(false)
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
  const [localVisibility, setLocalVisibility] = useState<NoteVisibility | null>(null)
  const openCallMeta = (note.type === 'open_call' ? (note.metadata as OpenCallMetadata | undefined) : undefined) ?? {}
  const [openCallInterested, setOpenCallInterested] = useState<string[]>(() =>
    Array.isArray(openCallMeta.interested) ? openCallMeta.interested : []
  )
  const [openCallInterestedLoading, setOpenCallInterestedLoading] = useState(false)
  const [openCallInterestedProfiles, setOpenCallInterestedProfiles] = useState<Record<string, { name: string; avatar?: string | null }>>({})
  const [showInterestPopup, setShowInterestPopup] = useState(false)
  const [showInterestMessage, setShowInterestMessage] = useState("I'm interested")
  const [showInterestedModal, setShowInterestedModal] = useState(false)

  const getCurrentReturnTo = () => {
    if (typeof window === 'undefined') return '/main'
    return `${window.location.pathname}${window.location.search}${window.location.hash}`
  }

  useEffect(() => {
    setLocalVisibility(null)
  }, [note.id])

  // Load interested list for open call
  useEffect(() => {
    if (note.type !== 'open_call') return
    fetch(`/api/notes/${note.id}/interested`)
      .then((res) => (res.ok ? res.json() : { interested: [] }))
      .then((data) => {
        if (Array.isArray(data.interested)) setOpenCallInterested(data.interested)
      })
      .catch(() => {})
  }, [note.id, note.type])

  // Load profiles for interested users (when author needs to display them)
  useEffect(() => {
    if (note.type !== 'open_call' || openCallInterested.length === 0) return
    const loadProfiles = async () => {
      const profiles: Record<string, { name: string; avatar?: string | null }> = {}
      for (const userId of openCallInterested) {
        const portfolio = (ownerPortfolio && ownerPortfolio.user_id === userId)
          ? ownerPortfolio
          : collaboratorPortfolios.find((p) => p.user_id === userId)
        if (portfolio) {
          const basic = getPortfolioBasic(portfolio)
          profiles[userId] = {
            name: currentUserId && userId === currentUserId ? 'You' : (basic?.name || `User ${userId.slice(0, 8)}`),
            avatar: basic?.avatar,
          }
        } else {
          try {
            const { data } = await createClient()
              .from('portfolios')
              .select('*')
              .eq('type', 'human')
              .eq('user_id', userId)
              .maybeSingle()
            if (data) {
              const basic = getPortfolioBasic(data as Portfolio)
              profiles[userId] = {
                name: currentUserId && userId === currentUserId ? 'You' : (basic?.name || `User ${userId.slice(0, 8)}`),
                avatar: basic?.avatar,
              }
            } else {
              profiles[userId] = { name: `User ${userId.slice(0, 8)}` }
            }
          } catch {
            profiles[userId] = { name: `User ${userId.slice(0, 8)}` }
          }
        }
      }
      setOpenCallInterestedProfiles(profiles)
    }
    loadProfiles()
  }, [note.type, note.id, openCallInterested, ownerPortfolio, collaboratorPortfolios, currentUserId])

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

        // Fetch collaborator human portfolios (for authors pill)
        const collaboratorIds = (note.collaborator_account_ids || []) as string[]
        if (collaboratorIds.length > 0) {
          const { data: collabPortfolios } = await supabase
            .from('portfolios')
            .select('*')
            .eq('type', 'human')
            .in('user_id', collaboratorIds)
          if (collabPortfolios && collabPortfolios.length > 0) {
            setCollaboratorPortfolios(collabPortfolios as Portfolio[])
          }
        } else {
          setCollaboratorPortfolios([])
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
  }, [note.assigned_portfolios, note.owner_account_id, note.collaborator_account_ids, portfolioId, note.id, sessionRecoveryTrigger])

  // When TopNav recovers session after timeout (e.g. Safari), retry loading user/project so they can show
  useEffect(() => {
    const onRecovered = () => setSessionRecoveryTrigger((t) => t + 1)
    window.addEventListener('supabase-session-recovered', onRecovered)
    return () => window.removeEventListener('supabase-session-recovered', onRecovered)
  }, [])

  // Fetch collaborator candidates when Edit collaborators modal is open (for Add flow)
  useEffect(() => {
    if (!showEditCollaboratorsModal) {
      setEditCollabCandidates([])
      return
    }
    const portfolioId = (note.assigned_portfolios && note.assigned_portfolios[0]) || ''
    const params = new URLSearchParams()
    if (portfolioId) params.set('portfolio_id', portfolioId)
    if (editCollabSearchQuery.trim()) params.set('q', editCollabSearchQuery.trim())
    setEditCollabCandidatesLoading(true)
    fetch(`/api/notes/collaborator-candidates?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((data) => setEditCollabCandidates(data.users || []))
      .catch(() => setEditCollabCandidates([]))
      .finally(() => setEditCollabCandidatesLoading(false))
  }, [showEditCollaboratorsModal, note.assigned_portfolios, editCollabSearchQuery])

  const isOpenCall = note.type === 'open_call'
  const noteLink = typeof window !== 'undefined' ? `${window.location.origin}/notes/${note.id}` : `/notes/${note.id}`

  // Lazy load comments when showComments=true and card is in viewport (skip for open call)
  useEffect(() => {
    if (isOpenCall || !showComments || commentsLoaded || isViewMode) return

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
  }, [isOpenCall, showComments, commentsLoaded, isViewMode, note.id])

  // Load like reactions (top 5) when note changes (skip for open call)
  useEffect(() => {
    if (isOpenCall) return
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
  }, [note.id, isOpenCall])

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
      router.push(buildLoginHref({ returnTo: getCurrentReturnTo() }))
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

  // Authors = owner + collaborators (for pill and popup)
  // Prefer server-enriched author_profiles when available (avoids client fetch delay for avatars)
  const collaboratorIds = (note.collaborator_account_ids || []) as string[]
  const authorIds = [note.owner_account_id, ...collaboratorIds]
  const authorProfiles: { id: string; name: string; avatar?: string | null }[] =
    note.author_profiles && note.author_profiles.length > 0
      ? note.author_profiles
      : authorIds.map((userId) => {
          if (userId === note.owner_account_id) {
            const name = currentUserId && userId === currentUserId ? 'You' : (ownerBasic?.name || `User ${userId.slice(0, 8)}`)
            return { id: userId, name, avatar: ownerBasic?.avatar }
          }
          const collabPortfolio = collaboratorPortfolios.find((p) => p.user_id === userId)
          const basic = collabPortfolio ? getPortfolioBasic(collabPortfolio) : null
          const name = currentUserId && userId === currentUserId ? 'You' : (basic?.name || `User ${userId.slice(0, 8)}`)
          return { id: userId, name, avatar: basic?.avatar }
        })
  const authorsLabel =
    authorProfiles.length === 0
      ? ''
      : authorProfiles.length === 1
        ? authorProfiles[0].name
        : authorProfiles.length === 2
          ? `${authorProfiles[0].name} and ${authorProfiles[1].name}`
          : `${authorProfiles[0].name}, ${authorProfiles[1].name}, and others`

  const ownerLocationText = (() => {
    if (!ownerPortfolio || !isHumanPortfolio(ownerPortfolio)) {
      return null
    }

    const metadata = ownerPortfolio.metadata as any
    const explicitLocation =
      typeof metadata?.location === 'string' && metadata.location.trim()
        ? metadata.location.trim()
        : null

    const properties = metadata?.properties as any | undefined
    const autoCityLocationEnabled = properties?.auto_city_location_enabled !== false
    const autoCityLocation: ActivityLocationValue | undefined =
      autoCityLocationEnabled && properties?.auto_city_location
        ? (properties.auto_city_location as ActivityLocationValue)
        : undefined

    if (explicitLocation) {
      return explicitLocation
    }

    if (autoCityLocation) {
      const formatted = formatActivityLocation(autoCityLocation)
      return formatted.line2 || formatted.line1
    }

    return null
  })()

  const isOwner = currentUserId ? note.owner_account_id === currentUserId : false
  const isCollaborator = !isOwner && !!currentUserId && collaboratorIds.includes(currentUserId)
  const effectiveVisibility = localVisibility ?? (note as any).visibility ?? 'public'
  const isPrivate = effectiveVisibility === 'private'
  const isMembersOnly = effectiveVisibility === 'members'
  const isFriendsOnly = effectiveVisibility === 'friends'

  const visibilityCornerIcon = !isViewMode ? (
    isPrivate ? (
      <Lock
        className="absolute right-3 top-3 w-4 h-4 text-gray-500 z-20 pointer-events-none"
        aria-label="Private"
      />
    ) : isMembersOnly || isFriendsOnly ? (
      <UsersRound
        className="absolute right-3 top-3 w-4 h-4 text-gray-500 z-20 pointer-events-none"
        aria-label={isMembersOnly ? 'Members only' : 'Friends only'}
      />
    ) : null
  ) : null

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

  // (Talk-to-author button replaced by Send modal in actions row)

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
        {visibilityCornerIcon}
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
        {visibilityCornerIcon}
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

  const openCallEndDate = openCallMeta.end_date ? new Date(openCallMeta.end_date) : null
  const openCallDaysLeft = openCallEndDate
    ? Math.ceil((openCallEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null
  const isUserInterested = currentUserId ? openCallInterested.includes(currentUserId) : false

  const viewedByList = Array.isArray(openCallMeta.viewed_by) ? openCallMeta.viewed_by : []
  const isOpenCallNew =
    note.type === 'open_call' && !!currentUserId && !viewedByList.includes(currentUserId)

  // (debug instrumentation removed)

  const openCallHeader = isOpenCall ? (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        <Megaphone
          className="w-5 h-5 text-orange-600 flex-shrink-0"
          strokeWidth={1.5}
          aria-hidden
        />
        <UIText as="span" className="flex items-center gap-2 text-orange-600">
          Open call
          {openCallDaysLeft !== null && openCallDaysLeft > 0 && (
            <>
              <span className="text-orange-600">·</span>
              <span className="text-orange-600">
                ends in {openCallDaysLeft === 1 ? '1 day' : `${openCallDaysLeft} days`}
              </span>
            </>
          )}
        </UIText>
      </div>
      {isOpenCallPreview && isOpenCallNew && (
        <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-orange-500">
          <UIText as="span" className="text-white">
            NEW
          </UIText>
        </div>
      )}
    </div>
  ) : undefined

  const openCallAuthorDisplayName = authorIds.length <= 1 ? ownerName : authorsLabel
  const interestedProfilesList = openCallInterested.map((userId) => ({
    id: userId,
    name: openCallInterestedProfiles[userId]?.name ?? `User ${userId.slice(0, 8)}`,
    avatar: openCallInterestedProfiles[userId]?.avatar,
  }))
  const interestedLabel =
    interestedProfilesList.length === 0
      ? ''
      : interestedProfilesList.length === 1
        ? `${interestedProfilesList[0].name} is interested`
        : interestedProfilesList.length === 2
          ? `${interestedProfilesList[0].name} and ${interestedProfilesList[1].name} are interested`
          : `${interestedProfilesList[0].name}, ${interestedProfilesList[1].name}, and ${interestedProfilesList.length - 2} others are interested`

  const openCallFooter = isOpenCall ? (
    <div className="flex flex-wrap items-center gap-3">
      {(isOwner || isCollaborator) ? (
        /* Authors see interested pill (same style as authors pill) */
        openCallInterested.length === 0 ? (
          <UIText className="text-gray-500">No one has shown interest yet</UIText>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setShowInterestedModal(true)
            }}
            className="inline-flex items-center gap-2 px-2 py-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0 min-w-0"
            aria-label="View interested"
          >
            <div className="flex -space-x-2 flex-shrink-0">
              {interestedProfilesList.slice(0, 5).map((p, index) => (
                <div key={p.id} className="relative" style={{ zIndex: interestedProfilesList.length - index }}>
                  <UserAvatar userId={p.id} name={p.name} avatar={p.avatar} size={32} showLink={false} />
                </div>
              ))}
            </div>
            <UIText as="span" className="text-gray-700 whitespace-nowrap">{interestedLabel}</UIText>
          </button>
        )
      ) : (
        /* Non-authors see "Show interest to [author]" button */
        <Button
          variant="primary"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!currentUserId) {
              router.push(buildLoginHref({ returnTo: getCurrentReturnTo() }))
              return
            }
            setShowInterestMessage("I'm interested")
            setShowInterestPopup(true)
          }}
          className="inline-flex items-center gap-2"
        >
          <Hand
            className={`w-5 h-5 ${isUserInterested ? 'text-orange-500' : ''}`}
            strokeWidth={1.5}
            fill={isUserInterested ? 'currentColor' : 'none'}
            aria-hidden
          />
          <UIText>
            {isUserInterested ? 'Interested' : `Show interest to ${openCallAuthorDisplayName}`}
          </UIText>
        </Button>
      )}
    </div>
  ) : undefined

  const useOpenCallLayout = isOpenCall && !isCollageView

  const cardContent = (
    <>
      {/* Open call layout: header, title, authors (inside card) - same in feed and note view */}
      {useOpenCallLayout ? (
        <div className="px-3 pt-3 text-left">
          <div className="mb-3">{openCallHeader}</div>
          {(note.metadata as { title?: string } | undefined)?.title && (
            <Subtitle as="h3" className="mb-2 text-left line-clamp-2">
              {(note.metadata as { title: string }).title}
            </Subtitle>
          )}
          {/* Authors below title */}
          <div className={`flex items-start justify-between ${isOpenCallPreview ? 'mb-1' : 'mb-2'}`}>
            <div className="flex items-center gap-3 flex-wrap">
              {loadingPortfolios ? (
                <div className="flex items-center gap-2">
                  <SkeletonAvatar size={32} />
                  <SkeletonText lines={1} width={100} lineHeight={16} />
                </div>
              ) : authorIds.length <= 1 ? (
                <Link
                  href={`/portfolio/human/${note.owner_account_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2 hover:opacity-80 transition-colors"
                >
                  <UserAvatar userId={note.owner_account_id} name={ownerName} avatar={ownerBasic?.avatar} size={32} showLink={false} />
                  <UIText as="span" className="hover:text-blue-600">{ownerName}</UIText>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAuthorsModal(true) }}
                  className="inline-flex items-center gap-2 px-2 py-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0 min-w-0"
                  aria-label="View authors"
                >
                  <div className="flex -space-x-2 flex-shrink-0">
                    {authorProfiles.slice(0, 5).map((author, index) => (
                      <div key={author.id} className="relative" style={{ zIndex: authorProfiles.length - index }}>
                        <UserAvatar userId={author.id} name={author.name} avatar={author.avatar} size={32} showLink={false} />
                      </div>
                    ))}
                  </div>
                  <UIText as="span" className="text-gray-700 whitespace-nowrap">{authorsLabel}</UIText>
                </button>
              )}
              {!isOpenCallPreview && (
                <UIButtonText as="span" className="text-gray-500">
                  {ownerLocationText ? `${ownerLocationText} · ${formatRelativeTime(note.created_at)}` : formatRelativeTime(note.created_at)}
                </UIButtonText>
              )}
              {isOpenCallPreview && (() => {
                const projectPortfolio = assignedProjects.find((p) => !isHumanPortfolio(p))
                if (!projectPortfolio) return null
                const basic = getPortfolioBasic(projectPortfolio)
                const meta = projectPortfolio.metadata as any
                return (
                  <Link
                    href={getPortfolioUrl(projectPortfolio.type, projectPortfolio.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-2 hover:opacity-80 transition-colors flex-shrink-0"
                  >
                    <StickerAvatar
                      src={basic.avatar}
                      alt={basic.name}
                      type={projectPortfolio.type}
                      size={34}
                      emoji={meta?.basic?.emoji}
                      name={basic.name}
                      variant="mini"
                      normalizeScale={1.0}
                    />
                    <UIText as="span" className="text-gray-600">{basic.name}</UIText>
                  </Link>
                )
              })()}
            </div>
            {!isOpenCallPreview && (isOwner || isCollaborator) && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {isPrivate && <Lock className="w-4 h-4 text-gray-500 flex-shrink-0" aria-label="Private" />}
                {(isMembersOnly || isFriendsOnly) && (
                  <UsersRound
                    className="w-4 h-4 text-gray-500 flex-shrink-0"
                    aria-label={isMembersOnly ? 'Members only' : 'Friends only'}
                  />
                )}
                <NoteActions
                  note={note}
                  portfolioId={portfolioId}
                  currentUserId={currentUserId}
                  isCollaborator={isCollaborator}
                  isOpenCall={isOpenCall}
                  onDelete={onDeleted}
                  onRemoveFromPortfolio={onRemovedFromPortfolio}
                  onLeftCollaboration={onLeftCollaboration}
                  onVisibilityChange={setLocalVisibility}
                  onOpenEditCollaborators={isOwner ? () => setShowEditCollaboratorsModal(true) : undefined}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
      /* Regular layout: Header - Owner and Date (hidden in collage view) */
      !isCollageView && (
        <div className="px-3 pt-3">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-3 flex-wrap">
              {loadingPortfolios ? (
                <div className="flex items-center gap-2">
                  <SkeletonAvatar size={32} />
                  <SkeletonText lines={1} width={100} lineHeight={16} />
                </div>
              ) : authorIds.length <= 1 ? (
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
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setShowAuthorsModal(true)
                  }}
                  className="inline-flex items-center gap-2 px-2 py-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0 min-w-0"
                  aria-label="View authors"
                >
                  <div className="flex -space-x-2 flex-shrink-0">
                    {authorProfiles.slice(0, 5).map((author, index) => (
                      <div
                        key={author.id}
                        className="relative"
                        style={{ zIndex: authorProfiles.length - index }}
                      >
                        <UserAvatar
                          userId={author.id}
                          name={author.name}
                          avatar={author.avatar}
                          size={32}
                          showLink={false}
                        />
                      </div>
                    ))}
                  </div>
                  <UIText as="span" className="text-gray-700 whitespace-nowrap">
                    {authorsLabel}
                  </UIText>
                </button>
              )}
              <UIButtonText as="span" className="text-gray-500">
                {ownerLocationText
                  ? `${ownerLocationText} · ${formatRelativeTime(note.created_at)}`
                  : formatRelativeTime(note.created_at)}
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
                {isPrivate && <Lock className="w-4 h-4 text-gray-500 flex-shrink-0" aria-label="Private" />}
                {(isMembersOnly || isFriendsOnly) && (
                  <UsersRound
                    className="w-4 h-4 text-gray-500 flex-shrink-0"
                    aria-label={isMembersOnly ? 'Members only' : 'Friends only'}
                  />
                )}
                {/* More Menu */}
                {(isOwner || isCollaborator) && (
                  <NoteActions
                    note={note}
                    portfolioId={portfolioId}
                    currentUserId={currentUserId}
                    isCollaborator={isCollaborator}
                    isOpenCall={isOpenCall}
                    onDelete={onDeleted}
                    onRemoveFromPortfolio={onRemovedFromPortfolio}
                    onLeftCollaboration={onLeftCollaboration}
                    onVisibilityChange={setLocalVisibility}
                    onOpenEditCollaborators={isOwner ? () => setShowEditCollaboratorsModal(true) : undefined}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Top media section (images + URL previews) with tighter padding - after user row */}
      {!isCollageView && !isOpenCallPreview && (
        <div className="px-1">
          {renderReferencesSection()}
        </div>
      )}

      {/* Main body with more generous padding */}
      <div className={`px-4 ${isOpenCallPreview ? 'pb-3' : 'pb-4'} ${
        hasMediaInDefaultView 
          ? 'pt-0' 
          : hasReferences 
            ? 'pt-4' 
            : 'pt-2'
      }`}>
        {/* Open call title from metadata - only when not using open call layout (title is in header) */}
        {isOpenCall && !useOpenCallLayout && (note.metadata as { title?: string } | undefined)?.title && (
          <Subtitle as="h3" className="mb-2">
            {(note.metadata as { title: string }).title}
          </Subtitle>
        )}

        {/* Text content - hidden in open call preview */}
        {!isOpenCallPreview && (
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
        )}

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

        {/* Project banner at the end of the main card (not in collage view, hidden in open call preview) */}
        {!isCollageView && !isOpenCallPreview && projectBanner}

        {/* Open call footer (Interested + Talk to author buttons) - hidden in preview */}
        {useOpenCallLayout && openCallFooter && !isOpenCallPreview && (
          <div className="mt-4">{openCallFooter}</div>
        )}

        {/* Reactions & comments row (icons + like pill) - hidden for open call */}
        {!isCollageView && !isOpenCall && (
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
                  href={
                    currentUserId
                      ? `/notes/${note.id}#comments`
                      : buildLoginHref({ returnTo: `/notes/${note.id}#comments` })
                  }
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  aria-label="Comment"
                  title="Comment"
                >
                  <MessageCircle className="w-5 h-5" strokeWidth={1.5} />
                </Link>
              )}
              {!isOpenCall && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!currentUserId) {
                      router.push(buildLoginHref({ returnTo: getCurrentReturnTo() }))
                      return
                    }
                    setShowSendModal(true)
                  }}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  aria-label="Send"
                  title="Send"
                >
                  <Send className="w-5 h-5" strokeWidth={1.5} />
                </button>
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
        {showComments && !isViewMode && !isCollageView && !isOpenCall && commentCount !== null && commentCount > 0 && (
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
      {showReactionsModal &&
        renderPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black bg-opacity-40"
            onClick={(e) => {
              e.stopPropagation()
              setShowReactionsModal(false)
            }}
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

      {/* Interested popup modal (open call authors - same style as authors) */}
      {showInterestedModal &&
        isOpenCall &&
        renderPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black bg-opacity-40"
            onClick={(e) => {
              e.stopPropagation()
              setShowInterestedModal(false)
            }}
          >
            <div
              className="bg-white rounded-xl shadow-lg w-full max-w-sm mx-4 max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 flex items-center justify-center">
                <UIText>Interested</UIText>
              </div>
              <div className="px-4 py-3 overflow-y-auto" style={{ maxHeight: '60vh' }}>
                {interestedProfilesList.map((p) => (
                  <Link
                    key={p.id}
                    href={`/portfolio/human/${p.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-3 py-2 hover:opacity-80 transition-opacity"
                  >
                    <UserAvatar userId={p.id} name={p.name} avatar={p.avatar} size={32} showLink={false} />
                    <UIText as="span">{p.name}</UIText>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

      {/* Authors popup modal (same style as reactions) */}
      {showAuthorsModal &&
        renderPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black bg-opacity-40"
            onClick={(e) => {
              e.stopPropagation()
              setShowAuthorsModal(false)
            }}
          >
            <div
              className="bg-white rounded-xl shadow-lg w-full max-w-sm mx-4 max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 flex items-center justify-center">
                <UIText>Authors</UIText>
              </div>
              <div className="px-4 py-3 overflow-y-auto" style={{ maxHeight: '60vh' }}>
                {authorProfiles.map((author) => (
                  <Link
                    key={author.id}
                    href={`/portfolio/human/${author.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-3 py-2 hover:opacity-80 transition-opacity"
                  >
                    <UserAvatar
                      userId={author.id}
                      name={author.name}
                      avatar={author.avatar}
                      size={32}
                      showLink={false}
                    />
                    <UIText as="span">{author.name}</UIText>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

      {/* Show interest popup (open call) */}
      {showInterestPopup &&
        isOpenCall &&
        renderPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black bg-opacity-40"
            onClick={(e) => {
              e.stopPropagation()
              setShowInterestPopup(false)
            }}
          >
            <div
              className="bg-white rounded-xl shadow-lg w-full max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-gray-100">
                <UIText className="block mb-2">
                  We will send {openCallAuthorDisplayName} your interest with the message below. This is only visible to
                  authors.
                </UIText>
                <textarea
                  value={showInterestMessage}
                  onChange={(e) => setShowInterestMessage(e.target.value)}
                  placeholder="I'm interested"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
              <div className="px-4 py-3 flex gap-2 justify-end">
                <Button
                  variant="secondary"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setShowInterestPopup(false)
                  }}
                >
                  <UIText>Cancel</UIText>
                </Button>
                <Button
                  variant="primary"
                  disabled={openCallInterestedLoading}
                  onClick={async (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!currentUserId || openCallInterestedLoading) return
                    setOpenCallInterestedLoading(true)
                    try {
                      const res = await fetch(`/api/notes/${note.id}/show-interest`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          message: showInterestMessage.trim() || "I'm interested",
                        }),
                      })
                      const data = res.ok ? await res.json() : null
                      if (data?.success && Array.isArray(data.interested)) {
                        setOpenCallInterested(data.interested)
                        setShowInterestPopup(false)
                      } else {
                        const err = data?.error || 'Failed to send'
                        alert(err)
                      }
                    } finally {
                      setOpenCallInterestedLoading(false)
                    }
                  }}
                >
                  <UIText>{openCallInterestedLoading ? 'Sending...' : 'Send'}</UIText>
                </Button>
              </div>
            </div>
          </div>
        )}

      {/* Edit collaborators popup modal (same style as reactions) */}
      {showEditCollaboratorsModal &&
        renderPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black bg-opacity-40"
            onClick={(e) => {
              e.stopPropagation()
              setShowEditCollaboratorsModal(false)
            }}
          >
            <div
              className="bg-white rounded-xl shadow-lg w-full max-w-sm mx-4 max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 flex items-center justify-center border-b border-gray-100">
                <UIText>Collaborators</UIText>
              </div>
              <div className="px-4 py-3 overflow-y-auto flex-1" style={{ maxHeight: '60vh' }}>
                {authorProfiles.map((author, index) => (
                  <div key={author.id} className="flex items-center justify-between gap-3 py-2">
                    <Link
                      href={`/portfolio/human/${author.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-3 hover:opacity-80 transition-opacity min-w-0"
                    >
                      <UserAvatar
                        userId={author.id}
                        name={author.name}
                        avatar={author.avatar}
                        size={32}
                        showLink={false}
                      />
                      <div className="min-w-0">
                        <UIText as="span" className="block truncate">
                          {author.name}
                        </UIText>
                        {index === 0 && (
                          <UIText as="span" className="text-xs text-gray-500">
                            Owner
                          </UIText>
                        )}
                      </div>
                    </Link>
                    {index > 0 && (
                      <button
                        type="button"
                        disabled={removingCollaboratorId === author.id}
                        onClick={async (e) => {
                          e.stopPropagation()
                          setRemovingCollaboratorId(author.id)
                          try {
                            const nextIds = authorIds.filter((id) => id !== author.id).slice(1)
                            const res = await fetch(`/api/notes/${note.id}/collaborators`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ collaborator_account_ids: nextIds }),
                            })
                            if (res.ok) {
                              onCollaboratorsUpdated?.()
                              setShowEditCollaboratorsModal(false)
                            }
                          } finally {
                            setRemovingCollaboratorId(null)
                          }
                        }}
                        className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        {removingCollaboratorId === author.id ? 'Removing...' : 'Remove'}
                      </button>
                    )}
                  </div>
                ))}
                <div className="border-t border-gray-100 pt-3 mt-2">
                  <UIText as="p" className="text-xs text-gray-500 mb-2">
                    Add collaborator (invite by message)
                  </UIText>
                  <input
                    type="text"
                    value={editCollabSearchQuery}
                    onChange={(e) => setEditCollabSearchQuery(e.target.value)}
                    placeholder="Search by username or name..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                  />
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {editCollabCandidatesLoading ? (
                      <UIText className="text-gray-500 text-sm">Loading...</UIText>
                    ) : (
                      editCollabCandidates
                        .filter((u) => !authorIds.includes(u.id))
                        .map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            disabled={sendingInviteToId === u.id}
                            onClick={async (e) => {
                              e.stopPropagation()
                              setSendingInviteToId(u.id)
                              try {
                                const res = await fetch(`/api/notes/${note.id}/collaborator-invites`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ invitee_id: u.id }),
                                })
                                const data = await res.json().catch(() => ({}))
                                if (res.ok && data.success) {
                                  setEditCollabSearchQuery('')
                                  setEditCollabCandidates((prev) => prev.filter((c) => c.id !== u.id))
                                }
                              } finally {
                                setSendingInviteToId(null)
                              }
                            }}
                            className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 text-left text-sm"
                          >
                            <UserAvatar
                              userId={u.id}
                              name={u.name || u.username || ''}
                              avatar={u.avatar}
                              size={28}
                              showLink={false}
                            />
                            <span className="flex-1 truncate">{u.name || u.username || u.id.slice(0, 8)}</span>
                            {sendingInviteToId === u.id ? (
                              <UIText className="text-gray-500 text-xs">Sending...</UIText>
                            ) : (
                              <UIText className="text-blue-600 text-xs">Invite</UIText>
                            )}
                          </button>
                        ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      {showSendModal &&
        !isOpenCall &&
        renderPortal(
          <SendItemModal
            isOpen={showSendModal}
            onClose={() => setShowSendModal(false)}
            currentUserId={currentUserId || null}
            authors={authorProfiles}
            itemLabel="note"
            copyLink={noteLink}
            sendPayload={{ noteId: note.id }}
          />
        )}
    </>
  )

  const handleCardClick = (e: React.MouseEvent) => {
    // Let inner links/buttons handle their own navigation
    const target = e.target as HTMLElement
    if (target.closest('a, button')) return
    router.push(`/notes/${note.id}`)
  }

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const target = e.target as HTMLElement
    if (target.closest('a, button')) return
    e.preventDefault()
    router.push(`/notes/${note.id}`)
  }

  const wrappedContent = isViewMode || isOpenCallPreview ? (
    cardContent
  ) : (
    <div
      role="link"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      className="block cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-lg"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {cardContent}
    </div>
  )

  // In view mode the lock is in the header (left of more button). Otherwise use absolute top-right (portfolio/feed).
  const privateLock = visibilityCornerIcon

  // Flat layout on mobile (no card), card layout on desktop
  if (flatOnMobile) {
    return (
      <div ref={cardRef} className="w-full">
        {/* Mobile: flat layout
            - Feed: white background only, rely on internal padding
            - Note view: no extra padding (use original inner padding), background provided by page
            - Popup: open call border when openCallBorder
        */}
        <div className={`md:hidden relative ${isViewMode ? '' : 'bg-white'} ${useOrangeBorder ? 'rounded-xl border-2 border-orange-500' : ''}`}>
          {wrappedContent}
          {privateLock}
        </div>

        {/* Desktop: keep subtle card. Render lock after content so it paints on top. */}
        <div className="hidden md:block relative">
          <Card
            variant="subtle"
            className={`relative overflow-hidden ${useOrangeBorder ? 'border-2 !border-orange-500' : ''}`}
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
    <div ref={cardRef} className="w-full">
      <Card
        variant="subtle"
        className={`relative overflow-hidden ${useOrangeBorder ? 'border-2 !border-orange-500' : ''}`}
        padding="none"
      >
        {wrappedContent}
        {privateLock}
      </Card>
    </div>
  )
}
