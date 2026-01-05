'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Note } from '@/types/note'
import { NoteCard } from '@/components/notes/NoteCard'
import { FeedTabs, FeedType } from './FeedTabs'
import { Button, Content, UIText } from '@/components/ui'

interface FeedViewProps {
  currentUserId?: string
}

export function FeedView({ currentUserId }: FeedViewProps) {
  const [activeFeed, setActiveFeed] = useState<FeedType>('all')
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const observerTarget = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const loadedNoteIdsRef = useRef<Set<string>>(new Set())
  const loadNotesRef = useRef<((reset: boolean) => Promise<void>) | null>(null)

  const loadNotes = useCallback(
    async (reset: boolean = false) => {
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

        const response = await fetch(`/api/feed?${params.toString()}`)

        if (!response.ok) {
          throw new Error('Failed to fetch feed')
        }

        const data = await response.json()
        const newNotes: Note[] = data.notes || []
        const newHasMore = data.hasMore ?? false

        if (reset) {
          setNotes(newNotes)
        } else {
          // Filter out duplicates using functional update
          setNotes((prev) => {
            const existingIds = new Set(prev.map((n) => n.id))
            const uniqueNewNotes = newNotes.filter((n) => !existingIds.has(n.id))
            return [...prev, ...uniqueNewNotes]
          })
        }

        // Track loaded note IDs
        newNotes.forEach((note) => {
          loadedNoteIdsRef.current.add(note.id)
        })

        // Mark notes as seen
        if (newNotes.length > 0) {
          const noteIds = newNotes.map((n) => n.id)
          try {
            await fetch('/api/feed/seen', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ noteIds }),
            })
          } catch (err) {
            // Don't fail if marking as seen fails
            console.error('Failed to mark notes as seen:', err)
          }
        }

        setHasMore(newHasMore)
        offsetRef.current += newNotes.length
      } catch (err: any) {
        console.error('Error loading feed:', err)
        setError(err.message || 'Failed to load feed')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [activeFeed, activeCommunityId]
  )

  // Keep loadNotes ref up to date
  useEffect(() => {
    loadNotesRef.current = loadNotes
  }, [loadNotes])

  // Load initial notes when feed type changes
  useEffect(() => {
    loadNotes(true)
  }, [activeFeed, activeCommunityId, loadNotes])

  // Infinite scroll observer
  useEffect(() => {
    if (!hasMore || loadingMore || loading) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && loadNotesRef.current) {
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
  }, [hasMore, loadingMore, loading])

  const handleFeedChange = (feedType: FeedType, communityId?: string | null) => {
    setActiveFeed(feedType)
    setActiveCommunityId(communityId || null)
  }

  if (loading && notes.length === 0) {
    return (
      <>
        <FeedTabs
          activeFeed={activeFeed}
          activeCommunityId={activeCommunityId}
          onFeedChange={handleFeedChange}
        />
        <div className="text-center py-12">
          <UIText>Loading feed...</UIText>
        </div>
      </>
    )
  }

  return (
    <>
      <FeedTabs
        activeFeed={activeFeed}
        activeCommunityId={activeCommunityId}
        onFeedChange={handleFeedChange}
      />
      <div>
          {error ? (
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
          ) : notes.length === 0 ? (
            <div className="text-center py-12">
              <UIText>No posts yet.</UIText>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {notes.map((note) => (
                  <div key={note.id} id={`note-${note.id}`}>
                    <NoteCard
                      note={note}
                      currentUserId={currentUserId}
                    />
                  </div>
                ))}
              </div>

              {/* Infinite scroll trigger */}
              <div ref={observerTarget} className="h-10" />

              {/* Loading more indicator */}
              {loadingMore && (
                <div className="text-center py-8">
                  <UIText>Loading more posts...</UIText>
                </div>
              )}

              {/* No more posts indicator */}
              {!hasMore && notes.length > 0 && (
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

