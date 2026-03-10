'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Note } from '@/types/note'
import { NoteView } from './NoteView'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { UIText } from '@/components/ui'

const DESKTOP_CARD_WIDTH = 560
const DESKTOP_GAP = 24
const DESKTOP_SLIDE_WIDTH = DESKTOP_CARD_WIDTH + DESKTOP_GAP

interface OpenCallCarouselPopupProps {
  openCalls: Note[]
  initialIndex: number
  currentUserId?: string
  onClose: () => void
  onViewed?: (noteId: string) => void
}

export function OpenCallCarouselPopup({
  openCalls,
  initialIndex,
  currentUserId,
  onClose,
  onViewed,
}: OpenCallCarouselPopupProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [isMobile, setIsMobile] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [locallySeenIds, setLocallySeenIds] = useState<Set<string>>(() => new Set())
  const stripRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollTargetRef = useRef<number | null>(null)
  const currentIndexRef = useRef<number>(initialIndex)

  const currentNote = openCalls[currentIndex]
  const hasMultiple = openCalls.length > 1

  const desktopTransform =
    viewportWidth > 0
      ? -(
          currentIndex * DESKTOP_SLIDE_WIDTH +
          DESKTOP_CARD_WIDTH / 2 -
          viewportWidth / 2
        )
      : -currentIndex * DESKTOP_SLIDE_WIDTH

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (isMobile) return
    const el = viewportRef.current
    if (!el) return
    const update = () => setViewportWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isMobile])

  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  useEffect(() => {
    if (!currentUserId || !currentNote) return

    fetch(`/api/notes/${currentNote.id}/record-view`, {
      method: 'POST',
    }).catch(() => {})
  }, [currentNote?.id, currentUserId])

  useEffect(() => {
    if (!currentUserId || !currentNote) return
    const meta = ((currentNote.metadata as any) || {}) as any
    const viewedBy: string[] = Array.isArray(meta.viewed_by) ? meta.viewed_by : []
    const alreadyViewedOnServer = viewedBy.includes(currentUserId)
    const isNewInPopup =
      !alreadyViewedOnServer && !locallySeenIds.has(currentNote.id) && currentNote.type === 'open_call'
  }, [currentNote?.id, currentUserId, locallySeenIds])

  const markIndexAsSeenIfNew = useCallback(
    (index: number) => {
      if (!currentUserId) return
      const note = openCalls[index]
      if (!note) return
      const meta = ((note.metadata as any) || {}) as any
      const viewedBy: string[] = Array.isArray(meta.viewed_by) ? meta.viewed_by : []
      const alreadyViewedOnServer = viewedBy.includes(currentUserId)
      const alreadyLocallySeen = locallySeenIds.has(note.id)
      if (alreadyViewedOnServer || alreadyLocallySeen) return

      const next = new Set(locallySeenIds)
      next.add(note.id)
      setLocallySeenIds(next)

      if (onViewed) {
        onViewed(note.id)
      }
    },
    [currentUserId, locallySeenIds, openCalls]
  )

  const goPrev = useCallback(() => {
    if (currentIndex <= 0) return
    markIndexAsSeenIfNew(currentIndex)
    setCurrentIndex((i) => i - 1)
  }, [currentIndex, markIndexAsSeenIfNew])

  const goNext = useCallback(() => {
    if (currentIndex >= openCalls.length - 1) return
    markIndexAsSeenIfNew(currentIndex)
    setCurrentIndex((i) => i + 1)
  }, [currentIndex, openCalls.length, markIndexAsSeenIfNew])

  // Mobile: one slide = card (100vw-24px) + gap (24px); scroll step = 100vw
  const getMobileSlideStep = useCallback(() => {
    if (!scrollRef.current) return 0
    return scrollRef.current.offsetWidth
  }, [])

  // Mobile: scroll strip to the slide at currentIndex (e.g. when dots used)
  useEffect(() => {
    if (!isMobile || !scrollRef.current || openCalls.length === 0) return
    const step = getMobileSlideStep()
    if (step <= 0) return
    const targetLeft = currentIndex * step
    if (Math.abs(scrollRef.current.scrollLeft - targetLeft) > 4) {
      scrollTargetRef.current = currentIndex
      scrollRef.current.scrollTo({ left: targetLeft, behavior: 'smooth' })
    }
  }, [isMobile, currentIndex, openCalls.length, getMobileSlideStep])

  // Mobile: sync currentIndex from scroll position (step = 100vw-24 so swipe back works)
  const handleScroll = useCallback(() => {
    if (!isMobile || !scrollRef.current) return
    const step = getMobileSlideStep()
    if (step <= 0) return
    const index = Math.round(scrollRef.current.scrollLeft / step)
    const clamped = Math.max(0, Math.min(index, openCalls.length - 1))
    if (scrollTargetRef.current === clamped) scrollTargetRef.current = null

    const prevIndex = currentIndexRef.current
    if (clamped !== prevIndex) {
      markIndexAsSeenIfNew(prevIndex)
      setCurrentIndex((i) => (i !== clamped ? clamped : i))
    }
  }, [isMobile, openCalls.length, getMobileSlideStep, markIndexAsSeenIfNew])

  const handleClose = useCallback(() => {
    // If user closes while focused on a NEW open call,
    // still mark it as seen so stack/popup state updates.
    markIndexAsSeenIfNew(currentIndexRef.current)
    onClose()
  }, [markIndexAsSeenIfNew, onClose])

  const handleContentClick = (e: React.MouseEvent) => {
    const link = (e.target as HTMLElement).closest('a[href*="/notes/"]') as HTMLAnchorElement | null
    if (link?.getAttribute('href')?.startsWith(`/notes/${currentNote.id}`)) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [handleClose, currentNote?.id])

  if (!currentNote) return null

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gray-800 min-h-[100dvh] ${
        isMobile ? 'pt-16 px-0 pb-24' : `px-0 pt-0 pb-0 ${hasMultiple ? 'pb-14 md:pb-6' : ''}`
      }`}
      style={{ minHeight: '100dvh' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <button
        onClick={handleClose}
        className="fixed top-4 right-4 z-[110] p-2 rounded-full bg-black/20 hover:bg-black/30 text-white transition-colors"
        aria-label="Close"
      >
        <X className="w-5 h-5" strokeWidth={2} />
      </button>

      {/* Desktop: full-width viewport, no padding; strip centered so current card in middle, sides visible */}
      {!isMobile && (
        <>
          <div
            ref={viewportRef}
            className="relative flex-1 min-h-0 w-full overflow-hidden flex items-center justify-start"
          >
            <div
              ref={stripRef}
              className="flex flex-row flex-nowrap items-center transition-transform duration-300 ease-out gap-6 h-full max-h-full"
              style={{
                width: openCalls.length * DESKTOP_SLIDE_WIDTH - DESKTOP_GAP,
                transform: `translateX(${desktopTransform}px)`,
              }}
            >
              {openCalls.map((note, i) => {
                const meta = ((note.metadata as any) || {}) as any
                const viewedBy: string[] = Array.isArray(meta.viewed_by) ? meta.viewed_by : []
                const alreadyViewedOnServer =
                  !!currentUserId && viewedBy.includes(currentUserId)
                const isNewInPopup =
                  !alreadyViewedOnServer && !locallySeenIds.has(note.id) && note.type === 'open_call'

                return (
                  <div
                    key={note.id}
                    className={`relative flex-shrink-0 min-h-0 max-h-full overflow-y-auto overscroll-contain transition-opacity duration-200 ${
                      i === currentIndex ? 'opacity-100' : 'opacity-60 hover:opacity-75'
                    }`}
                    style={{ width: DESKTOP_CARD_WIDTH, maxHeight: '100%' }}
                    onClickCapture={i === currentIndex ? handleContentClick : undefined}
                  >
                    {i === currentIndex && isNewInPopup && (
                      <div className="absolute top-3 right-3 z-20">
                        <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-orange-500">
                          <UIText as="span" className="text-white">
                            NEW
                          </UIText>
                        </div>
                      </div>
                    )}
                    {i !== currentIndex && (
                      <div
                        className="absolute inset-0 z-10 cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          markIndexAsSeenIfNew(currentIndex)
                          setCurrentIndex(i)
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Go to open call ${i + 1}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            markIndexAsSeenIfNew(currentIndex)
                            setCurrentIndex(i)
                          }
                        }}
                      />
                    )}
                    <div className={i !== currentIndex ? 'pointer-events-none' : ''}>
                      <NoteView
                        note={note}
                        annotations={[]}
                        portfolios={[]}
                        humanPortfolios={[]}
                        currentUserId={currentUserId}
                        canAnnotate={false}
                        referencedNoteDeleted={false}
                        embedInPopup={true}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          {hasMultiple && (
            <>
              {currentIndex > 0 && (
                <button
                  onClick={goPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-[105] p-2 rounded-full bg-black/20 hover:bg-black/30 text-white transition-colors hidden md:flex"
                  aria-label="Previous"
                >
                  <ChevronLeft className="w-6 h-6" strokeWidth={2} />
                </button>
              )}
              {currentIndex < openCalls.length - 1 && (
                <button
                  onClick={goNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-[105] p-2 rounded-full bg-black/20 hover:bg-black/30 text-white transition-colors hidden md:flex"
                  aria-label="Next"
                >
                  <ChevronRight className="w-6 h-6" strokeWidth={2} />
                </button>
              )}
            </>
          )}
        </>
      )}

      {/* Mobile: 12px padding each side; card width 100vw-24px; 24px gap between cards */}
      {isMobile && (
        <div
          ref={scrollRef}
          className="flex-1 w-full min-h-0 overflow-x-auto overflow-y-hidden snap-x snap-mandatory flex flex-row flex-nowrap items-center scroll-smooth px-3"
          style={{ WebkitOverflowScrolling: 'touch' }}
          onScroll={handleScroll}
        >
          {openCalls.map((note, i) => {
            const meta = ((note.metadata as any) || {}) as any
            const viewedBy: string[] = Array.isArray(meta.viewed_by) ? meta.viewed_by : []
            const alreadyViewedOnServer =
              !!currentUserId && viewedBy.includes(currentUserId)
            const isNewInPopup =
              !alreadyViewedOnServer && !locallySeenIds.has(note.id) && note.type === 'open_call'

            return (
              <div
                key={note.id}
                data-open-call-slide
                className="flex-shrink-0 snap-center w-[calc(100vw-24px)] min-w-[calc(100vw-24px)] mr-6 last:mr-0 flex flex-col self-center max-h-full overflow-y-auto"
              >
                <div
                  className="relative rounded-xl overflow-hidden shadow-lg bg-white min-h-0 overflow-y-auto overscroll-contain flex flex-col"
                  onClickCapture={i === currentIndex ? handleContentClick : undefined}
                >
                  {i === currentIndex && isNewInPopup && (
                    <div className="absolute top-3 right-3 z-20">
                      <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-orange-500">
                        <UIText as="span" className="text-white">
                          NEW
                        </UIText>
                      </div>
                    </div>
                  )}
                  <NoteView
                    note={note}
                    annotations={[]}
                    portfolios={[]}
                    humanPortfolios={[]}
                    currentUserId={currentUserId}
                    canAnnotate={false}
                    referencedNoteDeleted={false}
                    embedInPopup={true}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Dot indicators */}
      {hasMultiple && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex justify-center gap-1.5 py-2 px-3 rounded-full bg-black/20 z-[110]"
          style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {openCalls.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                if (i !== currentIndex) {
                  markIndexAsSeenIfNew(currentIndex)
                  setCurrentIndex(i)
                }
              }}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentIndex ? 'bg-white' : 'bg-white/50 hover:bg-white/70'
              }`}
              aria-label={`Go to open call ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
