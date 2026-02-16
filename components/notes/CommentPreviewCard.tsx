'use client'

import { Note } from '@/types/note'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Portfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { ImageReference } from '@/types/note'
import { UIText } from '@/components/ui'
import { formatRelativeTime } from '@/lib/formatRelativeTime'

interface CommentPreviewCardProps {
  noteId: string
  annotationId?: string | null
  isSent: boolean
  currentUserId?: string | null
}

export function CommentPreviewCard({ noteId, annotationId, isSent, currentUserId }: CommentPreviewCardProps) {
  const [note, setNote] = useState<Note | null>(null)
  const [ownerPortfolio, setOwnerPortfolio] = useState<Portfolio | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchNote = async () => {
      try {
        const supabase = createClient()
        // For comment previews, the message stores root note_id + annotation_id; the comment (annotation) is the one we want for author and content.
        const idToFetch = annotationId ?? noteId
        const { data: noteData, error: noteError } = await supabase
          .from('notes')
          .select('*')
          .eq('id', idToFetch)
          .maybeSingle()

        if (noteError || !noteData || noteData.deleted_at) {
          setLoading(false)
          return
        }

        setNote(noteData as Note)

        const { data: portfolio } = await supabase
          .from('portfolios')
          .select('*')
          .eq('type', 'human')
          .eq('user_id', noteData.owner_account_id)
          .maybeSingle()

        if (portfolio) setOwnerPortfolio(portfolio as Portfolio)
      } catch (error) {
        console.error('Error loading note for comment preview:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchNote()
  }, [noteId, annotationId])

  if (loading) {
    return (
      <div className={`max-w-xs lg:max-w-md p-3 rounded-lg ${isSent ? 'bg-blue-50' : 'bg-gray-100'}`}>
        <UIText className="text-sm text-gray-500">Loading...</UIText>
      </div>
    )
  }

  if (!note) {
    return (
      <div className={`max-w-xs lg:max-w-md p-3 rounded-lg border border-gray-300 ${isSent ? 'bg-blue-50' : 'bg-gray-100'}`}>
        <UIText className="text-sm text-gray-500 italic">Note is no longer available</UIText>
      </div>
    )
  }

  const viewHref = `/notes/${noteId}${annotationId ? `#annotation-${annotationId}` : ''}`
  const ownerBasic = ownerPortfolio ? getPortfolioBasic(ownerPortfolio) : null
  const ownerName = (currentUserId && note.owner_account_id === currentUserId)
    ? 'You'
    : (ownerBasic?.name || `User ${note.owner_account_id.slice(0, 8)}`)

  const firstImageRef = note.references?.find((ref): ref is ImageReference => ref.type === 'image')

  return (
    <Link
      href={viewHref}
      prefetch={true}
      className={`block max-w-xs lg:max-w-md border rounded-lg overflow-hidden ${isSent ? 'border-blue-300 bg-blue-50' : 'border-gray-300 bg-gray-50'} hover:opacity-90 transition-opacity cursor-pointer`}
    >
      <div className="p-3">
        <UIText className="text-xs font-medium text-blue-700 mb-2 block">Sent you a comment on:</UIText>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-gray-700">{ownerName}</span>
          <span className="text-xs text-gray-500">{formatRelativeTime(note.created_at)}</span>
        </div>
        <p className={`text-sm whitespace-pre-wrap line-clamp-3 ${isSent ? 'text-gray-800' : 'text-gray-900'}`}>
          {note.text}
        </p>
        {firstImageRef && (
          <div className="mt-2 rounded-lg overflow-hidden">
            <img src={firstImageRef.url} alt="" className="w-full h-auto max-h-48 object-contain" />
          </div>
        )}
        <div className="mt-2 pt-2 border-t border-gray-300">
          <p className="text-xs text-blue-600 hover:underline">View comment →</p>
        </div>
      </div>
    </Link>
  )
}
