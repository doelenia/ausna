'use client'

import { Note } from '@/types/note'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Portfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { getUrlDisplayInfo } from '@/lib/notes/url-helpers'
import { NoteReference, ImageReference, UrlReference } from '@/types/note'

interface MessageNoteCardProps {
  noteId: string
  isSent: boolean
}

export function MessageNoteCard({ noteId, isSent }: MessageNoteCardProps) {
  const [note, setNote] = useState<Note | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [ownerPortfolio, setOwnerPortfolio] = useState<Portfolio | null>(null)

  useEffect(() => {
    const fetchNote = async () => {
      try {
        const supabase = createClient()
        
        // Fetch the note
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

        // Fetch owner's human portfolio
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
        <div key={index} className="rounded-lg overflow-hidden">
          <img
            src={imageRef.url}
            alt={`Note image ${index + 1}`}
            className="w-full h-auto max-h-48 object-contain"
          />
        </div>
      )
    } else if (ref.type === 'url') {
      const urlRef = ref as UrlReference
      const { hostName: displayHostName, hostIcon: displayHostIcon } = getUrlDisplayInfo(urlRef)
      
      return (
        <div key={index} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
          {urlRef.headerImage && (
            <img
              src={urlRef.headerImage}
              alt={urlRef.title || 'URL preview'}
              className="w-full h-32 object-cover rounded mb-2"
            />
          )}
          <div className="flex items-start gap-2">
            <img
              src={displayHostIcon}
              alt={displayHostName}
              className="w-5 h-5 rounded flex-shrink-0"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.src = `https://www.google.com/s2/favicons?domain=${displayHostName}&sz=64`
              }}
            />
            <div className="flex-1 min-w-0">
              {urlRef.title && (
                <h4 className="font-semibold text-sm text-gray-900 mb-1 truncate">{urlRef.title}</h4>
              )}
              {urlRef.description && (
                <p className="text-xs text-gray-600 mb-1 line-clamp-2">{urlRef.description}</p>
              )}
              <a
                href={urlRef.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline truncate block"
                onClick={(e) => e.stopPropagation()}
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

  if (loading) {
    return (
      <div className={`max-w-xs lg:max-w-md p-3 rounded-lg ${
        isSent ? 'bg-blue-50' : 'bg-gray-100'
      }`}>
        <p className="text-sm text-gray-500">Loading note...</p>
      </div>
    )
  }

  if (notFound || !note) {
    return (
      <div className={`max-w-xs lg:max-w-md p-3 rounded-lg border border-gray-300 ${
        isSent ? 'bg-blue-50' : 'bg-gray-100'
      }`}>
        <p className="text-sm text-gray-500 italic">
          Note is no longer available
        </p>
      </div>
    )
  }

  const ownerBasic = ownerPortfolio ? getPortfolioBasic(ownerPortfolio) : null
  const ownerName = ownerBasic?.name || `User ${note.owner_account_id.slice(0, 8)}`

  return (
    <div className={`max-w-xs lg:max-w-md border rounded-lg overflow-hidden ${
      isSent ? 'border-blue-300 bg-blue-50' : 'border-gray-300 bg-gray-50'
    }`}>
      <Link 
        href={`/notes/${note.id}`}
        className="block p-3 hover:opacity-90 transition-opacity"
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-gray-700">{ownerName}</span>
          <span className="text-xs text-gray-500">
            {new Date(note.created_at).toLocaleDateString()}
          </span>
        </div>

        {/* Text content - truncated */}
        <div className="mb-2">
          <p className={`text-sm whitespace-pre-wrap line-clamp-3 ${
            isSent ? 'text-gray-800' : 'text-gray-900'
          }`}>
            {note.text}
          </p>
        </div>

        {/* References preview */}
        {note.references && note.references.length > 0 && (
          <div className="mb-2 space-y-2">
            {note.references.slice(0, 2).map((ref, index) => renderReference(ref, index))}
            {note.references.length > 2 && (
              <p className="text-xs text-gray-500">+{note.references.length - 2} more</p>
            )}
          </div>
        )}

        {/* View note link */}
        <div className="mt-2 pt-2 border-t border-gray-300">
          <p className="text-xs text-blue-600 hover:underline">View full note →</p>
        </div>
      </Link>
    </div>
  )
}


