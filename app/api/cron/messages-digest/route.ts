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

    const tenMinutesAgoIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()

    console.log('[messages-digest] Using cutoff time', { tenMinutesAgoIso })

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

      const { data: recentUnreadMessages, error: recentUnreadError } = await supabase
        .from('messages')
        .select('sender_id, text, created_at')
          .eq('receiver_id', userId)
          .is('read_at', null)
          .gte('created_at', tenMinutesAgoIso)

        if (recentUnreadError) {
          console.error('[messages-digest] Failed to load recent unread messages', {
            userId,
            error: recentUnreadError.message,
          })
          errors.push({
            userId,
            error: recentUnreadError.message || 'Failed to load recent unread messages',
          })
          continue
        }

        if (!recentUnreadMessages || recentUnreadMessages.length === 0) {
          continue
        }

      const partnerIdsWithRecentUnread = new Set(
        recentUnreadMessages.map((m: any) => m.sender_id as string)
      )

      const latestUnreadByPartner = new Map<
        string,
        { text: string; created_at: string }
      >()

      for (const msg of recentUnreadMessages as any[]) {
        const senderId = msg.sender_id as string
        const createdAt = msg.created_at as string
        const existing = latestUnreadByPartner.get(senderId)

        if (
          !existing ||
          new Date(createdAt).getTime() > new Date(existing.created_at).getTime()
        ) {
          latestUnreadByPartner.set(senderId, {
            text: (msg.text as string) || '',
            created_at: createdAt,
          })
        }
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

        const unreadConversations = conversations.filter(
          (conv) => conv.unread_count > 0 && partnerIdsWithRecentUnread.has(conv.partner_id)
        )

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
        const latestUnread = latestUnreadByPartner.get(conv.partner_id)

        return {
          partnerName: conv.partner_name,
          partnerAvatarUrl: conv.partner_avatar_url ?? null,
          // Prefer the newest unread message from partner; fall back to last_message
          lastMessagePreview: (latestUnread?.text || conv.last_message.text || '') as string,
          unreadCount: conv.unread_count,
          lastMessageAt:
            (latestUnread?.created_at as string | undefined) ??
            (conv.last_message.created_at as string),
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

