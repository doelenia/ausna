'use client'

import { useState, useEffect } from 'react'
import { getEligibleItemsForPinning, updatePinnedList } from '@/app/portfolio/[type]/[id]/actions'
import { PinnedItem } from '@/types/portfolio'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface EligibleItem {
  type: 'portfolio' | 'note'
  id: string
  name?: string
  text?: string
  avatar?: string
  slug?: string
  role?: 'manager' | 'member' // Role of the current user in this portfolio (for human portfolios)
  isPinned: boolean
}

interface EditPinnedViewProps {
  portfolioId: string
  portfolioType: string
}

export function EditPinnedView({ portfolioId, portfolioType }: EditPinnedViewProps) {
  const [activeTab, setActiveTab] = useState<'notes' | 'portfolios'>('notes')
  const [notes, setNotes] = useState<EligibleItem[]>([])
  const [portfolios, setPortfolios] = useState<EligibleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pinnedItems, setPinnedItems] = useState<PinnedItem[]>([])
  const router = useRouter()

  useEffect(() => {
    const fetchEligibleItems = async () => {
      setLoading(true)
      setError(null)
      
      const result = await getEligibleItemsForPinning(portfolioId)
      
      if (result.success) {
        setNotes(result.notes || [])
        setPortfolios(result.portfolios || [])
        
        // Build pinned items array from the data
        const pinned: PinnedItem[] = []
        result.notes?.forEach((note) => {
          if (note.isPinned) {
            pinned.push({ type: 'note', id: note.id })
          }
        })
        result.portfolios?.forEach((portfolio) => {
          if (portfolio.isPinned) {
            pinned.push({ type: 'portfolio', id: portfolio.id })
          }
        })
        setPinnedItems(pinned)
      } else {
        setError(result.error || 'Failed to load items')
      }
      
      setLoading(false)
    }

    fetchEligibleItems()
  }, [portfolioId])

  const togglePinned = (itemType: 'portfolio' | 'note', itemId: string) => {
    const isCurrentlyPinned = pinnedItems.some(
      (item) => item.type === itemType && item.id === itemId
    )

    let updatedPinned: PinnedItem[]
    if (isCurrentlyPinned) {
      // Remove from pinned
      updatedPinned = pinnedItems.filter(
        (item) => !(item.type === itemType && item.id === itemId)
      )
    } else {
      // Add to pinned (check max 9)
      if (pinnedItems.length >= 9) {
        setError('Maximum 9 items can be pinned')
        return
      }
      updatedPinned = [...pinnedItems, { type: itemType, id: itemId }]
    }

    setPinnedItems(updatedPinned)

    // Update local state to reflect changes
    if (itemType === 'note') {
      setNotes((prev) =>
        prev.map((note) =>
          note.id === itemId ? { ...note, isPinned: !note.isPinned } : note
        )
      )
    } else {
      setPortfolios((prev) =>
        prev.map((portfolio) =>
          portfolio.id === itemId
            ? { ...portfolio, isPinned: !portfolio.isPinned }
            : portfolio
        )
      )
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    const result = await updatePinnedList(portfolioId, pinnedItems)

    if (result.success) {
      router.push(`/portfolio/${portfolioType}/${portfolioId}`)
      router.refresh()
    } else {
      setError(result.error || 'Failed to save pinned list')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-gray-500">
        Loading...
      </div>
    )
  }

  if (error && !saving) {
    return (
      <div className="py-8 text-center text-red-500">
        {error}
      </div>
    )
  }

  const currentItems = activeTab === 'notes' ? notes : portfolios
  const tabLabel = portfolioType === 'human' ? 'Involvement' : 'Navigations'

  return (
    <div className="space-y-6">
      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          Select items to pin (maximum 9 items). Click on an item to toggle its pinned status.
        </p>
        <p className="text-sm text-blue-700 mt-1">
          Currently pinned: {pinnedItems.length} / 9
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('notes')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'notes'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Notes ({notes.length})
          </button>
          <button
            onClick={() => setActiveTab('portfolios')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'portfolios'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tabLabel} ({portfolios.length})
          </button>
        </nav>
      </div>

      {/* Items List */}
      <div className="space-y-4">
        {currentItems.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            {activeTab === 'notes' ? 'No notes found' : `No ${tabLabel.toLowerCase()} found`}
          </div>
        ) : (
          currentItems.map((item) => {
            const isPinned = pinnedItems.some(
              (pinned) => pinned.type === item.type && pinned.id === item.id
            )

            if (item.type === 'note') {
              return (
                <div
                  key={`note-${item.id}`}
                  className={`flex items-center justify-between p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                    isPinned
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  onClick={() => togglePinned('note', item.id)}
                >
                  <div className="flex-1">
                    <p className="text-gray-900 text-sm line-clamp-2">
                      {item.text}
                    </p>
                  </div>
                  <div className="ml-4">
                    {isPinned ? (
                      <div className="flex items-center gap-2 text-blue-600">
                        <svg
                          className="w-5 h-5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="text-sm font-medium">Pinned</span>
                      </div>
                    ) : (
                      <div className="text-gray-400">
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
                            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              )
            } else {
              return (
                <div
                  key={`portfolio-${item.id}`}
                  className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                    isPinned
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  onClick={() => togglePinned('portfolio', item.id)}
                >
                  {item.avatar ? (
                    <img
                      src={item.avatar}
                      alt={item.name}
                      className="w-16 h-16 object-cover rounded flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-600 rounded flex items-center justify-center flex-shrink-0">
                      <svg
                        className="h-8 w-8 text-white opacity-50"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                        />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{item.name}</h3>
                      {item.role && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          item.role === 'manager'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {item.role === 'manager' ? 'Manager' : 'Member'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    {isPinned ? (
                      <div className="flex items-center gap-2 text-blue-600">
                        <svg
                          className="w-5 h-5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="text-sm font-medium">Pinned</span>
                      </div>
                    ) : (
                      <div className="text-gray-400">
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
                            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              )
            }
          })
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
        <Link
          href={`/portfolio/${portfolioType}/${portfolioId}`}
          className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
        >
          Cancel
        </Link>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

