'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
  /**
   * When navigating directly to an annotation/reaction note ID, the server
   * resolves the root note and passes the original annotation ID here so
   * the client can redirect to /notes/[rootId]#annotation-[annotationId].
   */
  initialAnnotationId?: string | null
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
  initialAnnotationId,
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
  const router = useRouter()

  // If this page was reached via an annotation/reaction ID, redirect client-side
  // to the root note with an appropriate #annotation-<id> hash. If the original
  // URL already has a #annotation-... hash, prefer that target instead.
  useEffect(() => {
    if (!initialAnnotationId) return
    if (typeof window === 'undefined') return

    const currentHash = window.location.hash
    let targetAnnotationId = initialAnnotationId
    if (currentHash && currentHash.startsWith('#annotation-')) {
      targetAnnotationId = currentHash.replace('#annotation-', '')
    }

    const targetUrl = `/notes/${serverNote.id}#annotation-${targetAnnotationId}`

    // Avoid infinite replace loops by only replacing when URL differs
    const currentPath = window.location.pathname + window.location.search + window.location.hash
    if (currentPath !== targetUrl) {
      router.replace(targetUrl)
    }
  }, [initialAnnotationId, router, serverNote.id])

  // Scroll to top when opening a note without #comments or #annotation-* (e.g. from feed).
  // Only comment button, comment preview, and "View more" in feed use #comments.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash

    // If we're navigating directly to comments or an annotation, let NoteView
    // handle the scroll instead of forcing the container back to top.
    if (hash === '#comments' || hash.startsWith('#annotation-')) {
      return
    }

    const scrollToTop = () => {
      const scrollableContainer =
        (document.querySelector('.h-full.overflow-auto.w-full') as HTMLElement) ||
        (document.querySelector('.app-scroll') as HTMLElement)
      if (scrollableContainer) {
        scrollableContainer.scrollTop = 0
      }
      window.scrollTo(0, 0)
    }

    // Run once when DOM is ready
    requestAnimationFrame(scrollToTop)
    // Run again after a short delay to override any scroll restoration (e.g. from Next.js or browser)
    const t = setTimeout(scrollToTop, 100)
    return () => clearTimeout(t)
  }, [noteId])

  // Cache server data and update note if needed (runs once on mount)
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    // Preserve preloaded author_profiles from feed when merging with server data
    const noteToCache: Note = cachedNote?.author_profiles && cachedNote.author_profiles.length > 0 && !serverNote.author_profiles?.length
      ? { ...serverNote, author_profiles: cachedNote.author_profiles }
      : serverNote

    // Always cache the server data (which is fresh), with preloaded author_profiles if from feed
    setCachedNote(noteId, noteToCache)
    
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
    
    // If we used cached data, update with server data after render (preserving preloaded author_profiles)
    if (cachedNote && cachedNote.id === serverNote.id) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setNote(noteToCache)
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
      initialAnnotationId={initialAnnotationId}
    />
  )
}

