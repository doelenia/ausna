'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Note } from '@/types/note'
import { NoteCard } from '@/components/notes/NoteCard'
import { OpenCallStack } from '@/components/notes/OpenCallStack'
import type { FeedType } from './FeedTabs'
import { Button, Title, Content, UIText } from '@/components/ui'
import { LazyLoad } from '@/components/ui/LazyLoad'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { useDataCache } from '@/lib/cache/useDataCache'
import Link from 'next/link'
import type { FeedItem } from '@/app/main/actions'
import { PortfolioCreatedCard } from '@/components/main/PortfolioCreatedCard'
import type { DailyMatchHighlightMeta } from '@/app/explore/actions'
import { getExploreActivityHighlights } from '@/app/explore/actions'
import { buildLoginHref } from '@/lib/auth/login-redirect'
import { Rss, Link2, Lock, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { StickerAvatar } from '@/components/portfolio/StickerAvatar'
import { getHumanProfileUrl, getSpaceUrl } from '@/lib/portfolio/routes'
import { renderFeedTopRowSpaceStatusOverlay } from '@/components/main/feedTopRowSpaceStatus'
import { fetchViewerEligibleSpaceFeedItems } from '@/lib/spaces/viewerFeedSpaces'

export type MemberFeedCountsPayload = {
  all: number
  resources: number
  collections: Record<string, number>
  countsCapped?: boolean
}

interface FeedViewProps {
  currentUserId?: string
  apiPath?: string
  openCallContext?: 'feed' | 'human' | 'space'
  openCallPortfolioId?: string
  showOpenCallStack?: boolean
  /** From e.g. /main?showOpenCalls=1 — opens the open-call carousel once data is ready */
  initialOpenCallsPopup?: boolean
  /** Increment to refetch the feed list (e.g. after creating a note inline). */
  refreshNonce?: number
  /** Appended to the feed fetch URL (e.g. space member-feed tab filters). */
  extraQueryParams?: Record<string, string>
  /** Called when the feed API returns `feedCounts` (member-feed offset 0). */
  onMemberFeedCounts?: (counts: MemberFeedCountsPayload | null) => void
}

/** Main feed top row: humans (friends) + spaces (joined/subscribed), ordered like portfolio feed rows. */
type MainFeedTopRowHuman = {
  id: string
  name: string
  avatar: string | null
  lastNoteCreatedAt: string | null
}

type MainFeedTopRowItem =
  | { kind: 'human'; human: MainFeedTopRowHuman; unread: number }
  | { kind: 'space'; portfolio: any; lastNoteCreatedAt: string | null; unread: number }

function mainFeedTopRowRecencyMs(item: MainFeedTopRowItem): number {
  if (item.kind === 'human') {
    const k = item.human.lastNoteCreatedAt
    const t = k ? new Date(k).getTime() : 0
    return Number.isNaN(t) ? 0 : t
  }
  const p = item.portfolio
  const k = item.lastNoteCreatedAt || p.created_at || null
  const t = k ? new Date(k).getTime() : 0
  return Number.isNaN(t) ? 0 : t
}

const MAIN_FEED_TOP_ROW_CACHE_TTL_MS = 90_000
let mainFeedTopRowCacheEntry: {
  userId: string
  savedAt: number
  items: MainFeedTopRowItem[]
} | null = null

const MAIN_FEED_TOP_ROW_INVALIDATE_EVENT = 'main-feed-top-row-invalidate'

/** Call after friend/space "last checked" updates so unread badges and ordering stay accurate. */
export function invalidateMainFeedTopRowCache() {
  mainFeedTopRowCacheEntry = null
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MAIN_FEED_TOP_ROW_INVALIDATE_EVENT))
  }
}

export function FeedView({
  currentUserId,
  apiPath = '/api/feed',
  openCallContext = 'feed',
  openCallPortfolioId,
  showOpenCallStack = true,
  initialOpenCallsPopup = false,
  refreshNonce = 0,
  extraQueryParams,
  onMemberFeedCounts,
}: FeedViewProps) {
  const { setCachedNote } = useDataCache()
  // Keep supabase client stable so effects don't re-run every render.
  const supabase = useMemo(() => createClient(), [])
  const [activeFeed, setActiveFeed] = useState<FeedType>('all')
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null)
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activityHighlights, setActivityHighlights] = useState<Record<string, DailyMatchHighlightMeta>>({})
  const [topRowLoading, setTopRowLoading] = useState(false)
  const [topRowItems, setTopRowItems] = useState<MainFeedTopRowItem[]>([])
  const [topRowCacheBust, setTopRowCacheBust] = useState(0)
  const observerTarget = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const loadedNoteIdsRef = useRef<Set<string>>(new Set())
  const loadNotesRef = useRef<((reset: boolean) => Promise<void>) | null>(null)
  const inFlightRef = useRef(false)
  /** Bumped on every reset fetch so overlapping requests (e.g. rapid tab changes) cannot apply stale results. */
  const loadEpochRef = useRef(0)
  const prevRefreshNonceRef = useRef<number | null>(null)

  const loadNotes = useCallback(
    async (reset: boolean = false) => {
      if (inFlightRef.current && !reset) {
        return
      }

      if (reset) {
        loadEpochRef.current += 1
      }
      const epoch = loadEpochRef.current

      inFlightRef.current = true

      if (reset) {
        setLoading(true)
        offsetRef.current = 0
        loadedNoteIdsRef.current.clear()
        setHasMore(true)
      } else {
        setLoadingMore(true)
      }

      try {
        setError(null)

        const params = new URLSearchParams({
          type: activeFeed,
          offset: offsetRef.current.toString(),
          limit: '10',
        })

        if (activeFeed === 'space' && activeSpaceId) {
          params.append('spaceId', activeSpaceId)
        }

        if (extraQueryParams) {
          for (const [k, v] of Object.entries(extraQueryParams)) {
            if (v !== undefined && v !== null && v !== '') {
              params.set(k, v)
            }
          }
        }

        const url = `${apiPath}?${params.toString()}`

        const response = await fetch(url)

        if (!response.ok) {
          throw new Error('Failed to fetch feed')
        }

        const data = await response.json()
        if (epoch !== loadEpochRef.current) {
          return
        }

        const newItems: FeedItem[] = data.items || []
        const newHasMore = data.hasMore ?? false

        if (reset && typeof onMemberFeedCounts === 'function' && 'feedCounts' in data) {
          const fc = data.feedCounts
          if (fc && typeof fc.all === 'number' && typeof fc.resources === 'number') {
            onMemberFeedCounts({
              all: fc.all,
              resources: fc.resources,
              collections: typeof fc.collections === 'object' && fc.collections ? fc.collections : {},
              countsCapped: fc.countsCapped === true,
            })
          } else {
            onMemberFeedCounts(null)
          }
        }

        if (reset) {
          setItems(newItems)
        } else {
          // Filter out duplicates using functional update
          setItems((prev) => {
            const existingKeys = new Set(
              prev.map((i) => (i.kind === 'note' ? `note:${i.note.id}` : `portfolio:${i.portfolio.id}`))
            )
            const uniqueNewItems = newItems.filter((i) => {
              const key = i.kind === 'note' ? `note:${i.note.id}` : `portfolio:${i.portfolio.id}`
              return !existingKeys.has(key)
            })
            return [...prev, ...uniqueNewItems]
          })
        }

        // Track loaded note IDs and cache notes
        newItems.forEach((item) => {
          if (item.kind !== 'note') return
          loadedNoteIdsRef.current.add(item.note.id)
          setCachedNote(item.note.id, item.note)
        })

        // Load dynamic activity highlights for any activity portfolios in this batch
        if (currentUserId) {
          const activityIds = newItems
            .filter((i): i is FeedItem & { kind: 'portfolio_created' } => i.kind === 'portfolio_created')
            .filter((i) => (i.portfolio as any)?.type !== 'human')
            .map((i) => i.portfolio.id)
          if (activityIds.length > 0) {
            try {
              const result = await getExploreActivityHighlights(currentUserId, activityIds)
              if (result.success && result.highlights) {
                setActivityHighlights((prev) => ({ ...prev, ...result.highlights }))
              }
            } catch (e) {
              console.error('Failed to load activity highlights for feed:', e)
            }
          }
        }

        // Mark notes as seen (only for logged-in users) — non-blocking so UI is not delayed.
        if (currentUserId) {
          const noteIds = newItems.filter((i) => i.kind === 'note').map((i: any) => i.note.id)
          if (noteIds.length > 0) {
            void fetch('/api/feed/seen', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ noteIds }),
            }).catch((err) => {
              console.error('Failed to mark notes as seen:', err)
            })
          }
        }

        setHasMore(newHasMore)
        offsetRef.current += newItems.length
      } catch (err: any) {
        if (epoch === loadEpochRef.current) {
          console.error('Error loading feed:', err)
          setError(err.message || 'Failed to load feed')
        }
      } finally {
        setLoadingMore(false)
        if (epoch === loadEpochRef.current) {
          setLoading(false)
          inFlightRef.current = false
        }
      }
    },
    [activeFeed, activeSpaceId, currentUserId, apiPath, extraQueryParams, onMemberFeedCounts]
  )

  // Keep loadNotes ref up to date
  useEffect(() => {
    loadNotesRef.current = loadNotes
  }, [loadNotes])

  // Load initial notes when feed type changes
  useEffect(() => {
    loadNotes(true)
  }, [activeFeed, activeSpaceId, loadNotes])

  useEffect(() => {
    if (refreshNonce <= 0) return
    if (prevRefreshNonceRef.current === refreshNonce) return
    prevRefreshNonceRef.current = refreshNonce
    loadNotes(true)
  }, [refreshNonce, loadNotes])

  // Infinite scroll observer (only for logged-in users)
  useEffect(() => {
    if (!currentUserId || !hasMore || loadingMore || loading) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries[0]?.isIntersecting ?? false

        if (isIntersecting && loadNotesRef.current) {
          if (inFlightRef.current) {
            return
          }
          loadNotesRef.current(false)
        }
      },
      {
        rootMargin: '100px', // Start loading 100px before reaching bottom
      }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [currentUserId, hasMore, loadingMore, loading])

  const isLoggedOut = !currentUserId
  const isMainFeed = apiPath === '/api/feed' && openCallContext === 'feed'
  const loginHref =
    typeof window === 'undefined'
      ? '/login'
      : buildLoginHref({
          returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        })

  useEffect(() => {
    const onInvalidate = () => setTopRowCacheBust((n) => n + 1)
    window.addEventListener(MAIN_FEED_TOP_ROW_INVALIDATE_EVENT, onInvalidate)
    return () => window.removeEventListener(MAIN_FEED_TOP_ROW_INVALIDATE_EVENT, onInvalidate)
  }, [])

  useEffect(() => {
    if (!currentUserId) return
    if (!isMainFeed) return

    let cancelled = false

    const run = async () => {
      const now = Date.now()
      const hit =
        mainFeedTopRowCacheEntry &&
        mainFeedTopRowCacheEntry.userId === currentUserId &&
        now - mainFeedTopRowCacheEntry.savedAt < MAIN_FEED_TOP_ROW_CACHE_TTL_MS
      if (hit && mainFeedTopRowCacheEntry) {
        if (!cancelled) {
          setTopRowItems(mainFeedTopRowCacheEntry.items)
          setTopRowLoading(false)
        }
        return
      }

      try {
        if (!cancelled) setTopRowLoading(true)
        const [{ data: friendsRows }, spaceFeedItems] = await Promise.all([
          supabase
            .from('friends')
            .select('user_id, friend_id, status')
            .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
            .eq('status', 'accepted'),
          fetchViewerEligibleSpaceFeedItems(supabase, currentUserId),
        ])

        const friendIds = Array.from(
          new Set(
            (friendsRows || [])
              .map((r: any) =>
                r.user_id === currentUserId ? String(r.friend_id) : String(r.user_id)
              )
              .filter(Boolean)
          )
        )
          .slice(0, 50)

        const [humanPreviews, lastNoteByUserId, unreadFriendsData] = await Promise.all([
          (async () => {
            if (friendIds.length === 0) return [] as Array<{ id: string; name: string; avatar: string | null }>
            const qs = new URLSearchParams({ ids: friendIds.join(',') })
            const res = await fetch(`/api/users/by-ids?${qs.toString()}`)
            const data = await res.json().catch(() => ({}))
            return (Array.isArray(data?.users) ? data.users : []) as Array<{
              id: string
              name: string
              avatar: string | null
            }>
          })(),
          (async () => {
            if (friendIds.length === 0) return {} as Record<string, string | null>
            const qs = new URLSearchParams({ user_ids: friendIds.join(',') })
            const res = await fetch(`/api/users/last-note-created-at?${qs.toString()}`)
            const data = await res.json().catch(() => ({}))
            return (data?.lastNoteByUserId || {}) as Record<string, string | null>
          })(),
          (async () => {
            if (friendIds.length === 0) return {}
            const unreadQs = new URLSearchParams({
              friend_ids: friendIds.join(','),
            })
            const unreadRes = await fetch(`/api/unread-counts?${unreadQs.toString()}`)
            return await unreadRes.json().catch(() => ({}))
          })(),
        ])

        const enrichedHumans = humanPreviews
          .map((u) => ({ ...u, lastNoteCreatedAt: lastNoteByUserId[u.id] ?? null }))
          .sort((a, b) => {
            const aKey = a.lastNoteCreatedAt
            const bKey = b.lastNoteCreatedAt
            const at = aKey ? new Date(aKey).getTime() : 0
            const bt = bKey ? new Date(bKey).getTime() : 0
            return bt - at
          })

        if (cancelled) return
        const unreadFriends = (unreadFriendsData?.friends as Record<string, number>) || {}

        // Same idea as portfolio feed rows: unread first (by latest note/create time), then the rest.
        const humanItems: MainFeedTopRowItem[] = enrichedHumans.map((u) => ({
          kind: 'human',
          unread: unreadFriends[u.id] || 0,
          human: {
            id: u.id,
            name: u.name,
            avatar: u.avatar,
            lastNoteCreatedAt: u.lastNoteCreatedAt,
          },
        }))
        const spaceItems: MainFeedTopRowItem[] = spaceFeedItems.map(
          ({ portfolio, lastNoteCreatedAt, unread }) => ({
            kind: 'space' as const,
            unread,
            lastNoteCreatedAt,
            portfolio: {
              ...portfolio,
              lastNoteCreatedAt,
            },
          })
        )
        const combined = [...humanItems, ...spaceItems]
        const withUnread = combined
          .filter((x) => x.unread > 0)
          .sort((a, b) => mainFeedTopRowRecencyMs(b) - mainFeedTopRowRecencyMs(a))
        const withoutUnread = combined
          .filter((x) => x.unread === 0)
          .sort((a, b) => mainFeedTopRowRecencyMs(b) - mainFeedTopRowRecencyMs(a))
        const nextTop = [...withUnread, ...withoutUnread]
        if (!cancelled) {
          setTopRowItems(nextTop)
          mainFeedTopRowCacheEntry = {
            userId: currentUserId,
            savedAt: Date.now(),
            items: nextTop,
          }
        }
      } catch {
        if (!cancelled) {
          setTopRowItems([])
        }
      } finally {
        if (!cancelled) setTopRowLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [currentUserId, isMainFeed, supabase, topRowCacheBust])

  return (
    <>
      <div className="md:px-10">
          {isMainFeed && currentUserId && topRowLoading && (
            <div className="mt-3 mb-1">
              <div className="mb-1 flex items-center justify-end gap-2 px-3 md:px-0">
                <Link
                  href="/spaces"
                  className="inline-flex items-center gap-1 text-gray-600 transition-colors hover:text-gray-800"
                >
                  <UIText as="span">View all</UIText>
                  <ChevronRight className="w-4 h-4" strokeWidth={1.5} aria-hidden />
                </Link>
              </div>
              <div className="flex items-start gap-2 overflow-x-auto px-3 py-1 md:px-0 scroll-smooth">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div
                    key={`top-row-skeleton:${idx}`}
                    className="flex w-[100px] flex-shrink-0 flex-col items-center"
                  >
                    <div className="flex w-full flex-col items-center gap-1.5 px-1 py-1.5">
                      <div className="h-20 w-20 shrink-0 rounded-full bg-gray-200 animate-pulse" />
                      <div className="h-3 w-12 rounded bg-gray-200 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {isMainFeed && currentUserId && topRowItems.length > 0 && (
            <div className="mt-3 mb-1">
              <div className="mb-1 flex items-center justify-end gap-2 px-3 md:px-0">
                <Link
                  href="/spaces"
                  className="inline-flex items-center gap-1 text-gray-600 transition-colors hover:text-gray-800"
                >
                  <UIText as="span">View all</UIText>
                  <ChevronRight className="w-4 h-4" strokeWidth={1.5} aria-hidden />
                </Link>
              </div>
              <div className="flex items-start gap-2 overflow-x-auto px-3 py-1 md:px-0 scroll-smooth">
                {topRowItems.map((item) => {
                  if (item.kind === 'human') {
                    const h = item.human
                    const unread = item.unread
                    return (
                      <div key={`human:${h.id}`} className="flex w-[100px] flex-shrink-0 flex-col items-center">
                        <Link
                          href={getHumanProfileUrl(h.id)}
                          className="flex w-full flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition-colors hover:bg-gray-100"
                        >
                          <div className="relative inline-flex shrink-0">
                            <StickerAvatar
                              src={h.avatar ?? undefined}
                              alt={h.name}
                              type="human"
                              size={80}
                              variant="mini"
                              name={h.name}
                            />
                            {unread > 0 && (
                              <div
                                className="absolute right-0 top-0 z-10 flex min-h-5 min-w-5 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-500 px-1 ring-2 ring-white"
                                aria-label={`${unread} unread`}
                              >
                                <UIText as="span" className="text-[11px] text-white leading-none">
                                  {unread > 99 ? '99+' : unread}
                                </UIText>
                              </div>
                            )}
                          </div>
                          <UIText
                            className="block w-full min-w-0 text-center leading-tight truncate"
                            title={h.name}
                          >
                            {h.name}
                          </UIText>
                        </Link>
                      </div>
                    )
                  }

                  const p = item.portfolio
                  const basic = (p.metadata as any)?.basic || {}
                  const name = (basic.name as string) || 'Space'
                  const avatar = basic.avatar as string | undefined
                  const emoji = basic.emoji as string | undefined
                  const unread = item.unread
                  const statusOverlay =
                    unread === 0 ? renderFeedTopRowSpaceStatusOverlay(p) : null
                  return (
                    <div key={`space:${p.id}`} className="flex w-[100px] flex-shrink-0 flex-col items-center">
                      <Link
                        href={getSpaceUrl(p.slug || p.id)}
                        className="flex w-full flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition-colors hover:bg-gray-100"
                      >
                        <div className="relative inline-flex shrink-0">
                          {(p.visibility || 'public') === 'private' && (
                            <Lock
                              className="absolute left-0 top-0 z-20 h-4 w-4 text-gray-600 drop-shadow-sm"
                              aria-label="Private"
                            />
                          )}
                          {(p.visibility || 'public') === 'unlisted' && (
                            <Link2
                              className="absolute left-0 top-0 z-20 h-4 w-4 text-gray-600 drop-shadow-sm"
                              aria-label="Unlisted"
                            />
                          )}
                          <StickerAvatar
                            src={avatar}
                            alt={name}
                            type="space"
                            size={80}
                            variant="mini"
                            emoji={emoji}
                            name={name}
                          />
                          {unread > 0 ? (
                            <div
                              className="absolute right-0 top-0 z-10 flex min-h-5 min-w-5 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-500 px-1 ring-2 ring-white"
                              aria-label={`${unread} unread`}
                            >
                              <UIText as="span" className="text-[11px] text-white leading-none">
                                {unread > 99 ? '99+' : unread}
                              </UIText>
                            </div>
                          ) : (
                            statusOverlay
                          )}
                        </div>
                        <UIText
                          className="block w-full min-w-0 text-center leading-tight truncate"
                          title={name}
                        >
                          {name}
                        </UIText>
                      </Link>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {showOpenCallStack && currentUserId && (
            <div className={isMainFeed ? 'mt-2' : ''}>
              <OpenCallStack
                context={openCallContext}
                portfolioId={openCallPortfolioId}
                currentUserId={currentUserId}
                autoOpenPopup={initialOpenCallsPopup}
              />
            </div>
          )}

          {isMainFeed && (
            <div className="mt-6 mb-4 flex items-center gap-2 px-3 md:px-0">
              <Rss className="w-5 h-5 text-gray-600" strokeWidth={1.5} aria-hidden />
              <UIText>All feeds</UIText>
            </div>
          )}
          {loading && items.length === 0 ? (
            <div className="text-center py-12">
              <UIText>Loading feed...</UIText>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <UIText className="text-red-500">{error}</UIText>
              <Button
                variant="primary"
                onClick={() => loadNotes(true)}
                className="mt-4"
              >
                <UIText>Retry</UIText>
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <UIText>No posts yet.</UIText>
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-200 md:divide-y-0 md:space-y-4">
                {items.map((item, index) => {
                  const key =
                    item.kind === 'note' ? `note-${item.note.id}` : `portfolio-${item.portfolio.id}`
                  return (
                    <div key={key} id={item.kind === 'note' ? `note-${item.note.id}` : undefined}>
                      <LazyLoad
                        rootMargin="200px"
                        fallback={
                          <div className="w-full">
                            <SkeletonCard showAvatar={true} showBanner={true} />
                          </div>
                        }
                        eager={index < 3}
                      >
                        {item.kind === 'note' ? (
                          <NoteCard
                            note={item.note}
                            currentUserId={currentUserId}
                            flatOnMobile={true}
                            showComments={true}
                            onLeftCollaboration={() => loadNotes(true)}
                          />
                        ) : (
                          <PortfolioCreatedCard
                            portfolio={item.portfolio}
                            creator={item.creator_profile}
                            flatOnMobile={true}
                            highlight={
                              (item.portfolio as any)?.type !== 'human'
                                ? activityHighlights[item.portfolio.id]
                                : undefined
                            }
                          />
                        )}
                      </LazyLoad>
                    </div>
                  )
                })}
              </div>

              {/* Login/Signup prompt for logged-out users */}
              {isLoggedOut && (
                <div className="mt-8">
                  <div className="text-center py-8">
                    <Title className="mb-2">Join Ausna</Title>
                    <Content className="mb-6">
                      Sign in or create an account to see more posts and connect with others.
                    </Content>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Link href={loginHref}>
                        <Button variant="primary">
                          <UIText>Log In</UIText>
                        </Button>
                      </Link>
                      <Link href="/signup">
                        <Button variant="secondary">
                          <UIText>Sign Up</UIText>
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {/* Infinite scroll trigger (only for logged-in users) */}
              {currentUserId && <div ref={observerTarget} className="h-10" />}

              {/* Loading more indicator */}
              {currentUserId && loadingMore && (
                <div className="text-center py-8">
                  <UIText>Loading more posts...</UIText>
                </div>
              )}

              {/* No more posts indicator */}
              {currentUserId && !hasMore && items.length > 0 && (
                <div className="text-center py-8">
                  <UIText>No more posts to load.</UIText>
                </div>
              )}
            </>
          )}
      </div>
    </>
  )
}

