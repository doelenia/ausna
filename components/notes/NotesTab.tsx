'use client'

import { useState, useEffect } from 'react'
import { Note } from '@/types/note'
import { getNotesByPortfolio } from '@/app/notes/actions'
import { NotesList } from './NotesList'
import Link from 'next/link'

interface NotesTabProps {
  portfolioId: string
  currentUserId?: string
  canCreateNote: boolean
}

export function NotesTab({
  portfolioId,
  currentUserId,
  canCreateNote,
}: NotesTabProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        // Fetch notes
        const notesResult = await getNotesByPortfolio(portfolioId)
        if (notesResult.success && notesResult.notes) {
          setNotes(notesResult.notes)
        } else {
          setError(notesResult.error || 'Failed to load notes')
        }
      } catch (err: any) {
        setError(err.message || 'An unexpected error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [portfolioId])

  const handleNoteDeleted = () => {
    // Refresh notes
    getNotesByPortfolio(portfolioId).then((result) => {
      if (result.success && result.notes) {
        setNotes(result.notes)
      }
    })
  }

  const handleNoteRemovedFromPortfolio = () => {
    // Refresh notes
    getNotesByPortfolio(portfolioId).then((result) => {
      if (result.success && result.notes) {
        setNotes(result.notes)
      }
    })
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-gray-500">
        Loading notes...
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-8 text-center text-red-500">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Create Note Button */}
      {canCreateNote && (
        <div>
          <Link
            href={`/notes/create?portfolio=${portfolioId}`}
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Create Note
          </Link>
        </div>
      )}

      {/* Notes List */}
      <NotesList
        notes={notes}
        portfolioId={portfolioId}
        currentUserId={currentUserId}
        canAnnotate={canCreateNote}
        onNoteDeleted={handleNoteDeleted}
        onNoteRemovedFromPortfolio={handleNoteRemovedFromPortfolio}
      />
    </div>
  )
}

