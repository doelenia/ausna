'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Note } from '@/types/note'
import { deleteNote } from '@/app/notes/actions'
import { useRouter } from 'next/navigation'
import { Portfolio } from '@/types/portfolio'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { NoteCard } from './NoteCard'
import { UIText, Content, Button, Card } from '@/components/ui'
import { AnnotationComposer } from './AnnotationComposer'
import { CommentThread } from './CommentThread'
import { createClient } from '@/lib/supabase/client'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import Link from 'next/link'

interface AnnotationWithReplies {
  annotation: Note
  // Direct replies only (second level of thread)
  replies: Note[]
}

interface NoteViewProps {
  note: Note
  annotations: Note[] // Deprecated: annotations loaded dynamically client-side
  portfolios: Portfolio[]
  humanPortfolios: Portfolio[]
  currentUserId?: string
  canAnnotate: boolean
  annotatePortfolioId?: string
  referencedNoteDeleted?: boolean
}

export function NoteView({
  note,
  annotations: serverAnnotations,
  portfolios,
  humanPortfolios,
  currentUserId,
  canAnnotate,
  annotatePortfolioId,
  referencedNoteDeleted = false,
}: NoteViewProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [annotations, setAnnotations] = useState<AnnotationWithReplies[]>([])
  const [loadingAnnotations, setLoadingAnnotations] = useState(true)
  const [hasMoreAnnotations, setHasMoreAnnotations] = useState(false)
  const [annotationOffset, setAnnotationOffset] = useState(0)
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; authorName: string } | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [authorNames, setAuthorNames] = useState<Map<string, string>>(new Map())
  const [authorAvatars, setAuthorAvatars] = useState<Map<string, string | undefined>>(new Map())
  const supabaseRef = useRef(createClient())

  const isOwner = currentUserId ? note.owner_account_id === currentUserId : false

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Load annotations dynamically
  useEffect(() => {
    const loadAnnotations = async () => {
      setLoadingAnnotations(true)
      try {
        const response = await fetch(`/api/notes/${note.id}/annotations?offset=0&limit=20`)
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setAnnotations(data.annotations || [])
            setHasMoreAnnotations(data.hasMore || false)
            setAnnotationOffset(data.annotations?.length || 0)

            // Fetch author names and avatars (recursively for nested replies)
            const userIds = new Set<string>()
            const collectUserIds = (items: AnnotationWithReplies[]) => {
              items.forEach((item: AnnotationWithReplies) => {
                userIds.add(item.annotation.owner_account_id)
                if (item.replies && item.replies.length > 0) {
                  collectUserIds(item.replies)
                }
              })
            }
            collectUserIds(data.annotations || [])

            const namesMap = new Map<string, string>()
            const avatarsMap = new Map<string, string | undefined>()

            for (const userId of userIds) {
              // Try to get from humanPortfolios first
              const portfolio = humanPortfolios.find(p => p.user_id === userId)
              if (portfolio) {
                const basic = getPortfolioBasic(portfolio)
                namesMap.set(userId, basic.name || `User ${userId.slice(0, 8)}`)
                avatarsMap.set(userId, basic.avatar)
              } else {
                // Fallback: fetch from supabase
                const { data: portfolioData } = await supabaseRef.current
                  .from('portfolios')
                  .select('*')
                  .eq('user_id', userId)
                  .eq('type', 'human')
                  .maybeSingle()
                
                if (portfolioData) {
                  const basic = getPortfolioBasic(portfolioData as Portfolio)
                  namesMap.set(userId, basic.name || `User ${userId.slice(0, 8)}`)
                  avatarsMap.set(userId, basic.avatar)
                } else {
                  namesMap.set(userId, `User ${userId.slice(0, 8)}`)
                }
              }
            }

            setAuthorNames(namesMap)
            setAuthorAvatars(avatarsMap)
          }
        }
      } catch (error) {
        console.error('Error loading annotations:', error)
      } finally {
        setLoadingAnnotations(false)
      }
    }

    loadAnnotations()
  }, [note.id, humanPortfolios])

  const loadMoreAnnotations = async () => {
    try {
      const response = await fetch(`/api/notes/${note.id}/annotations?offset=${annotationOffset}&limit=20`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setAnnotations((prev) => [...prev, ...(data.annotations || [])])
          setHasMoreAnnotations(data.hasMore || false)
          setAnnotationOffset((prev) => prev + (data.annotations?.length || 0))

          // Collect user IDs from new annotations (recursively)
          const userIds = new Set<string>()
          const collectUserIds = (items: AnnotationWithReplies[]) => {
            items.forEach((item: AnnotationWithReplies) => {
              userIds.add(item.annotation.owner_account_id)
              if (item.replies && item.replies.length > 0) {
                collectUserIds(item.replies)
              }
            })
          }
          collectUserIds(data.annotations || [])

          // Fetch author names and avatars for new users
          const namesMap = new Map<string, string>(authorNames)
          const avatarsMap = new Map<string, string | undefined>(authorAvatars)

          for (const userId of userIds) {
            if (!namesMap.has(userId)) {
              // Try to get from humanPortfolios first
              const portfolio = humanPortfolios.find(p => p.user_id === userId)
              if (portfolio) {
                const basic = getPortfolioBasic(portfolio)
                namesMap.set(userId, basic.name || `User ${userId.slice(0, 8)}`)
                avatarsMap.set(userId, basic.avatar)
              } else {
                // Fallback: fetch from supabase
                const { data: portfolioData } = await supabaseRef.current
                  .from('portfolios')
                  .select('*')
                  .eq('user_id', userId)
                  .eq('type', 'human')
                  .maybeSingle()
                
                if (portfolioData) {
                  const basic = getPortfolioBasic(portfolioData as Portfolio)
                  namesMap.set(userId, basic.name || `User ${userId.slice(0, 8)}`)
                  avatarsMap.set(userId, basic.avatar)
                } else {
                  namesMap.set(userId, `User ${userId.slice(0, 8)}`)
                }
              }
            }
          }

          setAuthorNames(namesMap)
          setAuthorAvatars(avatarsMap)
        }
      }
    } catch (error) {
      console.error('Error loading more annotations:', error)
    }
  }

  // Two-level design: replies are already provided in the initial payload,
  // so we don't need a separate loader. This is kept for API compatibility
  // but simply returns an empty array.
  const loadReplies = async (): Promise<AnnotationWithReplies[]> => {
    return []
  }

  const handleAnnotationSuccess = () => {
    // Reload annotations
    setAnnotationOffset(0)
    const loadAnnotations = async () => {
      try {
        const response = await fetch(`/api/notes/${note.id}/annotations?offset=0&limit=20`)
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setAnnotations(data.annotations || [])
            setHasMoreAnnotations(data.hasMore || false)
            setAnnotationOffset(data.annotations?.length || 0)

            // Collect user IDs from annotations (recursively)
            const userIds = new Set<string>()
            const collectUserIds = (items: AnnotationWithReplies[]) => {
              items.forEach((item: AnnotationWithReplies) => {
                userIds.add(item.annotation.owner_account_id)
                if (item.replies && item.replies.length > 0) {
                  collectUserIds(item.replies)
                }
              })
            }
            collectUserIds(data.annotations || [])

            // Fetch author names and avatars
            const namesMap = new Map<string, string>(authorNames)
            const avatarsMap = new Map<string, string | undefined>(authorAvatars)

            for (const userId of userIds) {
              if (!namesMap.has(userId)) {
                // Try to get from humanPortfolios first
                const portfolio = humanPortfolios.find(p => p.user_id === userId)
                if (portfolio) {
                  const basic = getPortfolioBasic(portfolio)
                  namesMap.set(userId, basic.name || `User ${userId.slice(0, 8)}`)
                  avatarsMap.set(userId, basic.avatar)
                } else {
                  // Fallback: fetch from supabase
                  const { data: portfolioData } = await supabaseRef.current
                    .from('portfolios')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('type', 'human')
                    .maybeSingle()
                  
                  if (portfolioData) {
                    const basic = getPortfolioBasic(portfolioData as Portfolio)
                    namesMap.set(userId, basic.name || `User ${userId.slice(0, 8)}`)
                    avatarsMap.set(userId, basic.avatar)
                  } else {
                    namesMap.set(userId, `User ${userId.slice(0, 8)}`)
                  }
                }
              }
            }

            setAuthorNames(namesMap)
            setAuthorAvatars(avatarsMap)
          }
        }
      } catch (error) {
        console.error('Error reloading annotations:', error)
      }
    }
    loadAnnotations()
    setReplyingTo(null)
  }

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

  const getAuthorName = (userId: string): string => {
    return authorNames.get(userId) || `User ${userId.slice(0, 8)}`
  }

  const getAuthorAvatar = (userId: string): string | undefined => {
    return authorAvatars.get(userId)
  }

  // Map of noteId -> Note for all annotations and direct replies
  const noteById = useMemo(() => {
    const map = new Map<string, Note>()
    annotations.forEach((item) => {
      map.set(item.annotation.id, item.annotation)
      item.replies.forEach((reply) => {
        map.set(reply.id, reply)
      })
    })
    return map
  }, [annotations])

  const getNoteOwnerName = (noteId: string): string | undefined => {
    const n = noteById.get(noteId)
    if (!n) return undefined
    return getAuthorName(n.owner_account_id)
  }

  return (
    <div className="bg-white md:bg-transparent space-y-6 md:py-10 md:space-y-8">
      {/* Note Card */}
      <NoteCard
        note={note}
        portfolioId={firstPortfolioId}
        currentUserId={currentUserId}
        isViewMode={true}
        flatOnMobile={true}
        onDeleted={handleDelete}
      />

      {/* Annotation Composer - Desktop (inline) */}
      {!isMobile && (
        <Card variant="subtle" className="p-4">
          <AnnotationComposer
            parentNoteId={note.id}
            parentAnnotationId={replyingTo?.commentId}
            replyToName={replyingTo?.authorName}
            onSuccess={handleAnnotationSuccess}
            onCancel={replyingTo ? () => setReplyingTo(null) : undefined}
            disabled={!canAnnotate || !currentUserId}
            isMobile={false}
          />
        </Card>
      )}

      {/* Comments Section */}
      <Card variant="subtle" className="p-6">
        {loadingAnnotations ? (
          <div className="text-center py-8">
            <UIText className="text-gray-500">Loading comments...</UIText>
          </div>
        ) : annotations.length === 0 ? (
          <div className="text-center py-8">
            <UIText className="text-gray-500">No comments yet</UIText>
          </div>
        ) : (
          <div className="space-y-6">
            {annotations.map((item) => (
              <CommentThread
                key={item.annotation.id}
                comment={item.annotation}
                replies={item.replies}
                currentUserId={currentUserId}
                onReply={(commentId, authorName) => setReplyingTo({ commentId, authorName })}
                canReply={canAnnotate && !!currentUserId}
                loadReplies={loadReplies}
                getAuthorName={getAuthorName}
                getAuthorAvatar={getAuthorAvatar}
                parentNoteId={note.id}
                getNoteOwnerName={getNoteOwnerName}
                onDelete={handleAnnotationSuccess}
              />
            ))}
            {hasMoreAnnotations && (
              <div className="text-center">
                <Button
                  variant="secondary"
                  onClick={loadMoreAnnotations}
                >
                  <UIText>Load more comments</UIText>
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Annotation Composer - Mobile (fixed at bottom) */}
      {isMobile && (
        <AnnotationComposer
          parentNoteId={note.id}
          parentAnnotationId={replyingTo?.commentId}
          replyToName={replyingTo?.authorName}
          onSuccess={handleAnnotationSuccess}
          onCancel={replyingTo ? () => setReplyingTo(null) : undefined}
          disabled={!canAnnotate || !currentUserId}
          isMobile={true}
        />
      )}
    </div>
  )
}

