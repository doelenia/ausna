import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSiteUrl } from '@/lib/email/resend'
import { getConversationsForUser } from '@/lib/messages/conversations'
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
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const pageSize = 500

  let scanned = 0
  let withUnread = 0
  let emailsSent = 0
  let skippedByCooldown = 0
  const errors: Array<{ userId?: string; error: string }> = []

  for (let offset = 0; ; offset += pageSize) {
    const { data: humans, error } = await supabase
      .from('portfolios')
      .select('id, user_id, is_pseudo, metadata')
      .eq('type', 'human')
      .eq('is_pseudo', false)
      .range(offset, offset + pageSize - 1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!humans || humans.length === 0) break

    for (const row of humans as any[]) {
      scanned += 1
      const userId = row.user_id as string
      const meta = (row.metadata || {}) as any
      const messageDigest = meta?.properties?.message_digest || {}

      if (messageDigest.unsubscribed === true) continue

      const lastSentAtIso = messageDigest.last_sent_at as string | undefined
      if (lastSentAtIso) {
        const lastSent = new Date(lastSentAtIso)
        if (!Number.isNaN(lastSent.getTime())) {
          const diffMs = Date.now() - lastSent.getTime()
          if (diffMs < 10 * 60 * 1000) {
            skippedByCooldown += 1
            continue
          }
        }
      }

      let conversations
      try {
        conversations = await getConversationsForUser(userId, 'active')
      } catch (e: any) {
        errors.push({ userId, error: e?.message || 'Failed to load conversations' })
        continue
      }

      const unreadConversations = conversations.filter(
        (conv) => conv.unread_count > 0
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

      const conversationsForEmail = unreadConversations.map((conv) => ({
        partnerName: conv.partner_name,
        partnerAvatarUrl: conv.partner_avatar_url ?? null,
        lastMessagePreview: conv.last_message.text || '',
        unreadCount: conv.unread_count,
        lastMessageAt: conv.last_message.created_at,
      }))

      const sendResult = await sendMessagesDigestEmail({
        toEmail: authEmail,
        conversations: conversationsForEmail,
      })

      if (!sendResult.success) {
        errors.push({ userId, error: sendResult.error })
        continue
      }

      emailsSent += 1

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
        errors.push({
          userId,
          error: updateError.message || 'Failed to update message_digest metadata',
        })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    scanned_users: scanned,
    users_with_unread_active: withUnread,
    emails_sent: emailsSent,
    skipped_by_cooldown: skippedByCooldown,
    error_count: errors.length,
    errors: errors.slice(0, 50),
  })
}

