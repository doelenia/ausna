'use client'

import { useEffect, useRef, useState } from 'react'
import { Note } from '@/types/note'
import { UserAvatar } from '@/components/ui'
import { UIText, Content, Button } from '@/components/ui'
import { AnnotationComposer } from './AnnotationComposer'
import { deleteNote } from '@/app/notes/actions'
import Link from 'next/link'

interface CommentThreadProps {
  comment: Note
  // Direct replies only (second level)
  replies: Note[]
  currentUserId?: string
  onReply: (commentId: string, authorName: string) => void
  canReply: boolean
  // For two-level design we no longer lazily load replies,
  // but the prop is kept optional for compatibility.
  loadReplies?: (commentId: string) => Promise<Note[]>
  getAuthorName: (userId: string) => string
  getAuthorAvatar: (userId: string) => string | undefined
  // Root note ID for this thread
  parentNoteId: string
  // Get the owner name of a note (used for "reply to [name]" prefix)
  getNoteOwnerName: (noteId: string) => string | undefined
  onDelete?: (commentId: string) => void // Callback when comment is deleted
}

const MAX_PREVIEW_LENGTH = 300

export function CommentThread({
  comment,
  replies,
  currentUserId,
  onReply,
  canReply,
  loadReplies,
  getAuthorName,
  getAuthorAvatar,
  parentNoteId,
  getNoteOwnerName,
  onDelete,
}: CommentThreadProps) {
  const [showReplyComposer, setShowReplyComposer] = useState(false)
  const [expandedText, setExpandedText] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)
  const [areRepliesCollapsed, setAreRepliesCollapsed] = useState(replies.length > 0)
  const previousRepliesCount = useRef(replies.length)

  const authorName = getAuthorName(comment.owner_account_id)
  const authorAvatar = getAuthorAvatar(comment.owner_account_id)
  const isLongText = comment.text.length > MAX_PREVIEW_LENGTH
  const displayText = expandedText || !isLongText ? comment.text : comment.text.substring(0, MAX_PREVIEW_LENGTH) + '...'

  const handleReplySuccess = () => {
    setShowReplyComposer(false)
  }

  const handleReplyClick = () => {
    if (canReply) {
      setShowReplyComposer(true)
      onReply(comment.id, authorName)
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
  // For now, we'll use mentioned_note_id to determine replies.
  // If mentioned_note_id exists and differs from parentNoteId, it's a reply to an annotation.
  const isReplyToAnnotation =
    !!comment.mentioned_note_id &&
    comment.mentioned_note_id !== parentNoteId
  const replyToName =
    isReplyToAnnotation && comment.mentioned_note_id
      ? getNoteOwnerName(comment.mentioned_note_id) || undefined
      : undefined

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
            <UIText as="span" className="text-gray-500 text-xs">
              {new Date(comment.created_at).toLocaleDateString()}
            </UIText>
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
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleReplyClick}
              disabled={!canReply}
              className={`flex items-center gap-1 text-sm ${
                canReply
                  ? 'text-gray-600 hover:text-gray-900'
                  : 'text-gray-400 cursor-not-allowed'
              }`}
              style={{ background: 'none', border: 'none', padding: 0 }}
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
              <UIText>Reply</UIText>
            </button>
            {isOwner && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                style={{ background: 'none', border: 'none', padding: 0 }}
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
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                <UIText>{isDeleting ? 'Deleting...' : 'Delete'}</UIText>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Reply Composer (Desktop - inline) */}
      {showReplyComposer && canReply && (
        <div className="ml-11">
          <AnnotationComposer
            parentNoteId={comment.mentioned_note_id || ''}
            parentAnnotationId={comment.id}
            replyToName={authorName}
            onSuccess={handleReplySuccess}
            onCancel={() => setShowReplyComposer(false)}
            disabled={!canReply}
            isMobile={false}
          />
        </div>
      )}

      {hasReplies && (
        <div className="ml-11">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAreRepliesCollapsed(!areRepliesCollapsed)}
          >
            <UIText>
              {areRepliesCollapsed ? `Show replies (${replies.length})` : 'Hide replies'}
            </UIText>
          </Button>
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
                  getAuthorName={getAuthorName}
                  getAuthorAvatar={getAuthorAvatar}
                  parentNoteId={parentNoteId}
                  getNoteOwnerName={getNoteOwnerName}
                  onDelete={onDelete}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

