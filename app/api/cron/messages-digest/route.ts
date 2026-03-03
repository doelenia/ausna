import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSiteUrl } from '@/lib/email/resend'
import { getConversationsForUserWithClient } from '@/lib/messages/conversations'
import { sendMessagesDigestEmail } from '@/lib/email/messagesDigest'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization') || ''
  if (auth === `Bearer ${secret}`) return true
  const qs = request.nextUrl.searchParams.get('secret') || ''
  return qs === secret
}

export async function GET(request: NextRequest) {
  // High-level entry log (no secrets)
  console.log('[messages-digest] START', {
    time: new Date().toISOString(),
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
  })

  if (!isAuthorized(request)) {
    console.warn('[messages-digest] Unauthorized request', {
      hasAuthHeader: !!request.headers.get('authorization'),
      hasSecretQueryParam: !!request.nextUrl.searchParams.get('secret'),
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceClient()
    const pageSize = 500

    let scanned = 0
    let withUnread = 0
    let emailsSent = 0
    const errors: Array<{ userId?: string; error: string }> = []

    for (let offset = 0; ; offset += pageSize) {
      const { data: humans, error } = await supabase
        .from('portfolios')
        .select('id, user_id, is_pseudo, metadata')
        .eq('type', 'human')
        .eq('is_pseudo', false)
        .range(offset, offset + pageSize - 1)

      if (error) {
        console.error('[messages-digest] Failed to load human portfolios batch', {
          offset,
          pageSize,
          error: error.message,
        })
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (!humans || humans.length === 0) {
        console.log('[messages-digest] No more humans to scan', { offset })
        break
      }

      console.log('[messages-digest] Loaded humans batch', {
        offset,
        batchSize: humans.length,
      })

      for (const row of humans as any[]) {
        scanned += 1
        const userId = row.user_id as string
        const meta = (row.metadata || {}) as any
        const messageDigest = meta?.properties?.message_digest || {}

        if (messageDigest.unsubscribed === true) {
          continue
        }

        let conversations
        try {
          conversations = await getConversationsForUserWithClient(
            supabase as any,
            userId,
            'active'
          )
        } catch (e: any) {
          console.error('[messages-digest] Failed to load conversations', {
            userId,
            error: e?.message,
          })
          errors.push({ userId, error: e?.message || 'Failed to load conversations' })
          continue
        }

        const unreadConversations = conversations.filter((conv) => conv.unread_count > 0)

        if (unreadConversations.length === 0) {
          continue
        }

        withUnread += 1

        let authEmail: string | null = null
        try {
          const { data: userRes } = await supabase.auth.admin.getUserById(userId)
          authEmail = (userRes as any)?.user?.email ?? null
        } catch (e: any) {
          console.error('[messages-digest] Failed to load auth user for email', {
            userId,
            error: e?.message,
          })
          errors.push({
            userId,
            error: e?.message || 'Failed to load auth user for email',
          })
        }

        if (!authEmail) {
          continue
        }

        const siteUrl = getSiteUrl()
        const messagesUrl = `${siteUrl}/messages?utm_source=messages_digest_email&utm_medium=email`

        const conversationsForEmail = unreadConversations.map((conv) => {
          const last = conv.last_message as any
          const isSentByMe = last.sender_id !== conv.partner_id
          const baseText = (last.text || '').trim()

          let previewText = baseText

          if (!previewText) {
            const hasNote = !!last.note_id
            const isCommentPreview = last.message_type === 'comment_preview'
            const hasAnnotation = !!last.annotation_id

            if (isCommentPreview) {
              if (hasAnnotation) {
                // Comment notification
                previewText = isSentByMe
                  ? 'You commented on: ...'
                  : 'Sent you a comment on: ...'
              } else if (hasNote) {
                // Reaction (like) notification on a note
                previewText = isSentByMe
                  ? 'You reacted to a note with ❤️ ...'
                  : 'Reacted to your note with ❤️ ...'
              } else {
                // Fallback comment preview
                previewText = isSentByMe
                  ? 'You sent an update on: ...'
                  : 'Sent you an update on: ...'
              }
            } else if (hasNote) {
              // Generic note/share preview
              previewText = isSentByMe
                ? 'You shared a note: ...'
                : 'Shared a note with you: ...'
            } else {
              // Generic fallback so the preview is never empty
              previewText = isSentByMe ? 'You sent a message' : 'New message'
            }
          }

          const lastMessageAt = last.created_at as string

          console.log('[messages-digest] Conversation digest payload', {
            userId,
            partnerId: conv.partner_id,
            unread_count: conv.unread_count,
            lastMessageAt,
            lastMessagePreview:
              typeof previewText === 'string'
                ? previewText.slice(0, 120)
                : typeof previewText,
            lastConversationMessageId: last?.id,
            lastConversationMessageCreatedAt: last?.created_at,
          })

          return {
            partnerName: conv.partner_name,
            partnerAvatarUrl: conv.partner_avatar_url ?? null,
            lastMessagePreview: previewText,
            unreadCount: conv.unread_count,
            lastMessageAt,
          }
        })

        console.log('[messages-digest] Sending digest email', {
          userId,
          hasEmail: !!authEmail,
          conversationCount: conversationsForEmail.length,
          messagesUrl,
        })

        const sendResult = await sendMessagesDigestEmail({
          toEmail: authEmail,
          conversations: conversationsForEmail,
        })

        if (!sendResult.success) {
          console.error('[messages-digest] Failed to send digest email', {
            userId,
            error: sendResult.error,
          })
          errors.push({ userId, error: sendResult.error })
          continue
        }

        emailsSent += 1

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fab1a5e4-0675-4ead-a1dd-862094e22f59', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': 'e7d925',
        },
        body: JSON.stringify({
          sessionId: 'e7d925',
          runId: 'post-send',
          hypothesisId: 'L1',
          location: 'app/api/cron/messages-digest/route.ts:139',
          message: 'Digest email sent successfully; preparing to update message_digest',
          data: {
            userId,
            portfolioId: row.id,
            lastSentAtIso: messageDigest.last_sent_at as string | undefined,
            hadMessageDigest: !!messageDigest,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion agent log

      const nextMetadata = {
        ...(meta || {}),
        properties: {
          ...(meta?.properties || {}),
          message_digest: {
            ...messageDigest,
            last_sent_at: new Date().toISOString(),
          },
        },
      }

        const { error: updateError } = await supabase
          .from('portfolios')
          .update({ metadata: nextMetadata })
          .eq('id', row.id)

        if (updateError) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/fab1a5e4-0675-4ead-a1dd-862094e22f59', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': 'e7d925',
          },
          body: JSON.stringify({
            sessionId: 'e7d925',
            runId: 'post-send',
            hypothesisId: 'L2',
            location: 'app/api/cron/messages-digest/route.ts:152',
            message: 'Failed to update message_digest metadata after send',
            data: {
              userId,
              portfolioId: row.id,
              errorMessage: updateError.message ?? null,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion agent log

          console.error('[messages-digest] Failed to update message_digest metadata', {
            userId,
            portfolioId: row.id,
            error: updateError.message,
          })
          errors.push({
            userId,
            error: updateError.message || 'Failed to update message_digest metadata',
          })
        } else {
          console.log('[messages-digest] Updated message_digest metadata', {
            userId,
            portfolioId: row.id,
          })
        }
      }
    }
    console.log('[messages-digest] DONE', {
      scanned_users: scanned,
      users_with_unread_active: withUnread,
      emails_sent: emailsSent,
      error_count: errors.length,
    })

    return NextResponse.json({
      ok: true,
      scanned_users: scanned,
      users_with_unread_active: withUnread,
      emails_sent: emailsSent,
      error_count: errors.length,
      errors: errors.slice(0, 50),
    })
  } catch (e: any) {
    console.error('[messages-digest] UNHANDLED ERROR', {
      error: e?.message,
      stack: e?.stack,
    })
    return NextResponse.json(
      { error: e?.message || 'Internal server error in messages-digest' },
      { status: 500 }
    )
  }
}

