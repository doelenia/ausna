'use client'

import { Note, NoteReference, ImageReference, UrlReference, NoteSource } from '@/types/note'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Portfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { getUrlDisplayInfo, getFaviconUrl } from '@/lib/notes/url-helpers'

interface NoteCardProps {
  note: Note & { feedSource?: NoteSource }
  portfolioId?: string
  currentUserId?: string
  isPreview?: boolean
  onDeleted?: () => void
  onRemovedFromPortfolio?: () => void
}

export function NoteCard({
  note,
  portfolioId,
  currentUserId,
  isPreview = false,
  onDeleted,
  onRemovedFromPortfolio,
}: NoteCardProps) {
  const [ownerPortfolio, setOwnerPortfolio] = useState<Portfolio | null>(null)
  const [assignedProject, setAssignedProject] = useState<Portfolio | null>(null)
  const [loadingPortfolios, setLoadingPortfolios] = useState(true)

  useEffect(() => {
    const fetchPortfolios = async () => {
      try {
        const supabase = createClient()
        
        // Fetch owner's human portfolio
        const { data: ownerPortfolios } = await supabase
          .from('portfolios')
          .select('*')
          .eq('type', 'human')
          .eq('user_id', note.owner_account_id)
          .maybeSingle()

        if (ownerPortfolios) {
          setOwnerPortfolio(ownerPortfolios as Portfolio)
        }

        // Fetch assigned project portfolio (only projects, not communities)
        if (note.assigned_portfolios && note.assigned_portfolios.length > 0) {
          const { data: assignedPortfolios } = await supabase
            .from('portfolios')
            .select('*')
            .in('id', note.assigned_portfolios)
            .eq('type', 'projects')
            .maybeSingle()

          if (assignedPortfolios) {
            setAssignedProject(assignedPortfolios as Portfolio)
          }
        }
      } catch (error) {
        console.error('Error fetching portfolios:', error)
      } finally {
        setLoadingPortfolios(false)
      }
    }

    fetchPortfolios()
  }, [note.assigned_portfolios, note.owner_account_id])

  const renderReference = (ref: NoteReference, index: number) => {
    if (ref.type === 'image') {
      const imageRef = ref as ImageReference
      return (
        <div 
          key={index} 
          className="rounded-lg overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
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
        <div 
          key={index} 
          className="border border-gray-200 rounded-lg p-4 bg-gray-50"
          onClick={(e) => e.stopPropagation()}
        >
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

  const ownerBasic = ownerPortfolio ? getPortfolioBasic(ownerPortfolio) : null
  const ownerAvatarUrl = ownerBasic?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(ownerBasic?.name || 'User')}&background=random`
  const ownerName = ownerBasic?.name || `User ${note.owner_account_id.slice(0, 8)}`

  const projectBasic = assignedProject ? getPortfolioBasic(assignedProject) : null
  const projectAvatarUrl = projectBasic?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(projectBasic?.name || 'Project')}&background=random`
  const projectName = projectBasic?.name || 'Project'

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <Link href={`/notes/${note.id}`} className="block">
        {/* Header - Owner and Date */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href={`/portfolio/human/${note.owner_account_id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <img
                src={ownerAvatarUrl}
                alt={ownerName}
                className="h-8 w-8 rounded-full object-cover border-2 border-gray-300"
              />
              <span className="text-sm font-medium text-gray-900 hover:text-blue-600">
                {ownerName}
              </span>
            </Link>
            <span className="text-sm text-gray-500">
              {new Date(note.created_at).toLocaleDateString()}
            </span>
            {/* Feed source label - only show in "all" feed */}
            {note.feedSource && (
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                {note.feedSource.type === 'friend' && 'Friend'}
                {note.feedSource.type === 'community' && `From ${note.feedSource.communityName}`}
                {note.feedSource.type === 'subscribed' && 'Subscribed'}
              </span>
            )}
          </div>
        </div>

        {/* Assigned Project - Show in preview (feed) */}
        {!loadingPortfolios && assignedProject && (
          <div className="mb-4">
            <Link
              href={getPortfolioUrl(assignedProject.type, assignedProject.id)}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <img
                src={projectAvatarUrl}
                alt={projectName}
                className="h-6 w-6 rounded object-cover border border-gray-300"
              />
              <span className="text-xs font-medium text-gray-700">{projectName}</span>
            </Link>
          </div>
        )}

        {/* Text content */}
        <div className="mb-4">
          <p className="text-gray-900 whitespace-pre-wrap line-clamp-3">{note.text}</p>
        </div>

        {/* References preview - show all references */}
        {note.references && note.references.length > 0 && (
          <div className="mb-4 space-y-3">
            {note.references.map((ref, index) => renderReference(ref, index))}
          </div>
        )}

        {/* Mentioned note indicator */}
        {note.mentioned_note_id && (
          <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded">
            <p className="text-xs text-blue-700">
              Annotation
            </p>
          </div>
        )}
      </Link>
    </div>
  )
}
