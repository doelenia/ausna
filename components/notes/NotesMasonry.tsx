'use client'

import { Note } from '@/types/note'
import { NoteCard } from './NoteCard'
import { LazyLoad } from '@/components/ui/LazyLoad'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { Card, UIText } from '@/components/ui'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

interface NotesMasonryProps {
  notes: Note[]
  pinnedNoteIds?: Set<string>
  portfolioId?: string
  currentUserId?: string
  canAnnotate?: boolean
  onNoteDeleted?: () => void
  onNoteRemovedFromPortfolio?: () => void
  onNoteLeftCollaboration?: () => void
  onCollaboratorsUpdated?: () => void

  /**
   * When true, the collage card background won't navigate to `/notes/:id`
   * (used for resource carousel popups).
   */
  disableNavigation?: boolean
  /**
   * Called when a note card is clicked (only when `disableNavigation=true`).
   * Index is relative to the `notes` array (placeholders are not included).
   */
  onNoteClick?: (index: number) => void

  showPlaceholder?: boolean
  placeholderHref?: string
}

// Minimum card width in pixels
const MIN_CARD_WIDTH = 200
// Gap between items in pixels
const GAP = 16

interface CardPosition {
  itemId: string
  x: number
  y: number
  width: number
}

type NotesMasonryItem =
  | { kind: 'note'; id: string; note: Note; index: number }
  | { kind: 'placeholder'; id: string; href: string; label?: ReactNode; index: number }

function PlaceholderCard({ href }: { href: string }) {
  return (
    <div className="w-full">
      <Card variant="default" padding="none" className="relative overflow-hidden bg-gray-100">
        <Link
          href={href}
          className="block w-full h-full cursor-pointer focus:outline-none rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
          style={{ aspectRatio: '4 / 3', minHeight: '160px' }}
          aria-label="Add resource"
        >
          <div className="w-full h-full flex items-center justify-center">
            <div className="flex items-center gap-2">
              <Plus className="w-5 h-5" strokeWidth={2} aria-hidden />
              <UIText>Add resource</UIText>
            </div>
          </div>
        </Link>
      </Card>
    </div>
  )
}

export function NotesMasonry({
  notes,
  pinnedNoteIds = new Set(),
  portfolioId,
  currentUserId,
  canAnnotate = false,
  onNoteDeleted,
  onNoteRemovedFromPortfolio,
  onNoteLeftCollaboration,
  onCollaboratorsUpdated,
  disableNavigation = false,
  onNoteClick,
  showPlaceholder = false,
  placeholderHref,
}: NotesMasonryProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [positions, setPositions] = useState<CardPosition[]>([])
  const [containerWidth, setContainerWidth] = useState(0)

  const items: NotesMasonryItem[] = useMemo(
    () => [
      ...notes.map((note, index) => ({ kind: 'note' as const, id: note.id, note, index })),
      ...(showPlaceholder && placeholderHref
        ? [{ kind: 'placeholder' as const, id: 'resource-placeholder', href: placeholderHref, index: notes.length }]
        : []),
    ],
    [notes, showPlaceholder, placeholderHref]
  )

  // Calculate number of columns and card width
  const calculateLayout = useCallback(() => {
    if (!containerRef.current) return

    const width = containerRef.current.offsetWidth
    setContainerWidth(width)

    const numColumns = Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)))
    const cardWidth = (width - (numColumns - 1) * GAP) / numColumns

    // Calculate positions row-first (left to right, then next row)
    // Track which column each card should go to maintain row-first order
    const columnHeights = new Array(numColumns).fill(0)
    const newPositions: CardPosition[] = []

    // Process ALL items in strict order to maintain row-first population.
    items.forEach((item) => {
      const cardElement = cardRefs.current.get(item.id)
      
      // Skip if not measured yet - we'll recalculate when it's measured
      if (!cardElement || cardElement.offsetHeight === 0) {
        return
      }
      
      // For row-first masonry: find the position with minimum Y coordinate
      // If multiple positions have the same Y, choose the leftmost (minimum X)
      // This ensures cards fill left to right, then wrap to next row
      
      // First, find the minimum Y coordinate across all columns
      let minY = columnHeights[0]
      for (let col = 1; col < numColumns; col++) {
        if (columnHeights[col] < minY) {
          minY = columnHeights[col]
        }
      }
      
      // Then, find the leftmost column that has this minimum Y
      // This ensures row-first behavior: fill left to right
      let targetColumn = 0
      for (let col = 0; col < numColumns; col++) {
        if (columnHeights[col] === minY) {
          targetColumn = col
          break // Take the first (leftmost) column with min Y
        }
      }

      const x = targetColumn * (cardWidth + GAP)
      const y = columnHeights[targetColumn]

      newPositions.push({
        itemId: item.id,
        x,
        y,
        width: cardWidth,
      })

      // Update the target column's height
      columnHeights[targetColumn] += cardElement.offsetHeight + GAP
    })

    setPositions(newPositions)
  }, [items])

  // Measure cards and recalculate layout
  useEffect(() => {
    if (items.length === 0) {
      setPositions([])
      return
    }

    // Wait for cards to render and images to load, then measure
    // Use multiple attempts to ensure all cards are measured
    let attempts = 0
    const maxAttempts = 10
    
    const checkAndCalculate = () => {
      attempts++
      
      // Check if all cards are mounted and have non-zero height
      const allMounted = items.every((item) => {
        const card = cardRefs.current.get(item.id)
        return card && card.offsetHeight > 0
      })
      
      if (allMounted) {
        calculateLayout()
      } else if (attempts < maxAttempts) {
        // Retry after a short delay
        setTimeout(checkAndCalculate, 100)
      }
    }
    
    const timeoutId = setTimeout(checkAndCalculate, 100)

    return () => clearTimeout(timeoutId)
  }, [items, calculateLayout])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      calculateLayout()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [calculateLayout])

  // Recalculate when card heights change (e.g., images load)
  useEffect(() => {
    if (items.length === 0) return

    let debounceTimeout: NodeJS.Timeout | null = null

    const observer = new ResizeObserver(() => {
      // Debounce recalculations
      if (debounceTimeout) {
        clearTimeout(debounceTimeout)
      }
      debounceTimeout = setTimeout(() => {
        // Only recalculate if all cards are mounted and measured
        const allMounted = items.every((item) => {
          const card = cardRefs.current.get(item.id)
          return card && card.offsetHeight > 0
        })
        if (allMounted) {
          calculateLayout()
        }
      }, 100)
    })

    const cards = Array.from(cardRefs.current.values())
    cards.forEach((card) => {
      if (card) observer.observe(card)
    })

    return () => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout)
      }
      observer.disconnect()
    }
  }, [items, calculateLayout])

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <UIText>No notes yet.</UIText>
      </div>
    )
  }

  // Calculate container height from positions
  const maxY = positions.reduce((max, pos) => {
    const cardElement = cardRefs.current.get(pos.itemId)
    if (cardElement) {
      return Math.max(max, pos.y + cardElement.offsetHeight)
    }
    return max
  }, 0)

  return (
    <div ref={containerRef} className="w-full relative" style={{ minHeight: maxY > 0 ? `${maxY}px` : 'auto' }}>
      {items.map((item) => {
        const position = positions.find((p) => p.itemId === item.id)
        const isPositioned = position !== undefined

        return (
          <div
            key={item.id}
            id={item.kind === 'note' ? `note-${item.note.id}` : item.id}
            ref={(el) => {
              if (el) {
                cardRefs.current.set(item.id, el)
              } else {
                cardRefs.current.delete(item.id)
              }
            }}
            style={{
              position: isPositioned ? 'absolute' : 'static',
              left: isPositioned ? `${position.x}px` : undefined,
              top: isPositioned ? `${position.y}px` : undefined,
              width: isPositioned ? `${position.width}px` : '100%',
              visibility: isPositioned ? 'visible' : 'hidden',
            }}
          >
            <LazyLoad
              rootMargin="300px"
              fallback={
                <div style={{ width: '100%', height: '300px' }}>
                  <SkeletonCard showAvatar={false} showBanner={false} />
                </div>
              }
            >
              {item.kind === 'note' ? (
                <NoteCard
                  note={item.note}
                  portfolioId={portfolioId}
                  currentUserId={currentUserId}
                  isPinned={pinnedNoteIds.has(item.note.id)}
                  viewMode="collage"
                  disableNavigation={disableNavigation}
                  onCardClick={
                    disableNavigation && onNoteClick ? () => onNoteClick(item.index) : undefined
                  }
                  onDeleted={onNoteDeleted}
                  onRemovedFromPortfolio={onNoteRemovedFromPortfolio}
                  onLeftCollaboration={onNoteLeftCollaboration}
                  onCollaboratorsUpdated={onCollaboratorsUpdated}
                />
              ) : (
                <PlaceholderCard href={item.href} />
              )}
            </LazyLoad>
          </div>
        )
      })}
    </div>
  )
}

