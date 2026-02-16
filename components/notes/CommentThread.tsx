'use client'

import { useEffect, useRef, useState } from 'react'
import { Note, type NoteReference, type ImageReference, type UrlReference } from '@/types/note'
import { UserAvatar } from '@/components/ui'
import { UIText, UIButtonText, Content } from '@/components/ui'
import { AnnotationComposer } from './AnnotationComposer'
import { deleteNote, type AnnotationWithReplies } from '@/app/notes/actions'
import { getUrlDisplayInfo } from '@/lib/notes/url-helpers'
import { formatRelativeTime } from '@/lib/formatRelativeTime'
import Link from 'next/link'

interface CommentThreadProps {
  comment: Note
  // Direct replies only (second level)
  replies: Note[]
  currentUserId?: string
  onReply: (commentId: string, authorName: string, commentPreview?: string) => void
  canReply: boolean
  /** When true (mobile), reply uses the fixed bottom bar; inline reply composer is hidden. */
  isMobile?: boolean
  // For two-level design we no longer lazily load replies,
  // but the prop is kept optional for compatibility.
  loadReplies?: (commentId: string) => Promise<AnnotationWithReplies[]>
  getAuthorName: (userId: string) => string
  getAuthorAvatar: (userId: string) => string | undefined
  // Root note ID for this thread
  parentNoteId: string
  // Get the owner name of a note (used for "reply to [name]" prefix)
  getNoteOwnerName: (noteId: string) => string | undefined
  onDelete?: (commentId: string) => void // Callback when comment is deleted
  /** When true, keep replies section expanded (e.g. after user posts a reply). */
  expandReplies?: boolean
  /** Called when a reply is successfully posted; parent can refetch and expand this thread. */
  onReplySuccess?: (parentCommentId: string) => void
}

const MAX_PREVIEW_LENGTH = 300

export function CommentThread({
  comment,
  replies,
  currentUserId,
  onReply,
  canReply,
  isMobile = false,
  loadReplies,
  getAuthorName,
  getAuthorAvatar,
  parentNoteId,
  getNoteOwnerName,
  onDelete,
  expandReplies = false,
  onReplySuccess,
}: CommentThreadProps) {
  const [showReplyComposer, setShowReplyComposer] = useState(false)
  const [expandedText, setExpandedText] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)
  const [areRepliesCollapsed, setAreRepliesCollapsed] = useState(replies.length > 0)
  const previousRepliesCount = useRef(replies.length)

  // When parent asks to expand replies (e.g. after posting a reply), show replies
  useEffect(() => {
    if (expandReplies && replies.length > 0) {
      setAreRepliesCollapsed(false)
    }
  }, [expandReplies, replies.length])

  const authorName = getAuthorName(comment.owner_account_id)
  const authorAvatar = getAuthorAvatar(comment.owner_account_id)
  const isLongText = comment.text.length > MAX_PREVIEW_LENGTH
  const displayText = expandedText || !isLongText ? comment.text : comment.text.substring(0, MAX_PREVIEW_LENGTH) + '...'

  const handleReplySuccess = () => {
    setShowReplyComposer(false)
    onReplySuccess?.(comment.id)
  }

  const oneLinePreview = comment.text.replace(/\s+/g, ' ').trim().slice(0, 60) + (comment.text.replace(/\s+/g, ' ').trim().length > 60 ? '...' : '')

  const handleReplyClick = () => {
    if (canReply) {
      if (isMobile) {
        onReply(comment.id, authorName, oneLinePreview)
      } else {
        setShowReplyComposer(true)
        onReply(comment.id, authorName)
      }
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this comment? This action cannot be undone.')) {
      return
    }

    setIsDeleting(true)
    try {
      const result = await deleteNote(comment.id)
      if (result.success) {
        setIsDeleted(true)
        // Notify parent component to refresh annotations
        if (onDelete) {
          onDelete(comment.id)
        }
      } else {
        alert(result.error || 'Failed to delete comment')
        setIsDeleting(false)
      }
    } catch (error) {
      console.error('Error deleting comment:', error)
      alert('Failed to delete comment')
      setIsDeleting(false)
    }
  }

  const isOwner = currentUserId ? comment.owner_account_id === currentUserId : false

  const hasReplies = replies.length > 0
  useEffect(() => {
    if (previousRepliesCount.current === 0 && replies.length > 0) {
      setAreRepliesCollapsed(true)
    }
    previousRepliesCount.current = replies.length
  }, [replies.length])

  // Determine if this comment is a reply to another annotation (second level),
  // and compute the "reply to [name]" prefix when appropriate.
  // Only show "Reply to [name]" when the thread root (parent_note_id) differs
  // from the note being replied to (mentioned_note_id).
  const isReplyToAnnotation =
    !!comment.mentioned_note_id &&
    !!comment.parent_note_id &&
    comment.parent_note_id !== comment.mentioned_note_id
  const replyToName =
    isReplyToAnnotation && comment.mentioned_note_id
      ? getNoteOwnerName(comment.mentioned_note_id) || undefined
      : undefined

  // Normalize references for display (annotations can have images/URLs)
  let refs: NoteReference[] = []
  if (comment.references) {
    try {
      refs = typeof comment.references === 'string'
        ? JSON.parse(comment.references)
        : comment.references
    } catch {
      refs = []
    }
  }
  refs = Array.isArray(refs) ? refs : []

  // Show deleted state
  if (isDeleted) {
    return (
      <div className="space-y-3">
        <div className="flex gap-3 opacity-50">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200" />
          <div className="flex-1">
            <UIText className="text-gray-500 italic">Comment deleted</UIText>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Comment */}
      <div className="flex gap-3">
        <Link
          href={`/portfolio/human/${comment.owner_account_id}`}
          className="flex-shrink-0"
        >
          <UserAvatar
            userId={comment.owner_account_id}
            name={authorName}
            avatar={authorAvatar}
            size={32}
            showLink={false}
          />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <Link
              href={`/portfolio/human/${comment.owner_account_id}`}
              className="hover:text-blue-600"
            >
              <UIText as="span" className="font-medium">{authorName}</UIText>
            </Link>
            <UIButtonText as="span" className="text-gray-500 text-xs">
              {formatRelativeTime(comment.created_at)}
            </UIButtonText>
          </div>
          <div className="mb-2">
            <Content as="p" className="whitespace-pre-wrap">
              {replyToName && (
                <UIText as="span" className="text-gray-500 mr-1">
                  Reply to {replyToName}:
                </UIText>
              )}
              {displayText}
            </Content>
            {isLongText && (
              <button
                type="button"
                onClick={() => setExpandedText(!expandedText)}
                className="mt-1 text-gray-600 hover:text-gray-900 text-sm"
                style={{ 
                  cursor: 'pointer', 
                  background: 'none', 
                  border: 'none', 
                  padding: 0,
                }}
              >
                {expandedText ? 'less' : 'more'}
              </button>
            )}
            {/* References (images and URLs) in comments */}
            {refs.length > 0 && (
              <div className="mt-3 space-y-2">
                {refs.map((ref, index) => {
                  if (ref.type === 'image') {
                    const imageRef = ref as ImageReference
                    return (
                      <div key={index} className="rounded-lg overflow-hidden max-w-sm">
                        <img
                          src={imageRef.url}
                          alt={`Comment image ${index + 1}`}
                          className="max-h-48 w-auto object-contain rounded border border-gray-200"
                        />
                      </div>
                    )
                  }
                  if (ref.type === 'url') {
                    const urlRef = ref as UrlReference
                    const { hostName: displayHostName, hostIcon: displayHostIcon } = getUrlDisplayInfo(urlRef)
                    return (
                      <a
                        key={index}
                        href={urlRef.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex gap-2 items-start p-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 max-w-md"
                      >
                        {urlRef.headerImage && (
                          <img
                            src={urlRef.headerImage}
                            alt=""
                            className="w-16 h-16 object-cover rounded flex-shrink-0"
                          />
                        )}
                        <img
                          src={displayHostIcon}
                          alt=""
                          className="w-4 h-4 rounded flex-shrink-0 mt-0.5"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            target.src = `https://www.google.com/s2/favicons?domain=${displayHostName}&sz=64`
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          {urlRef.title && (
                            <UIText as="span" className="font-medium block truncate">{urlRef.title}</UIText>
                          )}
                          <UIText as="span" className="text-gray-500 text-xs">{displayHostName}</UIText>
                        </div>
                      </a>
                    )
                  }
                  return null
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleReplyClick}
              disabled={!canReply}
              title="Reply"
              aria-label="Reply"
              className={`p-1.5 rounded-md ${
                canReply
                  ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  : 'text-gray-400 cursor-not-allowed'
              }`}
              style={{ background: 'none', border: 'none' }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                />
              </svg>
            </button>
            {isOwner && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                title={isDeleting ? 'Deleting...' : 'Delete'}
                aria-label={isDeleting ? 'Deleting...' : 'Delete'}
                className="p-1.5 rounded-md text-red-600 hover:text-red-800 hover:bg-red-50 disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                style={{ background: 'none', border: 'none' }}
              >
                <svg
                  className={`w-4 h-4 ${isDeleting ? 'animate-pulse' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
            {hasReplies && (
              <button
                type="button"
                onClick={() => setAreRepliesCollapsed(!areRepliesCollapsed)}
                className="p-1.5 rounded-md text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                style={{ background: 'none', border: 'none' }}
              >
                <UIText>
                  {areRepliesCollapsed ? `Show replies (${replies.length})` : 'Hide replies'}
                </UIText>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Reply Composer (Desktop only - inline); on mobile, reply uses the fixed bottom bar */}
      {showReplyComposer && canReply && !isMobile && (
        <div className="ml-11">
          <AnnotationComposer
            parentNoteId={comment.mentioned_note_id || parentNoteId}
            parentAnnotationId={comment.id}
            replyToName={authorName}
            onSuccess={handleReplySuccess}
            onCancel={() => setShowReplyComposer(false)}
            disabled={!canReply}
            currentUserId={currentUserId}
            isMobile={false}
          />
        </div>
      )}

      {/* Replies (second level only) */}
      {hasReplies && !areRepliesCollapsed && (
        <div className="ml-11 space-y-3 border-l-2 border-gray-200 pl-4">
          {replies.map((reply) => {
            return (
              <div key={reply.id}>
                <CommentThread
                  comment={reply}
                  replies={[]}
                  currentUserId={currentUserId}
                  onReply={onReply}
                  canReply={canReply}
                  isMobile={isMobile}
                  onReplySuccess={onReplySuccess ? () => onReplySuccess(comment.id) : undefined}
                  getAuthorName={getAuthorName}
                  getAuthorAvatar={getAuthorAvatar}
                  parentNoteId={parentNoteId}
                  getNoteOwnerName={getNoteOwnerName}
                  onDelete={onDelete}
                  expandReplies={false}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

