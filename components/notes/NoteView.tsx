'use client'

import { useState } from 'react'
import { Note, NoteReference, ImageReference, UrlReference } from '@/types/note'
import { deleteNote } from '@/app/notes/actions'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { NoteActions } from './NoteActions'
import { Portfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { isHumanPortfolio, isProjectPortfolio, isCommunityPortfolio } from '@/types/portfolio'
import { NoteCard } from './NoteCard'
import { getUrlDisplayInfo, getFaviconUrl } from '@/lib/notes/url-helpers'

interface SendToAuthorButtonProps {
  noteId: string
  authorId: string
}

function SendToAuthorButton({ noteId, authorId }: SendToAuthorButtonProps) {
  const router = useRouter()
  const [isSending, setIsSending] = useState(false)

  const handleSendToAuthor = async () => {
    setIsSending(true)
    try {
      // Send the note directly
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receiver_id: authorId,
          text: '',
          note_id: noteId,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send note')
      }

      // Navigate to messages page with the author's userId
      router.push(`/messages?userId=${authorId}`)
    } catch (error) {
      console.error('Error sending note:', error)
      alert('Failed to send note')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <button
      onClick={handleSendToAuthor}
      disabled={isSending}
      className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    >
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
      {isSending ? 'Opening messages...' : 'Send to Author'}
    </button>
  )
}

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
      router.back()
    } else {
      alert(result.error || 'Failed to delete note')
      setIsDeleting(false)
    }
  }

  const renderReference = (ref: NoteReference, index: number) => {
    if (ref.type === 'image') {
      const imageRef = ref as ImageReference
      return (
        <div key={index} className="rounded-lg overflow-hidden">
          <img
            src={imageRef.url}
            alt={`Note image ${index + 1}`}
            className="w-full h-auto max-h-96 object-contain"
          />
        </div>
      )
    } else if (ref.type === 'url') {
      const urlRef = ref as UrlReference
      
      // Always get host name and icon (with fallbacks)
      const { hostName: displayHostName, hostIcon: displayHostIcon } = getUrlDisplayInfo(urlRef)
      
      return (
        <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          {urlRef.headerImage && (
            <img
              src={urlRef.headerImage}
              alt={urlRef.title || 'URL preview'}
              className="w-full h-48 object-cover rounded mb-3"
            />
          )}
          <div className="flex items-start gap-3">
            {/* Always show host icon */}
            <img
              src={displayHostIcon}
              alt={displayHostName}
              className="w-6 h-6 rounded flex-shrink-0"
              onError={(e) => {
                // Fallback to a default icon if image fails to load
                const target = e.target as HTMLImageElement
                target.src = `https://www.google.com/s2/favicons?domain=${displayHostName}&sz=64`
              }}
            />
            <div className="flex-1">
              {urlRef.title && (
                <h4 className="font-semibold text-gray-900 mb-1">{urlRef.title}</h4>
              )}
              {urlRef.description && (
                <p className="text-sm text-gray-600 mb-2">{urlRef.description}</p>
              )}
              {/* Always show host name */}
              <a
                href={urlRef.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline"
              >
                {displayHostName}
              </a>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  // Organize portfolios: human (owner first), then projects, then communities
  const organizedHumanPortfolios: Portfolio[] = []
  const projectPortfolios: Portfolio[] = []
  const communityPortfolios: Portfolio[] = []

  // Organize human portfolios (note owner first)
  humanPortfolios.forEach((portfolio) => {
    if (portfolio.user_id === note.owner_account_id) {
      organizedHumanPortfolios.unshift(portfolio)
    } else {
      organizedHumanPortfolios.push(portfolio)
    }
  })

  // Organize other portfolios
  portfolios.forEach((portfolio) => {
    if (isProjectPortfolio(portfolio)) {
      projectPortfolios.push(portfolio)
    } else if (isCommunityPortfolio(portfolio)) {
      communityPortfolios.push(portfolio)
    }
  })

  const renderPortfolioAvatar = (portfolio: Portfolio) => {
    const basic = getPortfolioBasic(portfolio)
    const avatarUrl = basic.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(basic.name)}&background=random`
    
    return (
      <Link
        key={portfolio.id}
        href={getPortfolioUrl(portfolio.type, portfolio.id)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <img
          src={avatarUrl}
          alt={basic.name}
          className="h-10 w-10 rounded-full object-cover border-2 border-gray-300"
        />
        <span className="text-sm font-medium text-gray-700">{basic.name}</span>
      </Link>
    )
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      {/* Portfolios Section - 3 rows: Creators, Projects, Communities */}
      {(organizedHumanPortfolios.length > 0 || projectPortfolios.length > 0 || communityPortfolios.length > 0) && (
        <div className="mb-6 pb-6 border-b border-gray-200 space-y-4">
          {/* Creators Row */}
          {organizedHumanPortfolios.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-700 mb-3">Creators</h2>
              <div className="flex flex-wrap gap-3">
                {organizedHumanPortfolios.map((portfolio) => renderPortfolioAvatar(portfolio))}
              </div>
            </div>
          )}

          {/* Projects Row */}
          {projectPortfolios.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-700 mb-3">Projects</h2>
              <div className="flex flex-wrap gap-3">
                {projectPortfolios.map((portfolio) => renderPortfolioAvatar(portfolio))}
              </div>
            </div>
          )}

          {/* Communities Row */}
          {communityPortfolios.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-700 mb-3">Communities</h2>
              <div className="flex flex-wrap gap-3">
                {communityPortfolios.map((portfolio) => renderPortfolioAvatar(portfolio))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/portfolio/human/${note.owner_account_id}`}
            className="text-sm font-medium text-gray-900 hover:text-blue-600"
          >
            User {note.owner_account_id.slice(0, 8)}
          </Link>
          <span className="text-sm text-gray-500">
            {new Date(note.created_at).toLocaleDateString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && (
            <NoteActions
              note={note}
              portfolioId={annotatePortfolioId}
              onDelete={handleDelete}
              isDeleting={isDeleting}
            />
          )}
        </div>
      </div>

      {/* Text content */}
      <div className="mb-4">
        <p className="text-gray-900 whitespace-pre-wrap">{note.text}</p>
      </div>

      {/* References */}
      {note.references && note.references.length > 0 && (
        <div className="mb-4 space-y-3">
          {note.references.map((ref, index) => renderReference(ref, index))}
        </div>
      )}

      {/* Mentioned note */}
      {note.mentioned_note_id && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          {referencedNoteDeleted ? (
            <p className="text-sm text-gray-600 italic">
              Annotating: <span className="text-gray-500">Note (deleted)</span>
            </p>
          ) : (
            <p className="text-sm text-blue-700">
              Annotating:{' '}
              <Link
                href={`/notes/${note.mentioned_note_id}`}
                className="font-medium hover:underline"
              >
                Note {note.mentioned_note_id.slice(0, 8)}
              </Link>
            </p>
          )}
        </div>
      )}

      {/* Send to Author Button - Only show if not the owner and user is authenticated */}
      {currentUserId && currentUserId !== note.owner_account_id && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <SendToAuthorButton noteId={note.id} authorId={note.owner_account_id} />
        </div>
      )}
    </div>
  )
}

