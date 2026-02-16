'use client'

import { useState, useEffect, useRef } from 'react'
import { Note } from '@/types/note'
import { Portfolio } from '@/types/portfolio'
import { createClient } from '@/lib/supabase/client'
import { addToPinned, removeFromPinned } from '@/app/portfolio/[type]/[id]/actions'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { UIText } from '@/components/ui'

interface NoteActionsProps {
  note: Note
  portfolioId?: string
  currentUserId?: string
  onDelete?: () => void
  onRemoveFromPortfolio?: () => void
  isDeleting?: boolean
  isRemoving?: boolean
}

interface PinOption {
  portfolioId: string
  portfolioName: string
  isPinned: boolean
  canPin: boolean
  pinCount: number
}

export function NoteActions({
  note,
  portfolioId,
  currentUserId,
  onDelete,
  onRemoveFromPortfolio,
  isDeleting = false,
  isRemoving = false,
}: NoteActionsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [pinOptions, setPinOptions] = useState<PinOption[]>([])
  const [loadingPins, setLoadingPins] = useState(true)
  const [pinning, setPinning] = useState<string | null>(null)
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([])
  const [noteCollectionIds, setNoteCollectionIds] = useState<string[]>([])
  const [loadingCollections, setLoadingCollections] = useState(true)
  const [updatingCollections, setUpdatingCollections] = useState(false)
  const [annotationPrivacy, setAnnotationPrivacy] = useState<'authors' | 'friends' | 'everyone' | null>(null)
  const [loadingPrivacy, setLoadingPrivacy] = useState(true)
  const [updatingPrivacy, setUpdatingPrivacy] = useState(false)

  // Fetch pin options (user's human portfolio and assigned projects)
  useEffect(() => {
    const fetchPinOptions = async () => {
      if (!currentUserId) {
        setLoadingPins(false)
        return
      }

      try {
        const supabase = createClient()
        const options: PinOption[] = []

        // Get user's human portfolio
        const { data: humanPortfolio } = await supabase
          .from('portfolios')
          .select('*')
          .eq('type', 'human')
          .eq('user_id', currentUserId)
          .maybeSingle()

        if (humanPortfolio) {
          const portfolio = humanPortfolio as Portfolio
          const metadata = portfolio.metadata as any
          const pinned = metadata?.pinned || []
          const pinnedArray = Array.isArray(pinned) ? pinned : []
          const isPinned = pinnedArray.some((item: any) => item.type === 'note' && item.id === note.id)
          const pinCount = pinnedArray.length
          const basic = getPortfolioBasic(portfolio)

          options.push({
            portfolioId: portfolio.id,
            portfolioName: 'my page',
            isPinned,
            canPin: pinCount < 9,
            pinCount,
          })
        }

        // Get assigned project portfolios
        if (note.assigned_portfolios && note.assigned_portfolios.length > 0) {
          const { data: projectPortfolios } = await supabase
            .from('portfolios')
            .select('*')
            .in('id', note.assigned_portfolios)
            .eq('type', 'projects')

          if (projectPortfolios) {
            for (const portfolio of projectPortfolios as Portfolio[]) {
              const metadata = portfolio.metadata as any
              const pinned = metadata?.pinned || []
              const pinnedArray = Array.isArray(pinned) ? pinned : []
              const isPinned = pinnedArray.some((item: any) => item.type === 'note' && item.id === note.id)
              const pinCount = pinnedArray.length
              const basic = getPortfolioBasic(portfolio)

              options.push({
                portfolioId: portfolio.id,
                portfolioName: basic.name,
                isPinned,
                canPin: pinCount < 9,
                pinCount,
              })
            }
          }
        }

        setPinOptions(options)
      } catch (error) {
        console.error('Error fetching pin options:', error)
      } finally {
        setLoadingPins(false)
      }
    }

    fetchPinOptions()
  }, [note.id, note.assigned_portfolios, currentUserId])

  // Fetch collections for the project portfolio
  useEffect(() => {
    const fetchCollections = async () => {
      if (!portfolioId || !note.assigned_portfolios || note.assigned_portfolios.length === 0) {
        setLoadingCollections(false)
        return
      }

      // Get the project portfolio ID (should be the first one)
      const projectPortfolioId = note.assigned_portfolios[0]

      setLoadingCollections(true)
      try {
        // Fetch all collections for the project
        const collectionsResponse = await fetch(`/api/collections?portfolio_id=${projectPortfolioId}`)
        if (collectionsResponse.ok) {
          const collectionsData = await collectionsResponse.json()
          if (collectionsData.success) {
            setCollections(collectionsData.collections || [])
          }
        }

        // Fetch note's current collections
        const noteCollectionsResponse = await fetch(`/api/notes/${note.id}/collections`)
        if (noteCollectionsResponse.ok) {
          const noteCollectionsData = await noteCollectionsResponse.json()
          if (noteCollectionsData.success) {
            setNoteCollectionIds((noteCollectionsData.collections || []).map((c: any) => c.id))
          }
        }
      } catch (error) {
        console.error('Error fetching collections:', error)
      } finally {
        setLoadingCollections(false)
      }
    }

    fetchCollections()
  }, [note.id, portfolioId, note.assigned_portfolios])

  // Fetch annotation privacy setting
  useEffect(() => {
    const fetchPrivacy = async () => {
      setLoadingPrivacy(true)
      try {
        // Get privacy from note prop if available, otherwise fetch
        if (note.annotation_privacy) {
          setAnnotationPrivacy(note.annotation_privacy)
        } else {
          const response = await fetch(`/api/notes/${note.id}`)
          if (response.ok) {
            const data = await response.json()
            if (data.success && data.note) {
              setAnnotationPrivacy(data.note.annotation_privacy || 'everyone')
            }
          }
        }
      } catch (error) {
        console.error('Error fetching annotation privacy:', error)
      } finally {
        setLoadingPrivacy(false)
      }
    }

    fetchPrivacy()
  }, [note.id, note.annotation_privacy])

  const handlePrivacyChange = async (privacy: 'authors' | 'friends' | 'everyone') => {
    if (updatingPrivacy || privacy === annotationPrivacy) return

    setUpdatingPrivacy(true)
    try {
      const response = await fetch(`/api/notes/${note.id}/annotation-privacy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotation_privacy: privacy }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setAnnotationPrivacy(privacy)
        } else {
          alert(data.error || 'Failed to update annotation privacy')
        }
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to update annotation privacy')
      }
    } catch (error: any) {
      console.error('Error updating annotation privacy:', error)
      alert(error.message || 'Failed to update annotation privacy')
    } finally {
      setUpdatingPrivacy(false)
      setIsOpen(false)
    }
  }

  const handlePinToggle = async (option: PinOption) => {
    if (pinning) return

    setPinning(option.portfolioId)
    try {
      if (option.isPinned) {
        const result = await removeFromPinned(option.portfolioId, 'note', note.id)
        if (result.success) {
          setPinOptions(prev =>
            prev.map(opt =>
              opt.portfolioId === option.portfolioId
                ? { ...opt, isPinned: false, pinCount: opt.pinCount - 1, canPin: true }
                : opt
            )
          )
        } else {
          alert(result.error || 'Failed to remove from pinned')
        }
      } else {
        if (!option.canPin) {
          alert('Pinned list is full (maximum 9 items)')
          setPinning(null)
          return
        }
        const result = await addToPinned(option.portfolioId, 'note', note.id)
        if (result.success) {
          setPinOptions(prev =>
            prev.map(opt =>
              opt.portfolioId === option.portfolioId
                ? { ...opt, isPinned: true, pinCount: opt.pinCount + 1, canPin: opt.pinCount + 1 < 9 }
                : opt
            )
          )
        } else {
          alert(result.error || 'Failed to add to pinned')
        }
      }
    } catch (error: any) {
      console.error('Error toggling pin:', error)
      alert(error.message || 'An unexpected error occurred')
    } finally {
      setPinning(null)
    }
  }

  const handleCollectionToggle = async (collectionId: string) => {
    if (updatingCollections) return

    setUpdatingCollections(true)
    try {
      const newCollectionIds = noteCollectionIds.includes(collectionId)
        ? noteCollectionIds.filter((id) => id !== collectionId)
        : [...noteCollectionIds, collectionId]

      const response = await fetch(`/api/notes/${note.id}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection_ids: newCollectionIds }),
      })

      if (response.ok) {
        setNoteCollectionIds(newCollectionIds)
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to update collections')
      }
    } catch (error: any) {
      console.error('Error updating collections:', error)
      alert(error.message || 'Failed to update collections')
    } finally {
      setUpdatingCollections(false)
    }
  }

  // Calculate dropdown position when opening
  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 8, // 8px = mt-2 equivalent
        right: window.innerWidth - rect.right,
      })
    }
    setIsOpen(!isOpen)
  }

  // Update position on scroll/resize when open
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const updatePosition = () => {
        if (buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect()
          setDropdownPosition({
            top: rect.bottom + 8,
            right: window.innerWidth - rect.right,
          })
        }
      }

      window.addEventListener('scroll', updatePosition, true)
      window.addEventListener('resize', updatePosition)

      return () => {
        window.removeEventListener('scroll', updatePosition, true)
        window.removeEventListener('resize', updatePosition)
      }
    }
  }, [isOpen])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="p-1 text-gray-400 hover:text-gray-600 rounded"
        aria-label="Note actions"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
          />
        </svg>
      </button>

      {isOpen && dropdownPosition && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div 
            className="fixed w-56 bg-white rounded-md shadow-lg z-50 border border-gray-200"
            style={{
              top: `${dropdownPosition.top}px`,
              right: `${dropdownPosition.right}px`,
            }}
          >
            <div className="py-1">
              {/* Pin options */}
              {!loadingPins && pinOptions.length > 0 && (
                <>
                  {pinOptions.map((option) => (
                    <button
                      key={option.portfolioId}
                      onClick={() => {
                        setIsOpen(false)
                        handlePinToggle(option)
                      }}
                      disabled={pinning === option.portfolioId || (!option.isPinned && !option.canPin)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {pinning === option.portfolioId
                        ? 'Updating...'
                        : option.isPinned
                        ? option.portfolioName === 'my page'
                          ? 'Remove from my pin'
                          : `Remove from ${option.portfolioName}'s pin`
                        : option.portfolioName === 'my page'
                        ? 'Pin to my page'
                        : `Pin to ${option.portfolioName}`}
                    </button>
                  ))}
                  {pinOptions.length > 0 && <div className="border-t border-gray-200 my-1" />}
                </>
              )}
              {onDelete && (
                <button
                  onClick={() => {
                    setIsOpen(false)
                    onDelete()
                  }}
                  disabled={isDeleting}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Note'}
                </button>
              )}
              {onRemoveFromPortfolio && portfolioId && (
                <button
                  onClick={() => {
                    setIsOpen(false)
                    onRemoveFromPortfolio()
                  }}
                  disabled={isRemoving}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {isRemoving ? 'Removing...' : 'Remove from Portfolio'}
                </button>
              )}
              
              {/* Annotation Privacy - only show for note owner */}
              {currentUserId === note.owner_account_id && (
                <>
                  <div className="border-t border-gray-200 my-1" />
                  <div className="px-4 py-2">
                    <UIText className="text-xs font-medium text-gray-500 mb-2">Who can comment</UIText>
                    {loadingPrivacy ? (
                      <UIText className="text-xs text-gray-500">Loading...</UIText>
                    ) : (
                      <div className="space-y-1">
                        {(['everyone', 'friends', 'authors'] as const).map((privacy) => (
                          <button
                            key={privacy}
                            onClick={() => handlePrivacyChange(privacy)}
                            disabled={updatingPrivacy}
                            className={`w-full text-left px-2 py-1 text-xs rounded transition-colors disabled:opacity-50 ${
                              annotationPrivacy === privacy
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {annotationPrivacy === privacy ? '✓ ' : ''}
                            {privacy === 'everyone' && 'Everyone'}
                            {privacy === 'friends' && 'Friends only'}
                            {privacy === 'authors' && 'Authors only'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Collection assignment - only show if there are collections or if we're still loading */}
              {(loadingCollections || collections.length > 0) && (
                <>
                  <div className="border-t border-gray-200 my-1" />
                  <div className="px-4 py-2">
                    <UIText className="text-xs font-medium text-gray-500 mb-2">Collections</UIText>
                    {loadingCollections ? (
                      <UIText className="text-xs text-gray-500">Loading...</UIText>
                    ) : collections.length === 0 ? (
                      <UIText className="text-xs text-gray-500">No collections available</UIText>
                    ) : (
                      <div className="space-y-1">
                        {collections.map((collection) => (
                          <button
                            key={collection.id}
                            onClick={() => {
                              handleCollectionToggle(collection.id)
                            }}
                            disabled={updatingCollections}
                            className={`w-full text-left px-2 py-1 text-xs rounded transition-colors disabled:opacity-50 ${
                              noteCollectionIds.includes(collection.id)
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {noteCollectionIds.includes(collection.id) ? '✓ ' : ''}
                            {collection.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

