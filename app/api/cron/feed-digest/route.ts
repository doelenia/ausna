import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getFeedItemsForUserId } from '@/app/main/actions'
import { attachDigestPortfoliosToFeedItems } from '@/lib/email/digestAssignedPortfolio'
import { sendFeedDigestEmail } from '@/lib/email/feedDigest'

export const dynamic = 'force-dynamic'

const FEED_DIGEST_POOL_LIMIT = 200

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization') || ''
  if (auth === `Bearer ${secret}`) return true
  const qs = request.nextUrl.searchParams.get('secret') || ''
  return qs === secret
}

function computeSinceMs(lastUpdatedIso: string): number {
  const nowMs = Date.now()
  const oneHourAgoMs = nowMs - 60 * 60 * 1000
  const lastUpdatedMs = new Date(lastUpdatedIso).getTime()
  if (Number.isNaN(lastUpdatedMs)) {
    return oneHourAgoMs
  }
  return lastUpdatedMs < oneHourAgoMs ? oneHourAgoMs : lastUpdatedMs
}

export async function GET(request: NextRequest) {
  console.log('[feed-digest] START', {
    time: new Date().toISOString(),
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
  })

  if (!isAuthorized(request)) {
    console.warn('[feed-digest] Unauthorized request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceClient()
    const pageSize = 500

    let scanned = 0
    let eligible = 0
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
        console.error('[feed-digest] Failed to load human portfolios batch', {
          offset,
          pageSize,
          error: error.message,
        })
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (!humans || humans.length === 0) {
        break
      }

      for (const row of humans as any[]) {
        scanned += 1
        const userId = row.user_id as string
        const meta = (row.metadata || {}) as any
        const feedDigest = meta?.properties?.feed_digest || {}

        if (feedDigest.unsubscribed === true) {
          continue
        }

        const lastSentAt = feedDigest.last_sent_at as string | undefined
        if (lastSentAt) {
          const sentMs = new Date(lastSentAt).getTime()
          if (!Number.isNaN(sentMs) && Date.now() - sentMs < 60 * 60 * 1000) {
            continue
          }
        }

        const { data: ufs, error: ufsError } = await supabase
          .from('user_feed_state')
          .select('last_updated')
          .eq('user_id', userId)
          .maybeSingle()

        if (ufsError) {
          console.error('[feed-digest] user_feed_state query failed', { userId, error: ufsError.message })
          errors.push({ userId, error: ufsError.message })
          continue
        }

        if (!ufs?.last_updated) {
          continue
        }

        const sinceMs = computeSinceMs(ufs.last_updated as string)

        const feedResult = await getFeedItemsForUserId(
          supabase,
          userId,
          'all',
          null,
          0,
          FEED_DIGEST_POOL_LIMIT
        )

        if (!feedResult.success || !feedResult.items) {
          errors.push({
            userId,
            error: feedResult.error || 'Failed to load feed',
          })
          continue
        }

        const nowMs = Date.now()
        const newItems = feedResult.items.filter((item) => {
          const t = new Date(item.created_at).getTime()
          return !Number.isNaN(t) && t > sinceMs && t <= nowMs
        })

        if (newItems.length === 0) {
          continue
        }

        eligible += 1

        let authEmail: string | null = null
        try {
          const { data: userRes } = await supabase.auth.admin.getUserById(userId)
          authEmail = (userRes as any)?.user?.email ?? null
        } catch (e: any) {
          console.error('[feed-digest] Failed to load auth user for email', {
            userId,
            error: e?.message,
          })
          errors.push({
            userId,
            error: e?.message || 'Failed to load auth user for email',
          })
          continue
        }

        if (!authEmail) {
          continue
        }

        const displayItems = await attachDigestPortfoliosToFeedItems(
          supabase,
          newItems.slice(0, 3)
        )
        const sendResult = await sendFeedDigestEmail({
          toEmail: authEmail,
          userId,
          displayItems,
          totalNew: newItems.length,
        })

        if (!sendResult.success) {
          console.error('[feed-digest] Failed to send digest email', {
            userId,
            error: sendResult.error,
          })
          errors.push({ userId, error: sendResult.error })
          continue
        }

        emailsSent += 1

        const nextMetadata = {
          ...(meta || {}),
          properties: {
            ...(meta?.properties || {}),
            feed_digest: {
              ...feedDigest,
              last_sent_at: new Date().toISOString(),
            },
          },
        }

        const { error: updateError } = await supabase
          .from('portfolios')
          .update({ metadata: nextMetadata })
          .eq('id', row.id)

        if (updateError) {
          console.error('[feed-digest] Failed to update feed_digest metadata', {
            userId,
            portfolioId: row.id,
            error: updateError.message,
          })
          errors.push({
            userId,
            error: updateError.message || 'Failed to update feed_digest metadata',
          })
        }
      }
    }

    console.log('[feed-digest] DONE', {
      scanned_users: scanned,
      users_with_new_feed_items: eligible,
      emails_sent: emailsSent,
      error_count: errors.length,
    })

    return NextResponse.json({
      ok: true,
      scanned_users: scanned,
      users_with_new_feed_items: eligible,
      emails_sent: emailsSent,
      error_count: errors.length,
      errors: errors.slice(0, 50),
    })
  } catch (e: any) {
    console.error('[feed-digest] UNHANDLED ERROR', {
      error: e?.message,
      stack: e?.stack,
    })
    return NextResponse.json(
      { error: e?.message || 'Internal server error in feed-digest' },
      { status: 500 }
    )
  }
}
