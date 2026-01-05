'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Note } from '@/types/note'
import { getPinnedItems } from '@/app/portfolio/[type]/[id]/actions'
import { getNotesByPortfolioPaginated } from '@/app/notes/actions'
import { NotesMasonry } from '@/components/notes/NotesMasonry'
import { isHumanPortfolio, Portfolio } from '@/types/portfolio'
import { UIText } from '@/components/ui'
import { Star, BookMarked } from 'lucide-react'

interface NotesFeedProps {
  portfolio: Portfolio
  portfolioId: string
  currentUserId?: string
  canCreateNote: boolean
}

export function NotesFeed({
  portfolio,
  portfolioId,
  currentUserId,
  canCreateNote,
}: NotesFeedProps) {
  const [pinnedNotes, setPinnedNotes] = useState<Note[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [pinnedNoteIds, setPinnedNoteIds] = useState<Set<string>>(new Set())
  const [pinnedNotesLoaded, setPinnedNotesLoaded] = useState(false)
  const offsetRef = useRef(0)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  // Fetch pinned notes (only notes, not portfolios)
  useEffect(() => {
    const fetchPinnedNotes = async () => {
      try {
        const result = await getPinnedItems(portfolioId)
        if (result.success && result.items) {
          // Filter to only notes (no portfolios)
          const noteItems = result.items.filter(item => item.type === 'note' && item.note)
          
          // Convert to Note format - use full note data from getPinnedItems
          const notes: Note[] = noteItems.map(item => {
            const noteData = item.note!
            return {
              id: noteData.id,
              text: noteData.text,
              owner_account_id: noteData.owner_account_id,
              created_at: noteData.created_at,
              assigned_portfolios: noteData.assigned_portfolios || [portfolioId],
              references: Array.isArray(noteData.references) ? noteData.references : [],
              mentioned_note_id: noteData.mentioned_note_id || null,
              updated_at: noteData.updated_at || noteData.created_at,
              deleted_at: noteData.deleted_at || null,
              summary: noteData.summary || null,
              compound_text: noteData.compound_text || null,
              topics: noteData.topics || [],
              intentions: noteData.intentions || [],
              indexing_status: noteData.indexing_status || null,
            }
          })

          setPinnedNotes(notes)
          setPinnedNoteIds(new Set(notes.map(n => n.id)))
        }
        setPinnedNotesLoaded(true)
      } catch (err: any) {
        console.error('Failed to fetch pinned notes:', err)
        setPinnedNotesLoaded(true)
      }
    }

    fetchPinnedNotes()
  }, [portfolioId])

  // Fetch initial notes (after pinned notes are loaded)
  useEffect(() => {
    if (!pinnedNotesLoaded) return

    const fetchInitialNotes = async () => {
      setLoading(true)
      setError(null)
      offsetRef.current = 0

      try {
        const response = await fetch(`/api/portfolios/${portfolioId}/notes?offset=0&limit=20`)
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to load notes')
        }
        
        const result = await response.json()
        if (result.success && result.notes) {
          // Filter out pinned notes from regular notes
          const currentPinnedIds = pinnedNoteIds
          const filteredNotes = result.notes.filter((note: Note) => !currentPinnedIds.has(note.id))
          
          setNotes(filteredNotes)
          setHasMore(result.hasMore ?? false)
        } else {
          setError(result.error || 'Failed to load notes')
        }
      } catch (err: any) {
        setError(err.message || 'An unexpected error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchInitialNotes()
  }, [portfolioId, pinnedNotesLoaded, pinnedNoteIds])

  // Load more notes
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return

    setLoadingMore(true)
    try {
      const currentOffset = offsetRef.current
      offsetRef.current += 20
      
      const response = await fetch(`/api/portfolios/${portfolioId}/notes?offset=${currentOffset}&limit=20`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to load more notes')
      }
      
      const result = await response.json()
      if (result.success && result.notes) {
        // Filter out pinned notes and duplicates
        setNotes(prev => {
          const existingIds = new Set([...pinnedNoteIds, ...prev.map(n => n.id)])
          const newNotes = result.notes.filter((note: Note) => !existingIds.has(note.id))
          return [...prev, ...newNotes]
        })
        setHasMore(result.hasMore ?? false)
      }
    } catch (err: any) {
      console.error('Failed to load more notes:', err)
    } finally {
      setLoadingMore(false)
    }
  }, [portfolioId, loadingMore, hasMore, pinnedNoteIds])

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(loadMoreRef.current)
    observerRef.current = observer

    return () => {
      observer.disconnect()
    }
  }, [hasMore, loadingMore, loadMore])


  const handleNoteDeleted = async () => {
    // Refresh both pinned and regular notes
    const pinnedResult = await getPinnedItems(portfolioId)
    if (pinnedResult.success && pinnedResult.items) {
      const noteItems = pinnedResult.items.filter(item => item.type === 'note' && item.note)
      const pinnedNotesData: Note[] = noteItems.map(item => ({
        id: item.note!.id,
        text: item.note!.text,
        owner_account_id: item.note!.owner_account_id,
        created_at: item.note!.created_at,
        assigned_portfolios: [portfolioId],
        references: Array.isArray(item.note!.references) ? item.note!.references : [],
        mentioned_note_id: item.note!.mentioned_note_id || null,
        updated_at: item.note!.updated_at || item.note!.created_at,
        deleted_at: item.note!.deleted_at || null,
        summary: item.note!.summary || null,
        compound_text: item.note!.compound_text || null,
        topics: item.note!.topics || [],
        intentions: item.note!.intentions || [],
        indexing_status: item.note!.indexing_status || null,
      }))
      const newPinnedIds = new Set(pinnedNotesData.map(n => n.id))
      setPinnedNotes(pinnedNotesData)
      setPinnedNoteIds(newPinnedIds)
      
      // Refresh regular notes, filtering out pinned ones
      const notesResult = await getNotesByPortfolioPaginated(portfolioId, 0, offsetRef.current + 20)
      if (notesResult.success && notesResult.notes) {
        const filteredNotes = notesResult.notes.filter(note => !newPinnedIds.has(note.id))
        setNotes(filteredNotes)
        offsetRef.current = filteredNotes.length
      }
    } else {
      // If pinned fetch fails, just refresh regular notes
      const notesResult = await getNotesByPortfolioPaginated(portfolioId, 0, offsetRef.current + 20)
      if (notesResult.success && notesResult.notes) {
        const filteredNotes = notesResult.notes.filter(note => !pinnedNoteIds.has(note.id))
        setNotes(filteredNotes)
        offsetRef.current = filteredNotes.length
      }
    }
  }

  const handleNoteRemovedFromPortfolio = async () => {
    // Refresh notes
    const notesResult = await getNotesByPortfolioPaginated(portfolioId, 0, offsetRef.current + 20)
    if (notesResult.success && notesResult.notes) {
      const filteredNotes = notesResult.notes.filter(note => !pinnedNoteIds.has(note.id))
      setNotes(filteredNotes)
      offsetRef.current = filteredNotes.length
    }
  }

  if (loading) {
    return (
      <div className="py-8 text-center">
        <UIText>Loading notes...</UIText>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <UIText className="text-red-500">{error}</UIText>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Pinned Notes Section */}
      {pinnedNotes.length > 0 && (
        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
            <UIText>Pins</UIText>
          </div>
          <NotesMasonry
            notes={pinnedNotes}
            pinnedNoteIds={pinnedNoteIds}
            portfolioId={portfolioId}
            currentUserId={currentUserId}
            canAnnotate={canCreateNote}
            onNoteDeleted={handleNoteDeleted}
            onNoteRemovedFromPortfolio={handleNoteRemovedFromPortfolio}
          />
        </div>
      )}

      {/* Regular Notes Section */}
      {notes.length > 0 ? (
        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
            <UIText>Notes</UIText>
          </div>
          <NotesMasonry
            notes={notes}
            pinnedNoteIds={new Set()}
            portfolioId={portfolioId}
            currentUserId={currentUserId}
            canAnnotate={canCreateNote}
            onNoteDeleted={handleNoteDeleted}
            onNoteRemovedFromPortfolio={handleNoteRemovedFromPortfolio}
          />
          
          {/* Load more trigger */}
          {hasMore && (
            <div ref={loadMoreRef} className="py-4 text-center">
              {loadingMore ? (
                <UIText>Loading more notes...</UIText>
              ) : (
                <UIText className="text-gray-500">Scroll for more</UIText>
              )}
            </div>
          )}
        </div>
      ) : pinnedNotes.length === 0 ? (
        <div className="py-12 text-center">
          <UIText className="text-gray-500">No notes yet.</UIText>
        </div>
      ) : null}
    </div>
  )
}

