'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Note } from '@/types/note'
import { getPinnedItems } from '@/app/portfolio/[type]/[id]/actions'
import { getNotesByPortfolioPaginated } from '@/app/notes/actions'
import { NotesMasonry } from '@/components/notes/NotesMasonry'
import { isHumanPortfolio, isProjectPortfolio, Portfolio } from '@/types/portfolio'
import { UIText } from '@/components/ui'
import { Star, BookMarked, Edit, Trash2, Pencil } from 'lucide-react'

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
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const [loadingCollections, setLoadingCollections] = useState(false)
  const [noteCollectionMap, setNoteCollectionMap] = useState<Map<string, string[]>>(new Map())
  const [isEditMode, setIsEditMode] = useState(false)
  const [deletingCollectionId, setDeletingCollectionId] = useState<string | null>(null)
  const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState<string>('')
  const [isHoveringTabs, setIsHoveringTabs] = useState(false)

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

  // Fetch collections for project portfolios
  useEffect(() => {
    const fetchCollections = async () => {
      if (!isProjectPortfolio(portfolio)) {
        setCollections([])
        return
      }

      setLoadingCollections(true)
      try {
        const response = await fetch(`/api/collections?portfolio_id=${portfolioId}`)
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setCollections(data.collections || [])
          }
        }
      } catch (error) {
        console.error('Error fetching collections:', error)
      } finally {
        setLoadingCollections(false)
      }
    }

    fetchCollections()
  }, [portfolioId, portfolio])

  const handleDeleteCollection = async (collectionId: string) => {
    if (deletingCollectionId) return

    if (!confirm('Are you sure you want to delete this collection? Notes will not be deleted, only the collection assignment will be removed.')) {
      return
    }

    setDeletingCollectionId(collectionId)
    try {
      const response = await fetch(`/api/collections/${collectionId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        // Remove collection from list
        setCollections(prev => prev.filter(c => c.id !== collectionId))
        
        // If the deleted collection was selected, reset to "All"
        if (selectedCollectionId === collectionId) {
          setSelectedCollectionId(null)
        }
        
        // Exit edit mode if no collections left
        if (collections.length <= 1) {
          setIsEditMode(false)
        }
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to delete collection')
      }
    } catch (error: any) {
      console.error('Error deleting collection:', error)
      alert(error.message || 'Failed to delete collection')
    } finally {
      setDeletingCollectionId(null)
    }
  }

  const handleStartRename = (collectionId: string, currentName: string) => {
    setRenamingCollectionId(collectionId)
    setRenameValue(currentName)
  }

  const handleCancelRename = () => {
    setRenamingCollectionId(null)
    setRenameValue('')
  }

  const handleSaveRename = async (collectionId: string) => {
    if (!renameValue.trim()) {
      alert('Collection name cannot be empty')
      return
    }

    try {
      const response = await fetch(`/api/collections/${collectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.collection) {
          // Update collection in list
          setCollections(prev => prev.map(c => 
            c.id === collectionId ? { ...c, name: data.collection.name } : c
          ))
          setRenamingCollectionId(null)
          setRenameValue('')
        } else {
          alert(data.error || 'Failed to rename collection')
        }
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to rename collection')
      }
    } catch (error: any) {
      console.error('Error renaming collection:', error)
      alert(error.message || 'Failed to rename collection')
    }
  }



  // Fetch initial notes (after pinned notes are loaded)
  useEffect(() => {
    if (!pinnedNotesLoaded) return

    const fetchInitialNotes = async () => {
      setLoading(true)
      setError(null)
      offsetRef.current = 0

      try {
        const url = selectedCollectionId
          ? `/api/portfolios/${portfolioId}/notes?offset=0&limit=20&collection_id=${selectedCollectionId}`
          : `/api/portfolios/${portfolioId}/notes?offset=0&limit=20`
        const response = await fetch(url)
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to load notes')
        }
        
        const result = await response.json()
        if (result.success && result.notes) {
          // When collection is selected, don't filter out pinned notes - they're already filtered by collection
          // When no collection is selected, filter out pinned notes
          const currentPinnedIds = pinnedNoteIds
          const filteredNotes = selectedCollectionId
            ? result.notes
            : result.notes.filter((note: Note) => !currentPinnedIds.has(note.id))
          
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
  }, [portfolioId, pinnedNotesLoaded, pinnedNoteIds, selectedCollectionId])

  // Load more notes
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return

    setLoadingMore(true)
      try {
        const currentOffset = offsetRef.current
        offsetRef.current += 20
        
        const url = selectedCollectionId
          ? `/api/portfolios/${portfolioId}/notes?offset=${currentOffset}&limit=20&collection_id=${selectedCollectionId}`
          : `/api/portfolios/${portfolioId}/notes?offset=${currentOffset}&limit=20`
        const response = await fetch(url)
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to load more notes')
        }
      
        const result = await response.json()
        if (result.success && result.notes) {
          // When collection is selected, don't filter out pinned notes - they're already filtered by collection
          // When no collection is selected, filter out pinned notes and duplicates
          setNotes(prev => {
            if (selectedCollectionId) {
              // Include all notes from API (already filtered by collection)
              const existingIds = new Set(prev.map(n => n.id))
              const newNotes = result.notes.filter((note: Note) => !existingIds.has(note.id))
              return [...prev, ...newNotes]
            } else {
              // Filter out pinned notes and duplicates
              const existingIds = new Set([...pinnedNoteIds, ...prev.map(n => n.id)])
              const newNotes = result.notes.filter((note: Note) => !existingIds.has(note.id))
              return [...prev, ...newNotes]
            }
          })
          setHasMore(result.hasMore ?? false)
        }
    } catch (err: any) {
      console.error('Failed to load more notes:', err)
    } finally {
      setLoadingMore(false)
    }
  }, [portfolioId, loadingMore, hasMore, pinnedNoteIds, selectedCollectionId])

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
      const url = selectedCollectionId
        ? `/api/portfolios/${portfolioId}/notes?offset=0&limit=${offsetRef.current + 20}&collection_id=${selectedCollectionId}`
        : `/api/portfolios/${portfolioId}/notes?offset=0&limit=${offsetRef.current + 20}`
      const response = await fetch(url)
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.notes) {
          const filteredNotes = result.notes.filter((note: Note) => !newPinnedIds.has(note.id))
          setNotes(filteredNotes)
          offsetRef.current = filteredNotes.length
        }
      }
    } else {
      // If pinned fetch fails, just refresh regular notes
      const url = selectedCollectionId
        ? `/api/portfolios/${portfolioId}/notes?offset=0&limit=${offsetRef.current + 20}&collection_id=${selectedCollectionId}`
        : `/api/portfolios/${portfolioId}/notes?offset=0&limit=${offsetRef.current + 20}`
      const response = await fetch(url)
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.notes) {
          const filteredNotes = result.notes.filter((note: Note) => !pinnedNoteIds.has(note.id))
          setNotes(filteredNotes)
          offsetRef.current = filteredNotes.length
        }
      }
    }
  }

  const handleNoteRemovedFromPortfolio = async () => {
    // Refresh notes
    const url = selectedCollectionId
      ? `/api/portfolios/${portfolioId}/notes?offset=0&limit=${offsetRef.current + 20}&collection_id=${selectedCollectionId}`
      : `/api/portfolios/${portfolioId}/notes?offset=0&limit=${offsetRef.current + 20}`
    const response = await fetch(url)
    if (response.ok) {
      const result = await response.json()
      if (result.success && result.notes) {
        const filteredNotes = result.notes.filter((note: Note) => !pinnedNoteIds.has(note.id))
        setNotes(filteredNotes)
        offsetRef.current = filteredNotes.length
      }
    }
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <UIText className="text-red-500">{error}</UIText>
      </div>
    )
  }

  // Show collection tabs only for projects with collections
  const showCollectionTabs = isProjectPortfolio(portfolio) && collections.length > 0

  // Pinned notes are always shown regardless of collection selection
  const filteredPinnedNotes = pinnedNotes

  // Filter regular notes - when collection is selected, API already filters by collection
  // When no collection is selected, filter out pinned notes
  const filteredNotes = selectedCollectionId
    ? notes // API already filtered by collection, so include all returned notes
    : notes.filter((note: Note) => !pinnedNoteIds.has(note.id))

  return (
    <div className="space-y-6">
      {/* Pinned Notes Section */}
      {filteredPinnedNotes.length > 0 && (
        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
            <UIText>Pins</UIText>
          </div>
          <NotesMasonry
            notes={filteredPinnedNotes}
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
      {filteredNotes.length > 0 || showCollectionTabs ? (
        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
            <UIText>Notes</UIText>
          </div>

          {/* Collection Tabs - only show for projects with collections, placed below Notes header */}
          {showCollectionTabs && (
            <div
              className="relative w-full pb-2"
              onMouseEnter={() => setIsHoveringTabs(true)}
              onMouseLeave={() => setIsHoveringTabs(false)}
            >
              <div className="flex items-center gap-2">
                {/* Scrollable tabs section - left aligned */}
                <div className="flex gap-2 overflow-x-auto scrollbar-hide items-center flex-1">
                  <button
                    onClick={() => {
                      if (!isEditMode) {
                        setSelectedCollectionId(null)
                      }
                    }}
                    disabled={isEditMode}
                    className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                      isEditMode
                        ? 'opacity-50 cursor-not-allowed'
                        : selectedCollectionId === null
                        ? 'bg-gray-200 text-gray-700'
                        : 'text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    All
                  </button>
                  {collections.map((collection) => (
                    <div
                      key={collection.id}
                      className="flex items-center"
                    >
                      {renamingCollectionId === collection.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveRename(collection.id)
                              } else if (e.key === 'Escape') {
                                handleCancelRename()
                              }
                            }}
                            autoFocus
                            className="px-4 py-2 rounded-lg text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => handleSaveRename(collection.id)}
                            className="p-1 rounded hover:bg-gray-200 transition-colors"
                            aria-label="Save"
                          >
                            <UIText className="text-sm">✓</UIText>
                          </button>
                          <button
                            onClick={handleCancelRename}
                            className="p-1 rounded hover:bg-gray-200 transition-colors"
                            aria-label="Cancel"
                          >
                            <UIText className="text-sm">×</UIText>
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              if (!isEditMode) {
                                setSelectedCollectionId(collection.id)
                              }
                            }}
                            disabled={isEditMode}
                            className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                              isEditMode
                                ? 'opacity-50 cursor-not-allowed'
                                : selectedCollectionId === collection.id
                                ? 'bg-gray-200 text-gray-700'
                                : 'text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {collection.name}
                          </button>
                          {isEditMode && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleStartRename(collection.id, collection.name)
                                }}
                                className="ml-1 p-1 rounded hover:bg-gray-200 transition-colors"
                                aria-label="Rename collection"
                              >
                                <Pencil className="w-4 h-4" strokeWidth={1.5} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteCollection(collection.id)
                                }}
                                disabled={deletingCollectionId === collection.id}
                                className="ml-1 p-1 rounded hover:bg-gray-300 transition-colors disabled:opacity-50"
                                aria-label="Delete collection"
                              >
                                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
                
                {/* Edit/Cancel button - fixed to right end, only visible on hover */}
                {(isHoveringTabs || isEditMode) && (
                  <div className="flex-shrink-0">
                    {!isEditMode ? (
                      <button
                        onClick={() => setIsEditMode(true)}
                        className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
                        aria-label="Edit collections"
                      >
                        <Edit className="w-4 h-4 text-gray-600" strokeWidth={1.5} />
                      </button>
                    ) : (
                      <button
                        onClick={() => setIsEditMode(false)}
                        className="px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {loading && !pinnedNotesLoaded ? (
            <div className="py-8 text-center">
              <UIText>Loading notes...</UIText>
            </div>
          ) : loading ? (
            <div className="py-4 text-center">
              <UIText>Loading...</UIText>
            </div>
          ) : filteredNotes.length > 0 ? (
            <NotesMasonry
              notes={filteredNotes}
              pinnedNoteIds={new Set()}
              portfolioId={portfolioId}
              currentUserId={currentUserId}
              canAnnotate={canCreateNote}
              onNoteDeleted={handleNoteDeleted}
              onNoteRemovedFromPortfolio={handleNoteRemovedFromPortfolio}
            />
          ) : (
            <div className="py-4 text-center">
              <UIText className="text-gray-500">No notes in this collection.</UIText>
            </div>
          )}
          
          {/* Load more trigger */}
          {hasMore && !selectedCollectionId && filteredNotes.length > 0 && !loading && (
            <div ref={loadMoreRef} className="py-4 text-center">
              {loadingMore ? (
                <UIText>Loading more notes...</UIText>
              ) : (
                <UIText className="text-gray-500">Scroll for more</UIText>
              )}
            </div>
          )}
        </div>
      ) : filteredPinnedNotes.length === 0 && !showCollectionTabs ? (
        <div className="py-12 text-center">
          <UIText className="text-gray-500">No notes yet.</UIText>
        </div>
      ) : null}
    </div>
  )
}

