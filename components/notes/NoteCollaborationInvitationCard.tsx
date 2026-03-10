'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Note } from '@/types/note'
import { Portfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { NoteReference, ImageReference, UrlReference } from '@/types/note'
import { getUrlDisplayInfo } from '@/lib/notes/url-helpers'
import { Button, UIText, UIButtonText } from '@/components/ui'

interface NoteCollaborationInvitationCardProps {
  noteId: string
  isSent: boolean
  currentUserId?: string | null
  /** When provided and isSent=false, show Accept/Decline buttons */
  invite?: {
    id: string
    note_id: string
    inviter_id: string
    invitee_id: string
    status: string
  } | null
  onAccept?: (noteId: string, inviteId: string) => void
  onDecline?: (noteId: string, inviteId: string) => void
}

export function NoteCollaborationInvitationCard({
  noteId,
  isSent,
  currentUserId,
  invite,
  onAccept,
  onDecline,
}: NoteCollaborationInvitationCardProps) {
  const [note, setNote] = useState<Note | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [ownerPortfolio, setOwnerPortfolio] = useState<Portfolio | null>(null)

  useEffect(() => {
    const fetchNote = async () => {
      try {
        const supabase = createClient()
        const { data: noteData, error: noteError } = await supabase
          .from('notes')
          .select('*')
          .eq('id', noteId)
          .maybeSingle()

        if (noteError || !noteData || noteData.deleted_at) {
          setNotFound(true)
          setLoading(false)
          return
        }

        setNote(noteData as Note)

        const { data: ownerPortfolios } = await supabase
          .from('portfolios')
          .select('*')
          .eq('type', 'human')
          .eq('user_id', noteData.owner_account_id)
          .maybeSingle()

        if (ownerPortfolios) {
          setOwnerPortfolio(ownerPortfolios as Portfolio)
        }
      } catch (error) {
        console.error('Error fetching note:', error)
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }

    fetchNote()
  }, [noteId])

  const renderReference = (ref: NoteReference, index: number) => {
    if (ref.type === 'image') {
      const imageRef = ref as ImageReference
      return (
        <img
          key={index}
          src={imageRef.url}
          alt={`Note image ${index + 1}`}
          className="w-12 h-12 object-cover rounded"
        />
      )
    } else if (ref.type === 'url') {
      const urlRef = ref as UrlReference
      const { hostIcon } = getUrlDisplayInfo(urlRef)
      return (
        <img
          key={index}
          src={hostIcon}
          alt=""
          className="w-8 h-8 rounded"
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.src = 'https://ui-avatars.com/api/?name=link&background=gray'
          }}
        />
      )
    }
    return null
  }

  const showAcceptDecline = !isSent && invite && invite.status === 'pending' && onAccept && onDecline

  if (loading) {
    return (
      <div
        className={`max-w-xs lg:max-w-md rounded-lg border-2 p-4 ${
          isSent ? 'border-blue-400' : 'border-gray-300'
        }`}
      >
        <UIText>Loading note...</UIText>
      </div>
    )
  }

  if (notFound || !note) {
    return (
      <div
        className={`max-w-xs lg:max-w-md rounded-lg border-2 p-4 ${
          isSent ? 'border-blue-400' : 'border-gray-300'
        }`}
      >
        <UIText className="italic">Note is no longer available</UIText>
      </div>
    )
  }

  const ownerBasic = ownerPortfolio ? getPortfolioBasic(ownerPortfolio) : null
  const ownerName =
    currentUserId && note.owner_account_id === currentUserId
      ? 'You'
      : ownerBasic?.name || `User ${note.owner_account_id.slice(0, 8)}`

  return (
    <div
      className={`max-w-xs lg:max-w-md rounded-lg border-2 overflow-hidden transition-all ${
        isSent ? 'border-blue-400 bg-transparent' : 'border-gray-300 bg-transparent'
      }`}
    >
      <Link
        href={`/notes/${note.id}`}
        className="block p-3 hover:opacity-90 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex">
          {/* Thumbnail / preview */}
          <div className="flex-shrink-0 w-20 h-20 flex items-center justify-center gap-1 bg-gray-100 rounded overflow-hidden">
            {note.references && note.references.length > 0 ? (
              <div className="flex flex-wrap gap-0.5 p-1">
                {note.references.slice(0, 4).map((ref, i) => renderReference(ref, i))}
              </div>
            ) : (
              <svg
                className={`h-10 w-10 ${isSent ? 'text-blue-500' : 'text-gray-400'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 p-3 min-w-0">
            <h3
              className={`font-semibold truncate ${isSent ? 'text-blue-900' : 'text-gray-900'}`}
            >
              Invited you to collaborate on a note
            </h3>
            <p className={`text-xs mt-1 line-clamp-2 ${isSent ? 'text-blue-700' : 'text-gray-600'}`}>
              {note.text || 'No description'}
            </p>
            <UIButtonText as="span" className="text-xs text-gray-500 mt-1 block">
              by {ownerName}
            </UIButtonText>
          </div>
        </div>
      </Link>

      {showAcceptDecline && (
        <div className="px-3 pb-3 pt-0 flex gap-2">
          <Button
            variant="success"
            size="sm"
            className="flex-1"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onAccept(invite.note_id, invite.id)
            }}
          >
            <UIText>Accept</UIText>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDecline(invite.note_id, invite.id)
            }}
          >
            <UIText>Decline</UIText>
          </Button>
        </div>
      )}
    </div>
  )
}
