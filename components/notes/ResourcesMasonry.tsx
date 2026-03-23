'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Note } from '@/types/note'
import { NoteCard } from './NoteCard'
import { LazyLoad } from '@/components/ui/LazyLoad'
import { SkeletonCard } from '@/components/ui/Skeleton'
import type { ReactNode } from 'react'
import { Card, UIText } from '@/components/ui'
import Link from 'next/link'
import { Plus } from 'lucide-react'

const MIN_CARD_WIDTH = 200
const GAP = 16

type ResourcesMasonryItem =
  | { kind: 'note'; id: string; note: Note; index: number }
  | { kind: 'placeholder'; id: string; href: string; label?: ReactNode }

interface ResourcesMasonryProps {
  resources: Note[]
  placeholderHref?: string
  showPlaceholder?: boolean
  portfolioId: string
  currentUserId?: string
  disableNavigation?: boolean
  onNoteClick?: (index: number) => void
}

export function ResourcesMasonry({
  resources,
  placeholderHref,
  showPlaceholder = false,
  portfolioId,
  currentUserId,
  disableNavigation = false,
  onNoteClick,
}: ResourcesMasonryProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [positions, setPositions] = useState<{ id: string; x: number; y: number; width: number }[]>([])
  const [containerWidth, setContainerWidth] = useState(0)

  const items: ResourcesMasonryItem[] = [
    ...resources.map((n, index) => ({ kind: 'note' as const, id: n.id, note: n, index })),
    ...(showPlaceholder && placeholderHref
      ? [{ kind: 'placeholder' as const, id: 'resource-placeholder', href: placeholderHref }]
      : []),
  ]

  const calculateLayout = useCallback(() => {
    if (!containerRef.current) return

    const width = containerRef.current.offsetWidth
    setContainerWidth(width)

    const numColumns = Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)))
    const cardWidth = (width - (numColumns - 1) * GAP) / numColumns

    const columnHeights = new Array(numColumns).fill(0)
    const newPositions: { id: string; x: number; y: number; width: number }[] = []

    items.forEach((item) => {
      const cardElement = cardRefs.current.get(item.id)
      if (!cardElement || cardElement.offsetHeight === 0) return

      let minY = columnHeights[0]
      for (let col = 1; col < numColumns; col++) {
        if (columnHeights[col] < minY) minY = columnHeights[col]
      }

      let targetColumn = 0
      for (let col = 0; col < numColumns; col++) {
        if (columnHeights[col] === minY) {
          targetColumn = col
          break
        }
      }

      const x = targetColumn * (cardWidth + GAP)
      const y = columnHeights[targetColumn]

      newPositions.push({ id: item.id, x, y, width: cardWidth })
      columnHeights[targetColumn] += cardElement.offsetHeight + GAP
    })

    setPositions(newPositions)
  }, [items])

  useEffect(() => {
    if (items.length === 0) {
      setPositions([])
      return
    }

    let attempts = 0
    const maxAttempts = 10

    const checkAndCalculate = () => {
      attempts++
      const allMounted = items.every((item) => {
        const card = cardRefs.current.get(item.id)
        return card && card.offsetHeight > 0
      })

      if (allMounted) {
        calculateLayout()
      } else if (attempts < maxAttempts) {
        setTimeout(checkAndCalculate, 100)
      }
    }

    const timeoutId = setTimeout(checkAndCalculate, 100)
    return () => clearTimeout(timeoutId)
  }, [items, calculateLayout])

  useEffect(() => {
    const handleResize = () => calculateLayout()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [calculateLayout])

  useEffect(() => {
    if (items.length === 0) return

    let debounceTimeout: NodeJS.Timeout | null = null
    const observer = new ResizeObserver(() => {
      if (debounceTimeout) clearTimeout(debounceTimeout)
      debounceTimeout = setTimeout(() => {
        const allMounted = items.every((item) => {
          const card = cardRefs.current.get(item.id)
          return card && card.offsetHeight > 0
        })
        if (allMounted) calculateLayout()
      }, 100)
    })

    const cards = Array.from(cardRefs.current.values())
    cards.forEach((card) => {
      if (card) observer.observe(card)
    })

    return () => {
      if (debounceTimeout) clearTimeout(debounceTimeout)
      observer.disconnect()
    }
  }, [items, calculateLayout])

  const maxY = positions.reduce((max, pos) => {
    const el = cardRefs.current.get(pos.id)
    if (el) return Math.max(max, pos.y + el.offsetHeight)
    return max
  }, 0)

  return (
    <div
      ref={containerRef}
      className="w-full relative"
      style={{ minHeight: maxY > 0 ? `${maxY}px` : 'auto' }}
      aria-label="Resources masonry"
    >
      {items.map((item) => {
        const position = positions.find((p) => p.id === item.id)
        const isPositioned = position !== undefined

        return (
          <div
            key={item.id}
            id={`resource-${item.id}`}
            ref={(el) => {
              if (el) cardRefs.current.set(item.id, el)
              else cardRefs.current.delete(item.id)
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
                  viewMode="collage"
                  disableNavigation={disableNavigation}
                  onCardClick={() => onNoteClick?.(item.index)}
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
              <Plus className="w-5 h-5 text-gray-600" strokeWidth={2} aria-hidden />
              <UIText>Add resource</UIText>
            </div>
          </div>
        </Link>
      </Card>
    </div>
  )
}

