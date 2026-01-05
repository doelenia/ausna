'use client'

import { useState, useEffect } from 'react'
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
  const [pinOptions, setPinOptions] = useState<PinOption[]>([])
  const [loadingPins, setLoadingPins] = useState(true)
  const [pinning, setPinning] = useState<string | null>(null)

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

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
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

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg z-20 border border-gray-200">
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
            </div>
          </div>
        </>
      )}
    </div>
  )
}

