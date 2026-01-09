'use client'

import { useState } from 'react'
import { Note } from '@/types/note'
import { deleteNote } from '@/app/notes/actions'
import { useRouter } from 'next/navigation'
import { Portfolio } from '@/types/portfolio'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { NoteCard } from './NoteCard'
import { UIText } from '@/components/ui'

interface NoteViewProps {
  note: Note
  annotations: Note[]
  portfolios: Portfolio[]
  humanPortfolios: Portfolio[]
  currentUserId?: string
  canAnnotate: boolean
  annotatePortfolioId?: string
  referencedNoteDeleted?: boolean
}

export function NoteView({
  note,
  annotations,
  portfolios,
  humanPortfolios,
  currentUserId,
  canAnnotate,
  annotatePortfolioId,
  referencedNoteDeleted = false,
}: NoteViewProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const isOwner = currentUserId ? note.owner_account_id === currentUserId : false

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
      return
    }

    setIsDeleting(true)
    const result = await deleteNote(note.id)

    if (result.success) {
      // Navigate to first portfolio if available, otherwise to main feed
      if (portfolios && portfolios.length > 0) {
        const firstPortfolio = portfolios[0]
        router.push(getPortfolioUrl(firstPortfolio.type, firstPortfolio.id))
      } else {
        router.push('/main')
      }
    } else {
      alert(result.error || 'Failed to delete note')
      setIsDeleting(false)
    }
  }

  // Get first portfolio ID for NoteCard
  const firstPortfolioId = portfolios && portfolios.length > 0 ? portfolios[0].id : annotatePortfolioId

  return (
    <div className="bg-white md:bg-transparent space-y-6 md:py-10 md:space-y-8">
      {/* Note Card - using unified NoteCard component */}
      <NoteCard
        note={note}
        portfolioId={firstPortfolioId}
        currentUserId={currentUserId}
        isViewMode={true}
        flatOnMobile={true}
        onDeleted={handleDelete}
      />

      {/* Annotations Section */}
      {annotations && annotations.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <UIText as="h2" className="mb-4">Annotations</UIText>
          <div className="space-y-4">
            {annotations.map((annotation) => (
              <NoteCard
                key={annotation.id}
                note={annotation}
                currentUserId={currentUserId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

