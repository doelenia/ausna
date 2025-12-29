'use client'

import { Note } from '@/types/note'
import { NoteCard } from './NoteCard'

interface NotesListProps {
  notes: Note[]
  portfolioId?: string
  currentUserId?: string
  canAnnotate?: boolean
  onNoteDeleted?: () => void
  onNoteRemovedFromPortfolio?: () => void
}

export function NotesList({
  notes,
  portfolioId,
  currentUserId,
  canAnnotate = false,
  onNoteDeleted,
  onNoteRemovedFromPortfolio,
}: NotesListProps) {
  if (notes.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500">
        <p>No notes yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {notes.map((note) => (
        <div key={note.id} id={`note-${note.id}`}>
          <NoteCard
            note={note}
            portfolioId={portfolioId}
            currentUserId={currentUserId}
            onDeleted={onNoteDeleted}
            onRemovedFromPortfolio={onNoteRemovedFromPortfolio}
          />
        </div>
      ))}
    </div>
  )
}

