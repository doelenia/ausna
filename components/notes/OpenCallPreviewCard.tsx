'use client'

import { Note } from '@/types/note'
import { NoteCard } from './NoteCard'

interface OpenCallPreviewCardProps {
  note: Note & { first_project_name?: string }
  /** When true, card is stacked behind (slightly smaller) */
  stacked?: boolean
  currentUserId?: string
}

/**
 * Reuses NoteCard exact layout for open call preview.
 * Hides: text content, references, NoteActions, and interest pill.
 */
export function OpenCallPreviewCard({
  note,
  stacked = false,
  currentUserId,
}: OpenCallPreviewCardProps) {
  return (
    <div className={stacked ? 'scale-95 opacity-90' : ''}>
      <NoteCard
        note={note}
        currentUserId={currentUserId}
        isOpenCallPreview={true}
        showComments={false}
        flatOnMobile={false}
      />
    </div>
  )
}
