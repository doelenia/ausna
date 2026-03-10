'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
import { Rss } from 'lucide-react'

interface FeedViewProps {
  currentUserId?: string
  apiPath?: string
  openCallContext?: 'feed' | 'human' | 'portfolio'
  openCallPortfolioId?: string
  showOpenCallStack?: boolean
}

export function FeedView({
  currentUserId,
  apiPath = '/api/feed',
  openCallContext = 'feed',
  openCallPortfolioId,
  showOpenCallStack = true,
}: FeedViewProps) {
  const { setCachedNote } = useDataCache()
  const [activeFeed, setActiveFeed] = useState<FeedType>('all')
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null)
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activityHighlights, setActivityHighlights] = useState<Record<string, DailyMatchHighlightMeta>>({})
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

        if (activeFeed === 'community' && activeCommunityId) {
          params.append('communityId', activeCommunityId)
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
            .filter((i) => (i.portfolio as any)?.type === 'activities')
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
    [activeFeed, activeCommunityId, currentUserId, apiPath]
  )

  // Keep loadNotes ref up to date
  useEffect(() => {
    loadNotesRef.current = loadNotes
  }, [loadNotes])

  // Load initial notes when feed type changes
  useEffect(() => {
    loadNotes(true)
  }, [activeFeed, activeCommunityId, loadNotes])

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

  return (
    <>
      <div className="md:px-10">
          {showOpenCallStack && currentUserId && (
            <div className={isMainFeed ? 'mt-4' : ''}>
              <OpenCallStack
                context={openCallContext}
                portfolioId={openCallPortfolioId}
                currentUserId={currentUserId}
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
                              (item.portfolio as any)?.type === 'activities'
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

