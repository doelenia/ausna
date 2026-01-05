'use client'

import { Note, NoteReference, ImageReference, UrlReference, NoteSource } from '@/types/note'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Portfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { getUrlDisplayInfo, getFaviconUrl } from '@/lib/notes/url-helpers'
import { Title, Subtitle, Content, UIText, Card } from '@/components/ui'

interface NoteCardProps {
  note: Note & { feedSource?: NoteSource }
  portfolioId?: string
  currentUserId?: string
  isPreview?: boolean
  isPinned?: boolean
  viewMode?: 'default' | 'collage'
  onDeleted?: () => void
  onRemovedFromPortfolio?: () => void
}

export function NoteCard({
  note,
  portfolioId,
  currentUserId,
  isPreview = false,
  isPinned = false,
  viewMode = 'default',
  onDeleted,
  onRemovedFromPortfolio,
}: NoteCardProps) {
  const [ownerPortfolio, setOwnerPortfolio] = useState<Portfolio | null>(null)
  const [assignedProject, setAssignedProject] = useState<Portfolio | null>(null)
  const [loadingPortfolios, setLoadingPortfolios] = useState(true)
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

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
        // First try from note's assigned_portfolios
        if (note.assigned_portfolios && note.assigned_portfolios.length > 0) {
          const { data: assignedPortfolios, error: projectError } = await supabase
            .from('portfolios')
            .select('*')
            .in('id', note.assigned_portfolios)
            .eq('type', 'projects')
            .limit(1)
            .maybeSingle()

          if (projectError) {
            console.error('Error fetching assigned project:', projectError)
          }

          if (assignedPortfolios) {
            setAssignedProject(assignedPortfolios as Portfolio)
          } else {
            // Fallback: if portfolioId is provided and it's a project, use it
            if (portfolioId) {
              const { data: portfolioData } = await supabase
                .from('portfolios')
                .select('*')
                .eq('id', portfolioId)
                .eq('type', 'projects')
                .maybeSingle()
              
              if (portfolioData) {
                setAssignedProject(portfolioData as Portfolio)
              }
            }
          }
        } else if (portfolioId) {
          // If note has no assigned_portfolios but portfolioId is provided, check if it's a project
          const { data: portfolioData } = await supabase
            .from('portfolios')
            .select('*')
            .eq('id', portfolioId)
            .eq('type', 'projects')
            .maybeSingle()
          
          if (portfolioData) {
            setAssignedProject(portfolioData as Portfolio)
          }
        }
      } catch (error) {
        console.error('Error fetching portfolios:', error)
      } finally {
        setLoadingPortfolios(false)
      }
    }

    fetchPortfolios()
  }, [note.assigned_portfolios, note.owner_account_id, portfolioId])

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
                <Title as="h4" className="mb-1">{urlRef.title}</Title>
              )}
              {urlRef.description && (
                <Content as="p" className="mb-2">{urlRef.description}</Content>
              )}
              {/* Always show host name */}
              <a
                href={urlRef.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <UIText>{displayHostName}</UIText>
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

  const isCollageView = viewMode === 'collage'
  
  // Ensure references is an array
  // Handle case where references might be a JSON string or need parsing
  let references = note.references
  if (typeof references === 'string') {
    try {
      references = JSON.parse(references)
    } catch (e) {
      console.error('[NoteCard] Failed to parse references as JSON:', e)
      references = []
    }
  }
  references = Array.isArray(references) ? references : []
  
  // Check if note is text-only (no images, no URLs)
  // More robust check - handle cases where ref might be null or type might be missing
  const hasImages = references.some(ref => {
    if (!ref) return false
    // Check if it's an image reference by type or by having url without other url-specific fields
    return ref.type === 'image' || (ref.url && !ref.title && !ref.hostName)
  }) || false
  const hasUrls = references.some(ref => ref && ref.type === 'url') || false
  const isTextOnly = isCollageView && !hasImages && !hasUrls
  
  // Get first image for image notes in collage view
  const firstImageRef = hasImages && references.length > 0
    ? references.find(ref => {
        if (!ref) return false
        return ref.type === 'image' || (ref.url && !ref.title && !ref.hostName)
      })
    : null
  
  // Normalize to ImageReference format
  const firstImage: ImageReference | null = firstImageRef && firstImageRef.url
    ? {
        type: 'image',
        url: firstImageRef.url,
      }
    : null
    
  const hasImageInCollage = isCollageView && hasImages && firstImage && firstImage.url
  
  // Get first URL reference for URL notes in collage view
  const firstUrlRef = hasUrls && references.length > 0
    ? references.find(ref => ref && ref.type === 'url') as UrlReference | undefined
    : undefined
    
  const hasUrlInCollage = isCollageView && hasUrls && firstUrlRef

  // Calculate aspect ratio for image notes in collage view
  // Constrain between 1:1 (square) and 1:2 (vertical)
  const getAspectRatio = () => {
    if (!imageAspectRatio) {
      return '1 / 1' // Default to square while loading
    }
    // Constrain between 1:1 (1.0) and 1:2 (0.5)
    // aspectRatio is width/height, so 1:1 = 1.0, 1:2 = 0.5
    const constrained = Math.max(0.5, Math.min(1.0, imageAspectRatio))
    return `${constrained} / 1`
  }

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (img.naturalWidth && img.naturalHeight) {
      const ratio = img.naturalWidth / img.naturalHeight
      setImageAspectRatio(ratio)
    }
  }

  // For URL notes in collage view, render special layout
  if (hasUrlInCollage) {
    const { hostName: displayHostName, hostIcon: displayHostIcon } = getUrlDisplayInfo(firstUrlRef!)
    
    return (
      <div 
        className="bg-white border border-gray-200 rounded-xl relative overflow-hidden" 
        style={{ aspectRatio: '1 / 1', minHeight: '200px' }}
      >
        <Link href={`/notes/${note.id}`} className="block relative w-full h-full">
          {/* Blurred and dimmed header image background */}
          {firstUrlRef!.headerImage && (
            <div className="absolute inset-0 z-0">
              <img
                src={firstUrlRef!.headerImage}
                alt=""
                className="w-full h-full object-cover"
                style={{
                  filter: 'blur(20px) brightness(0.4)',
                  transform: 'scale(1.1)', // Scale up to avoid blur edges
                }}
              />
            </div>
          )}
          
          {/* Content overlay */}
          <div className="relative z-10 h-full flex flex-col p-4">
            {/* Top: Favicon and host name */}
            <div className="flex items-center gap-2 mb-3">
              <img
                src={displayHostIcon}
                alt={displayHostName}
                className="w-5 h-5 rounded flex-shrink-0"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.src = `https://www.google.com/s2/favicons?domain=${displayHostName}&sz=64`
                }}
              />
              <UIText as="span" className="text-white">
                {displayHostName}
              </UIText>
            </div>
            
            {/* Title */}
            {firstUrlRef!.title && (
              <Subtitle as="h3" className="text-white">
                {firstUrlRef!.title}
              </Subtitle>
            )}
          </div>
          
          {/* Text label at bottom - positioned like image notes */}
          {note.text && (
            <div className="absolute bottom-0 left-0 right-0 p-2 z-10">
              <div className="bg-white rounded-md px-2 py-1.5 w-fit max-w-full">
                <UIText as="p" className="line-clamp-2 whitespace-pre-wrap">
                  {note.text}
                </UIText>
              </div>
            </div>
          )}
        </Link>
      </div>
    )
  }

  // For image notes in collage view, render special layout
  if (hasImageInCollage) {
    return (
      <div 
        className="bg-white border border-gray-200 rounded-xl relative overflow-hidden" 
        style={{ aspectRatio: getAspectRatio(), minHeight: '200px' }}
      >
        <Link href={`/notes/${note.id}`} className="block relative w-full h-full">
          {/* Image fills the card */}
          <img
            ref={imageRef}
            src={firstImage!.url}
            alt={`Note image`}
            className="absolute inset-0 w-full h-full object-cover"
            onLoad={handleImageLoad}
          />
          {/* Text overlay at bottom */}
          {note.text && (
            <div className="absolute bottom-0 left-0 right-0 p-2 z-10">
              <div className="bg-white rounded-md px-2 py-1.5 w-fit max-w-full">
                <UIText as="p" className="line-clamp-2 whitespace-pre-wrap">
                  {note.text}
                </UIText>
              </div>
            </div>
          )}
        </Link>
      </div>
    )
  }

  return (
    <Card 
      variant="subtle" 
      className="relative overflow-hidden"
      padding={isTextOnly ? 'sm' : undefined}
    >
      <Link href={`/notes/${note.id}`} className="block">
        {/* Header - Owner and Date (hidden in collage view) */}
        {!isCollageView && (
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
                <UIText as="span" className="hover:text-blue-600">
                  {ownerName}
                </UIText>
              </Link>
              <UIText as="span">
                {new Date(note.created_at).toLocaleDateString()}
              </UIText>
              {/* Feed source label - only show in "all" feed */}
              {note.feedSource && (
                <UIText as="span" className="px-2 py-1 rounded-full bg-gray-100">
                  {note.feedSource.type === 'friend' && 'Friend'}
                  {note.feedSource.type === 'community' && `From ${note.feedSource.communityName}`}
                  {note.feedSource.type === 'subscribed' && 'Subscribed'}
                </UIText>
              )}
            </div>
          </div>
        )}

        {/* Text content */}
        <div 
          className={isTextOnly ? 'mb-2' : 'mb-4'}
          style={isTextOnly ? {
            display: '-webkit-box',
            WebkitLineClamp: 9,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          } : undefined}
        >
          <Content 
            as="p" 
            className={`whitespace-pre-wrap ${isTextOnly ? '' : 'line-clamp-3'}`}
          >
            {note.text}
          </Content>
        </div>


        {/* References preview - show all references (excluding first image in collage view) */}
        {note.references && note.references.length > 0 && (
          <div className="mb-4 space-y-3">
            {note.references.map((ref, index) => {
              // Skip first image in collage view since it's already displayed
              if (isCollageView && ref.type === 'image' && index === 0 && hasImages) {
                return null
              }
              return renderReference(ref, index)
            })}
          </div>
        )}

        {/* Mentioned note indicator */}
        {note.mentioned_note_id && (
          <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded">
            <UIText as="p" className="text-blue-700">
              Annotation
            </UIText>
          </div>
        )}
      </Link>
    </Card>
  )
}
