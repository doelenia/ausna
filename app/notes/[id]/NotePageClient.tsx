'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { Note } from '@/types/note'
import { Portfolio } from '@/types/portfolio'
import { NoteView } from '@/components/notes/NoteView'
import { useDataCache } from '@/lib/cache/useDataCache'

interface NotePageClientProps {
  noteId: string
  serverNote: Note
  annotations: Note[] // Deprecated: annotations loaded dynamically client-side
  portfolios: Portfolio[]
  humanPortfolios: Portfolio[]
  currentUserId?: string
  canAnnotate: boolean
  annotatePortfolioId?: string
  referencedNoteDeleted: boolean
}

export function NotePageClient({
  noteId,
  serverNote,
  annotations,
  portfolios: serverPortfolios,
  humanPortfolios: serverHumanPortfolios,
  currentUserId,
  canAnnotate,
  annotatePortfolioId,
  referencedNoteDeleted,
}: NotePageClientProps) {
  const { 
    getCachedNote, 
    setCachedNote, 
    setCachedPortfolioData,
    setCachedPortfolio
  } = useDataCache()
  
  // Check cache immediately (synchronously) for instant render
  const cachedNote = useMemo(() => getCachedNote(noteId), [noteId, getCachedNote])
  const [note, setNote] = useState<Note | null>(() => cachedNote || serverNote)
  const initializedRef = useRef(false)

  // Scroll to top when navigating to note page (prevents scroll position from feed)
  useEffect(() => {
    // Find the scrollable container (the div with h-full overflow-auto in layout)
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      const scrollableContainer = document.querySelector('.h-full.overflow-auto.w-full') as HTMLElement
      if (scrollableContainer) {
        // Scroll the container to top immediately
        scrollableContainer.scrollTop = 0
      }
      // Also ensure window is at top (for browsers that use window scroll)
      window.scrollTo(0, 0)
    })
  }, [noteId])

  // Cache server data and update note if needed (runs once on mount)
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    
    // Always cache the server data (which is fresh)
    setCachedNote(noteId, serverNote)
    
    // Cache portfolio data from server if available
    if (serverHumanPortfolios && serverHumanPortfolios.length > 0) {
      serverHumanPortfolios.forEach(portfolio => {
        setCachedPortfolio(portfolio.id, portfolio)
      })
      
      // Cache owner portfolio data
      const ownerPortfolio = serverHumanPortfolios.find(
        p => p.user_id === serverNote.owner_account_id
      ) || null
      
      const assignedProjects = serverPortfolios.filter(p => p.type === 'projects')
      
      if (ownerPortfolio || assignedProjects.length > 0) {
        setCachedPortfolioData(noteId, {
          ownerPortfolio,
          assignedProjects,
        })
      }
    }
    
    // Cache assigned project portfolios
    if (serverPortfolios && serverPortfolios.length > 0) {
      serverPortfolios.forEach(portfolio => {
        setCachedPortfolio(portfolio.id, portfolio)
      })
    }
    
    // If we used cached data, update with server data after render
    // Use requestAnimationFrame for smoother update (runs after paint)
    if (cachedNote && cachedNote.id === serverNote.id) {
      // Only update if IDs match (same note)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setNote(serverNote)
        })
      })
    }
  }, [noteId, serverNote, serverPortfolios, serverHumanPortfolios, cachedNote, setCachedNote, setCachedPortfolio, setCachedPortfolioData])

  // Show cached note if available, otherwise show server note
  const displayNote = note || serverNote

  return (
    <NoteView
      note={displayNote}
      annotations={annotations}
      portfolios={serverPortfolios}
      humanPortfolios={serverHumanPortfolios}
      currentUserId={currentUserId}
      canAnnotate={canAnnotate}
      annotatePortfolioId={annotatePortfolioId}
      referencedNoteDeleted={referencedNoteDeleted}
    />
  )
}

