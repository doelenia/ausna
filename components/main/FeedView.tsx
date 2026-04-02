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
import { Rss, Lock, Timer } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { DB_NON_HUMAN_TYPES, normalizePortfolioType } from '@/types/portfolio'
import { StickerAvatar } from '@/components/portfolio/StickerAvatar'
import { getHumanProfileUrl, getSpaceUrl } from '@/lib/portfolio/routes'
import { isActivityLive } from '@/lib/activityLive'
import type { ActivityDateTimeValue } from '@/lib/datetime'
import { formatDistanceToNowStrict } from 'date-fns'

interface FeedViewProps {
  currentUserId?: string
  apiPath?: string
  openCallContext?: 'feed' | 'human' | 'space'
  openCallPortfolioId?: string
  showOpenCallStack?: boolean
  /** From e.g. /main?showOpenCalls=1 — opens the open-call carousel once data is ready */
  initialOpenCallsPopup?: boolean
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

export function FeedView({
  currentUserId,
  apiPath = '/api/feed',
  openCallContext = 'feed',
  openCallPortfolioId,
  showOpenCallStack = true,
  initialOpenCallsPopup = false,
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
  const observerTarget = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const loadedNoteIdsRef = useRef<Set<string>>(new Set())
  const loadNotesRef = useRef<((reset: boolean) => Promise<void>) | null>(null)
  const inFlightRef = useRef(false)

  const loadNotes = useCallback(
    async (reset: boolean = false) => {
      if (inFlightRef.current) {
        return
      }

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

        const url = `${apiPath}?${params.toString()}`

        const response = await fetch(url)

        if (!response.ok) {
          throw new Error('Failed to fetch feed')
        }

        const data = await response.json()
        const newItems: FeedItem[] = data.items || []
        const newHasMore = data.hasMore ?? false

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

        // Mark notes as seen (only for logged-in users)
        if (currentUserId) {
          const noteIds = newItems.filter((i) => i.kind === 'note').map((i: any) => i.note.id)
          try {
            if (noteIds.length > 0) {
              await fetch('/api/feed/seen', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ noteIds }),
              })
            }
          } catch (err) {
            // Don't fail if marking as seen fails
            console.error('Failed to mark notes as seen:', err)
          }
        }

        setHasMore(newHasMore)
        offsetRef.current += newItems.length
      } catch (err: any) {
        console.error('Error loading feed:', err)
        setError(err.message || 'Failed to load feed')
      } finally {
        setLoading(false)
        setLoadingMore(false)
        inFlightRef.current = false
      }
    },
    [activeFeed, activeSpaceId, currentUserId, apiPath]
  )

  // Keep loadNotes ref up to date
  useEffect(() => {
    loadNotesRef.current = loadNotes
  }, [loadNotes])

  // Load initial notes when feed type changes
  useEffect(() => {
    loadNotes(true)
  }, [activeFeed, activeSpaceId, loadNotes])

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

  const getSpaceStatus = (p: any): string | null => {
    const status = (p?.metadata as any)?.status
    return typeof status === 'string' ? status : null
  }

  const getSpaceActivityDateTime = (p: any): ActivityDateTimeValue | null => {
    const props = (p?.metadata as any)?.properties || {}
    const dt = props.activity_datetime
    return dt && typeof dt === 'object' ? (dt as ActivityDateTimeValue) : null
  }

  const isSpaceLive = (p: any): boolean => {
    const status = getSpaceStatus(p)
    const dt = getSpaceActivityDateTime(p)
    if (dt?.start) return isActivityLive(dt, status)
    return status === 'live'
  }

  const isSpaceUpcoming = (p: any): boolean => {
    const status = getSpaceStatus(p)
    if (status === 'archived') return false
    const dt = getSpaceActivityDateTime(p)
    const start = dt?.start ? new Date(dt.start) : null
    if (!start || Number.isNaN(start.getTime())) return false
    return start.getTime() > Date.now()
  }

  const renderSpaceLiveOrUpcomingPill = (p: any): React.ReactNode => {
    const dt = getSpaceActivityDateTime(p)
    const status = getSpaceStatus(p)
    const hasActivity = !!dt?.start

    if (!hasActivity) {
      if (status === 'live') {
        return (
          <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <UIText as="span" className="text-[11px] text-black leading-none">
              LIVE
            </UIText>
          </div>
        )
      }
      return null
    }

    const live = isActivityLive(dt as ActivityDateTimeValue, status)
    if (live) {
      return (
        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <UIText as="span" className="text-[11px] text-black leading-none">
            LIVE
          </UIText>
        </div>
      )
    }

    const start = dt?.start ? new Date(dt.start) : null
    const validStart = start && !Number.isNaN(start.getTime()) ? start : null
    if (!validStart) return null
    if (status === 'archived') return null
    if (new Date() >= validStart) return null

    const label = formatDistanceToNowStrict(validStart, { addSuffix: true })
    return (
      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100">
        <Timer className="w-3 h-3 text-blue-600 flex-shrink-0" aria-hidden />
        <UIText as="span" className="text-[11px] leading-none text-blue-600">
          {label}
        </UIText>
      </div>
    )
  }

  const userIsInPortfolio = (userId: string, portfolioRow: any): boolean => {
    if (!userId) return false
    if (portfolioRow?.user_id === userId) return true
    const meta = (portfolioRow?.metadata as any) || {}
    const members: string[] = Array.isArray(meta?.members) ? meta.members : []
    const managers: string[] = Array.isArray(meta?.managers) ? meta.managers : []
    return members.includes(userId) || managers.includes(userId)
  }

  const isSpaceJoinable = (p: any): boolean => {
    if (!currentUserId) return false
    if ((p.visibility || 'public') === 'private') return false
    const status = getSpaceStatus(p)
    if (status === 'archived') return false
    if (p.user_id === currentUserId) return false
    const meta = (p.metadata as any) || {}
    const managersArr: string[] = Array.isArray(meta?.managers) ? meta.managers : []
    const membersArr: string[] = Array.isArray(meta?.members) ? meta.members : []
    if (managersArr.includes(currentUserId) || membersArr.includes(currentUserId)) return false
    // If the space has a start time in the future, it's still joinable (handled by join flow).
    return true
  }

  useEffect(() => {
    if (!currentUserId) return
    if (!isMainFeed) return

    // Backfill checkpoints once per session (idempotent server-side).
    try {
      const key = `last-checked-backfill:${currentUserId}`
      if (typeof window !== 'undefined' && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1')
        fetch('/api/last-checked/backfill', { method: 'POST' }).catch(() => {})
      }
    } catch {
      // ignore
    }

    let cancelled = false

    const run = async () => {
      try {
        if (!cancelled) setTopRowLoading(true)
        // Kick off the base queries in parallel.
        const [{ data: friendsRows }, { data: allSpacesRows }, { data: subscriptionsRows }] =
          await Promise.all([
            supabase
              .from('friends')
              .select('user_id, friend_id, status')
              .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
              .eq('status', 'accepted'),
            supabase
              .from('portfolios')
              .select('id, type, slug, user_id, visibility, created_at, metadata')
              .in('type', [...DB_NON_HUMAN_TYPES])
              .limit(2000),
            supabase.from('subscriptions').select('portfolio_id').eq('user_id', currentUserId),
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

        const joinedSpaces = (allSpacesRows || []).filter((p: any) => userIsInPortfolio(currentUserId, p))

        const subscribedIds = Array.from(
          new Set((subscriptionsRows || []).map((r: any) => String(r.portfolio_id)).filter(Boolean))
        )

        const { data: subscribedSpacesRows } =
          subscribedIds.length > 0
            ? await supabase
                .from('portfolios')
                .select('id, type, slug, user_id, visibility, created_at, metadata')
                .in('id', subscribedIds)
            : ({ data: [] as any[] } as any)

        const byId = new Map<string, any>()
        ;(joinedSpaces || []).forEach((p: any) => byId.set(String(p.id), { ...p, relation: 'joined' as const }))
        ;(subscribedSpacesRows || []).forEach((p: any) => {
          const id = String(p.id)
          const existing = byId.get(id)
          byId.set(id, { ...p, relation: existing ? 'joined' : ('subscribed' as const) })
        })
        const mergedSpaces = Array.from(byId.values())

        const eligibleSpaces = mergedSpaces.filter(
          (p: any) => normalizePortfolioType(p.type) === 'space' && (isSpaceLive(p) || isSpaceUpcoming(p))
        )

        const spaceIds = eligibleSpaces.map((p: any) => String(p.id))
        // Fetch derived data in parallel (independent HTTP requests).
        const [spacesLastNoteById, humanPreviews, lastNoteByUserId, unreadData] = await Promise.all([
          (async () => {
            if (spaceIds.length === 0) return {} as Record<string, string | null>
            const qs = new URLSearchParams({ portfolio_ids: spaceIds.join(',') })
            const res = await fetch(`/api/portfolios/last-note-created-at?${qs.toString()}`)
            const data = await res.json().catch(() => ({}))
            return (data?.lastNoteByPortfolioId || {}) as Record<string, string | null>
          })(),
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
            const unreadQs = new URLSearchParams({
              space_ids: spaceIds.join(','),
              friend_ids: friendIds.join(','),
            })
            const unreadRes = await fetch(`/api/unread-counts?${unreadQs.toString()}`)
            return await unreadRes.json().catch(() => ({}))
          })(),
        ])

        const sortedSpaces = [...eligibleSpaces].sort((a: any, b: any) => {
          const aKey = spacesLastNoteById[String(a.id)] || a.created_at || null
          const bKey = spacesLastNoteById[String(b.id)] || b.created_at || null
          const at = aKey ? new Date(aKey).getTime() : 0
          const bt = bKey ? new Date(bKey).getTime() : 0
          return bt - at
        })

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
        const unreadSpaces = (unreadData?.spaces as Record<string, number>) || {}
        const unreadFriends = (unreadData?.friends as Record<string, number>) || {}

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
        const spaceItems: MainFeedTopRowItem[] = sortedSpaces.map((p: any) => ({
          kind: 'space',
          unread: unreadSpaces[String(p.id)] || 0,
          lastNoteCreatedAt: spacesLastNoteById[String(p.id)] ?? null,
          portfolio: {
            ...p,
            lastNoteCreatedAt: spacesLastNoteById[String(p.id)] ?? null,
          },
        }))
        const combined = [...humanItems, ...spaceItems]
        const withUnread = combined
          .filter((x) => x.unread > 0)
          .sort((a, b) => mainFeedTopRowRecencyMs(b) - mainFeedTopRowRecencyMs(a))
        const withoutUnread = combined
          .filter((x) => x.unread === 0)
          .sort((a, b) => mainFeedTopRowRecencyMs(b) - mainFeedTopRowRecencyMs(a))
        setTopRowItems([...withUnread, ...withoutUnread])
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
  }, [currentUserId, isMainFeed, supabase])

  return (
    <>
      <div className="md:px-10">
          {isMainFeed && currentUserId && topRowLoading && (
            <div className="mt-4 mb-2">
              <div className="flex items-start gap-4 overflow-x-auto pt-2 pb-2 px-3 md:px-0 scroll-smooth">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div
                    key={`top-row-skeleton:${idx}`}
                    className="flex flex-col items-center flex-shrink-0 w-48"
                  >
                    <div className="w-full rounded-2xl px-3 pt-3 pb-4">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-24 h-24 rounded-full bg-gray-200 animate-pulse" />
                        <div className="w-32 h-4 rounded bg-gray-200 animate-pulse" />
                        <div className="w-20 h-4 rounded bg-gray-200 animate-pulse" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {isMainFeed && currentUserId && topRowItems.length > 0 && (
            <div className="mt-4 mb-2">
              <div className="flex items-start gap-4 overflow-x-auto pt-2 pb-2 px-3 md:px-0 scroll-smooth">
                {topRowItems.map((item) => {
                  if (item.kind === 'human') {
                    const h = item.human
                    const unread = item.unread
                    return (
                      <div key={`human:${h.id}`} className="flex flex-col items-center flex-shrink-0 w-48 relative">
                        {unread > 0 && (
                          <div className="absolute top-2 right-3 z-10 inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-red-500">
                            <UIText as="span" className="text-[11px] text-white leading-none">
                              {unread}
                            </UIText>
                          </div>
                        )}
                        <Link
                          href={getHumanProfileUrl(h.id)}
                          className="w-full rounded-2xl px-3 pt-3 pb-4 transition-colors hover:bg-gray-100 block"
                          onClick={() => {
                            fetch('/api/last-checked', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ target_type: 'friend', target_id: h.id }),
                            }).catch(() => {})
                          }}
                        >
                          <div className="flex flex-col items-center gap-3">
                            <StickerAvatar
                              src={h.avatar ?? undefined}
                              alt={h.name}
                              type="human"
                              size={96}
                              name={h.name}
                            />
                            <div className="flex flex-col items-center gap-1 w-full">
                              <Content className="text-center max-w-[140px] mx-auto line-clamp-2" title={h.name}>
                                {h.name}
                              </Content>
                              {unread > 0 && (
                                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100">
                                  <UIText as="span" className="text-[11px] text-black leading-none">
                                    New posts
                                  </UIText>
                                </div>
                              )}
                            </div>
                          </div>
                        </Link>
                      </div>
                    )
                  }

                  const p = item.portfolio
                  const basic = (p.metadata as any)?.basic || {}
                  const name = (basic.name as string) || 'Space'
                  const avatar = basic.avatar as string | undefined
                  const emoji = basic.emoji as string | undefined
                  const pill = renderSpaceLiveOrUpcomingPill(p)
                  const unread = item.unread
                  const joinable = isSpaceJoinable(p)
                  return (
                    <div key={`space:${p.id}`} className="flex flex-col items-center flex-shrink-0 w-48 relative">
                      <div className="absolute top-2 right-3 z-10 flex flex-col items-end gap-1">
                        {(p.visibility || 'public') === 'private' && (
                          <Lock className="w-4 h-4 text-gray-500" aria-label="Private" />
                        )}
                        {unread > 0 ? (
                          <div className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-red-500">
                            <UIText as="span" className="text-[11px] text-white leading-none">
                              {unread}
                            </UIText>
                          </div>
                        ) : joinable ? (
                          <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100">
                            <UIText as="span" className="text-[11px] text-orange-700 leading-none">
                              Joinable
                            </UIText>
                          </div>
                        ) : null}
                      </div>

                      <Link
                        href={getSpaceUrl(p.slug || p.id)}
                        className="w-full rounded-2xl px-3 pt-3 pb-4 transition-colors hover:bg-gray-100 block"
                        onClick={() => {
                          fetch('/api/last-checked', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              target_type: p.relation === 'subscribed' ? 'subscribed_space' : 'joined_space',
                              target_id: String(p.id),
                            }),
                          }).catch(() => {})
                        }}
                      >
                        <div className="flex flex-col items-center gap-3">
                          <StickerAvatar
                            src={avatar}
                            alt={name}
                            type="space"
                            size={96}
                            emoji={emoji}
                            name={name}
                          />
                          <div className="flex flex-col items-center gap-1 w-full">
                            <Content className="text-center max-w-[140px] mx-auto line-clamp-2" title={name}>
                              {name}
                            </Content>
                            {pill}
                          </div>
                        </div>
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

