'use client'

import { Note } from '@/types/note'
import { NoteCard } from './NoteCard'
import { useState, useEffect, useRef, useCallback } from 'react'

interface NotesMasonryProps {
  notes: Note[]
  pinnedNoteIds?: Set<string>
  portfolioId?: string
  currentUserId?: string
  canAnnotate?: boolean
  onNoteDeleted?: () => void
  onNoteRemovedFromPortfolio?: () => void
}

// Minimum card width in pixels
const MIN_CARD_WIDTH = 200
// Gap between items in pixels
const GAP = 16

interface CardPosition {
  noteId: string
  x: number
  y: number
  width: number
}

export function NotesMasonry({
  notes,
  pinnedNoteIds = new Set(),
  portfolioId,
  currentUserId,
  canAnnotate = false,
  onNoteDeleted,
  onNoteRemovedFromPortfolio,
}: NotesMasonryProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [positions, setPositions] = useState<CardPosition[]>([])
  const [containerWidth, setContainerWidth] = useState(0)

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

    // Process ALL notes in strict order to maintain row-first population
    // This is critical: we must process notes in the exact order they appear
    notes.forEach((note) => {
      const cardElement = cardRefs.current.get(note.id)
      
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
        noteId: note.id,
        x,
        y,
        width: cardWidth,
      })

      // Update the target column's height
      columnHeights[targetColumn] += cardElement.offsetHeight + GAP
    })

    setPositions(newPositions)
  }, [notes])

  // Measure cards and recalculate layout
  useEffect(() => {
    if (notes.length === 0) {
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
      const allMounted = notes.every((note) => {
        const card = cardRefs.current.get(note.id)
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
  }, [notes, calculateLayout])

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
    if (notes.length === 0) return

    let debounceTimeout: NodeJS.Timeout | null = null

    const observer = new ResizeObserver(() => {
      // Debounce recalculations
      if (debounceTimeout) {
        clearTimeout(debounceTimeout)
      }
      debounceTimeout = setTimeout(() => {
        // Only recalculate if all cards are mounted and measured
        const allMounted = notes.every((note) => {
          const card = cardRefs.current.get(note.id)
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
  }, [notes, calculateLayout])

  if (notes.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">No notes yet.</p>
      </div>
    )
  }

  // Calculate container height from positions
  const maxY = positions.reduce((max, pos) => {
    const cardElement = cardRefs.current.get(pos.noteId)
    if (cardElement) {
      return Math.max(max, pos.y + cardElement.offsetHeight)
    }
    return max
  }, 0)

  return (
    <div ref={containerRef} className="w-full relative" style={{ minHeight: maxY > 0 ? `${maxY}px` : 'auto' }}>
      {notes.map((note) => {
        const position = positions.find((p) => p.noteId === note.id)
        const isPositioned = position !== undefined

        return (
          <div
            key={note.id}
            id={`note-${note.id}`}
            ref={(el) => {
              if (el) {
                cardRefs.current.set(note.id, el)
              } else {
                cardRefs.current.delete(note.id)
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
            <NoteCard
              note={note}
              portfolioId={portfolioId}
              currentUserId={currentUserId}
              isPinned={pinnedNoteIds.has(note.id)}
              viewMode="collage"
              onDeleted={onNoteDeleted}
              onRemovedFromPortfolio={onNoteRemovedFromPortfolio}
            />
          </div>
        )
      })}
    </div>
  )
}

