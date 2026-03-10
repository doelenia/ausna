'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Title, Content, UIText } from '@/components/ui'
import { LazyLoad } from '@/components/ui/LazyLoad'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { NoteCard } from '@/components/notes/NoteCard'
import { PortfolioCreatedCard } from '@/components/main/PortfolioCreatedCard'
import type { FeedItem } from '@/app/main/actions'
import Link from 'next/link'
import { useDataCache } from '@/lib/cache/useDataCache'
import { buildLoginHref } from '@/lib/auth/login-redirect'

interface PortfolioMemberFeedViewProps {
  portfolioId: string
  currentUserId?: string
}

export function PortfolioMemberFeedView({
  portfolioId,
  currentUserId,
}: PortfolioMemberFeedViewProps) {
  const { setCachedNote } = useDataCache()
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const observerTarget = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const loadRef = useRef<((reset: boolean) => Promise<void>) | null>(null)
  const inFlightRef = useRef(false)

  const load = useCallback(
    async (reset: boolean = false) => {
      if (inFlightRef.current) return
      inFlightRef.current = true

      if (reset) {
        setLoading(true)
        offsetRef.current = 0
        setHasMore(true)
      } else {
        setLoadingMore(true)
      }

      try {
        setError(null)
        const params = new URLSearchParams({
          offset: offsetRef.current.toString(),
          limit: '10',
        })
        const url = `/api/portfolios/${portfolioId}/member-feed?${params.toString()}`
        const res = await fetch(url)
        if (!res.ok) throw new Error('Failed to fetch feed')
        const data = await res.json()
        const newItems: FeedItem[] = data.items || []

        if (reset) {
          setItems(newItems)
        } else {
          setItems((prev) => {
            const existingKeys = new Set(
              prev.map((i) =>
                i.kind === 'note' ? `note:${i.note.id}` : `portfolio:${i.portfolio.id}`
              )
            )
            const uniqueNew = newItems.filter((i) => {
              const key = i.kind === 'note' ? `note:${i.note.id}` : `portfolio:${i.portfolio.id}`
              return !existingKeys.has(key)
            })
            return [...prev, ...uniqueNew]
          })
        }

        newItems.forEach((item) => {
          if (item.kind !== 'note') return
          setCachedNote(item.note.id, item.note)
        })

        const newHasMore = data.hasMore ?? false
        setHasMore(newHasMore)
        offsetRef.current += newItems.length
      } catch (err: any) {
        console.error('Error loading portfolio feed:', err)
        setError(err.message || 'Failed to load feed')
      } finally {
        setLoading(false)
        setLoadingMore(false)
        inFlightRef.current = false
      }
    },
    [portfolioId, setCachedNote]
  )

  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    load(true)
  }, [load])

  useEffect(() => {
    if (!currentUserId || !hasMore || loadingMore || loading) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries[0]?.isIntersecting ?? false
        if (isIntersecting && loadRef.current && !inFlightRef.current) {
          loadRef.current(false)
        }
      },
      { rootMargin: '100px' }
    )

    const target = observerTarget.current
    if (target) observer.observe(target)

    return () => {
      if (target) observer.unobserve(target)
    }
  }, [currentUserId, hasMore, loadingMore, loading])

  if (loading && items.length === 0) {
    return (
      <div className="text-center py-12">
        <UIText>Loading feed...</UIText>
      </div>
    )
  }

  const isLoggedOut = !currentUserId
  const loginHref =
    typeof window === 'undefined'
      ? '/login'
      : buildLoginHref({
          returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        })

  return (
    <>
      {error ? (
        <div className="text-center py-12">
          <UIText className="text-red-500">{error}</UIText>
          <Button
            variant="primary"
            onClick={() => load(true)}
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
                item.kind === 'note'
                  ? `note-${item.note.id}`
                  : `portfolio-${item.portfolio.id}`
              return (
                <div
                  key={key}
                  id={item.kind === 'note' ? `note-${item.note.id}` : undefined}
                >
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
                        onLeftCollaboration={() => load(true)}
                      />
                    ) : (
                      <PortfolioCreatedCard
                        portfolio={item.portfolio}
                        creator={item.creator_profile}
                        flatOnMobile={true}
                      />
                    )}
                  </LazyLoad>
                </div>
              )
            })}
          </div>

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

          {currentUserId && <div ref={observerTarget} className="h-10" />}

          {currentUserId && loadingMore && (
            <div className="text-center py-8">
              <UIText>Loading more posts...</UIText>
            </div>
          )}

          {currentUserId && !hasMore && items.length > 0 && (
            <div className="text-center py-8">
              <UIText>No more posts to load.</UIText>
            </div>
          )}
        </>
      )}
    </>
  )
}

