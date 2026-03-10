'use client'

import { useState, useEffect, useCallback } from 'react'
import { Note } from '@/types/note'
import { OpenCallPreviewCard } from './OpenCallPreviewCard'
import { OpenCallCarouselPopup } from './OpenCallCarouselPopup'
import { SkeletonCard } from '@/components/ui/Skeleton'

type OpenCallsContext = 'feed' | 'human' | 'portfolio'

interface OpenCallStackProps {
  context: OpenCallsContext
  portfolioId?: string
  currentUserId?: string
}

function sortOpenCallsForUser(
  calls: (Note & { first_project_name?: string })[],
  currentUserId?: string
) {
  if (!currentUserId) {
    return [...calls].sort((a, b) => {
      const metaA = ((a.metadata as any) || {}) as any
      const metaB = ((b.metadata as any) || {}) as any
      const endA = metaA?.end_date ? new Date(metaA.end_date).getTime() : Infinity
      const endB = metaB?.end_date ? new Date(metaB.end_date).getTime() : Infinity
      return endA - endB
    })
  }

  return [...calls].sort((a, b) => {
    const metaA = ((a.metadata as any) || {}) as any
    const metaB = ((b.metadata as any) || {}) as any
    const viewedByA: string[] = Array.isArray(metaA.viewed_by) ? metaA.viewed_by : []
    const viewedByB: string[] = Array.isArray(metaB.viewed_by) ? metaB.viewed_by : []
    const viewedA = viewedByA.includes(currentUserId)
    const viewedB = viewedByB.includes(currentUserId)

    if (viewedA !== viewedB) {
      // Not viewed first
      return viewedA ? 1 : -1
    }

    const endA = metaA?.end_date ? new Date(metaA.end_date).getTime() : Infinity
    const endB = metaB?.end_date ? new Date(metaB.end_date).getTime() : Infinity
    // Earlier end date first; "forever" (no end_date) last
    return endA - endB
  })
}

export function OpenCallStack({ context, portfolioId, currentUserId }: OpenCallStackProps) {
  const [openCalls, setOpenCalls] = useState<(Note & { first_project_name?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [popupOpen, setPopupOpen] = useState(false)
  const [initialIndex, setInitialIndex] = useState(0)

  const fetchOpenCalls = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        context,
        limit: '10',
      })
      if (portfolioId) {
        params.append('portfolioId', portfolioId)
      }
      const res = await fetch(`/api/open-calls?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()

        const received: (Note & { first_project_name?: string })[] = data.openCalls || []
        const sorted = sortOpenCallsForUser(received, currentUserId)

        setOpenCalls(sorted)
      } else {
        setOpenCalls([])
      }
    } catch (err) {
      console.error('Failed to fetch open calls:', err)
      setOpenCalls([])
    } finally {
      setLoading(false)
    }
  }, [context, portfolioId, currentUserId])

  const handleViewed = useCallback(
    (noteId: string) => {
      if (!currentUserId) return

      setOpenCalls((prev) => {
        const updated = prev.map((n) => {
          if (n.id !== noteId) return n
          const meta = ((n.metadata as any) || {}) as any
          const viewedBy: string[] = Array.isArray(meta.viewed_by) ? [...meta.viewed_by] : []
          if (viewedBy.includes(currentUserId)) return n
          const nextMeta = { ...meta, viewed_by: [...viewedBy, currentUserId] }

          return {
            ...n,
            metadata: nextMeta,
          }
        })

        return sortOpenCallsForUser(updated, currentUserId)
      })
    },
    [currentUserId]
  )

  useEffect(() => {
    fetchOpenCalls()
  }, [fetchOpenCalls])

  const handleStackClick = () => {
    if (openCalls.length === 0) return
    setInitialIndex(0)
    setPopupOpen(true)
  }

  if (loading) {
    return (
      <div className="relative mb-8 w-full px-3 pt-4 md:px-0 md:pt-0" aria-hidden>
        <div
          className="absolute top-full left-1/2 w-[95%] h-12 rounded-xl bg-white pointer-events-none shadow-[0_12px_24px_-14px_rgba(0,0,0,0.18)]"
          style={{ zIndex: 0, transform: 'translate(-50%, -35px)' }}
        />
        <div className="relative z-10 rounded-xl shadow-[0_12px_24px_-14px_rgba(0,0,0,0.18)]">
          <SkeletonCard showAvatar={true} showBanner={false} />
        </div>
      </div>
    )
  }

  if (openCalls.length === 0) {
    return null
  }

  const firstNote = openCalls[0]

  return (
    <>
      <div
        className="relative cursor-pointer mb-8 w-full px-3 pt-4 md:px-0 md:pt-0"
        onClick={(e) => {
          e.preventDefault()
          if (openCalls.length === 0) return
          setInitialIndex(0)
          setPopupOpen(true)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleStackClick()
          }
        }}
        aria-label={`View open call: ${(firstNote.metadata as any)?.title || 'Open call'}`}
      >
        {/* Single placeholder behind - subtle shadow (stack only) */}
        <div
          className="absolute top-full left-1/2 w-[95%] h-12 rounded-xl bg-white pointer-events-none shadow-[0_12px_24px_-14px_rgba(0,0,0,0.18)]"
          style={{ zIndex: 0, transform: 'translate(-50%, -35px)' }}
          aria-hidden
        />

        {/* First preview card on top - slightly reduced shadow (stack only) */}
        <div className="relative z-10 rounded-xl shadow-[0_12px_24px_-14px_rgba(0,0,0,0.18)]">
          <OpenCallPreviewCard note={firstNote} currentUserId={currentUserId} />
        </div>
      </div>

      {popupOpen && (
        <OpenCallCarouselPopup
          openCalls={openCalls}
          initialIndex={initialIndex}
          currentUserId={currentUserId}
          onViewed={handleViewed}
          onClose={() => setPopupOpen(false)}
        />
      )}
    </>
  )
}
