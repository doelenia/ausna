'use client'

import { useState } from 'react'
import { Note } from '@/types/note'

interface NoteActionsProps {
  note: Note
  portfolioId?: string
  onDelete?: () => void
  onRemoveFromPortfolio?: () => void
  isDeleting?: boolean
  isRemoving?: boolean
}

export function NoteActions({
  note,
  portfolioId,
  onDelete,
  onRemoveFromPortfolio,
  isDeleting = false,
  isRemoving = false,
}: NoteActionsProps) {
  const [isOpen, setIsOpen] = useState(false)

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
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border border-gray-200">
            <div className="py-1">
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

