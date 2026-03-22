import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/requireAdmin'
import { getFeedItemsForUserId } from '@/app/main/actions'
import { attachDigestPortfoliosToFeedItems } from '@/lib/email/digestAssignedPortfolio'
import { sendFeedDigestEmail } from '@/lib/email/feedDigest'

export const dynamic = 'force-dynamic'

const FEED_DIGEST_POOL_LIMIT = 200

function computeSinceMs(lastUpdatedIso: string): number {
  const nowMs = Date.now()
  const oneHourAgoMs = nowMs - 60 * 60 * 1000
  const lastUpdatedMs = new Date(lastUpdatedIso).getTime()
  if (Number.isNaN(lastUpdatedMs)) {
    return oneHourAgoMs
  }
  return lastUpdatedMs < oneHourAgoMs ? oneHourAgoMs : lastUpdatedMs
}

/**
 * Admin-only: send feed digest using production waterline logic (user_feed_state.last_updated vs 1h window).
 */
export async function GET() {
  const admin = await checkAdmin()
  if (!admin?.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = await createClient()

    const { data: ufs, error: ufsError } = await supabase
      .from('user_feed_state')
      .select('last_updated')
      .eq('user_id', admin.id)
      .maybeSingle()

    if (ufsError) {
      return NextResponse.json(
        { success: false, error: ufsError.message || 'Failed to load user_feed_state' },
        { status: 500 }
      )
    }

    if (!ufs?.last_updated) {
      return NextResponse.json(
        {
          success: false,
          error: 'This test requires a user_feed_state row (use the app feed so feed state is created).',
        },
        { status: 400 }
      )
    }

    const sinceMs = computeSinceMs(ufs.last_updated as string)

    const feedResult = await getFeedItemsForUserId(
      supabase,
      admin.id,
      'all',
      null,
      0,
      FEED_DIGEST_POOL_LIMIT
    )

    if (!feedResult.success || !feedResult.items) {
      return NextResponse.json(
        { success: false, error: feedResult.error || 'Failed to load feed' },
        { status: 500 }
      )
    }

    const nowMs = Date.now()
    const newItems = feedResult.items.filter((item) => {
      const t = new Date(item.created_at).getTime()
      return !Number.isNaN(t) && t > sinceMs && t <= nowMs
    })

    if (newItems.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No new feed items match the digest window for your account.',
        sinceMs,
      })
    }

    const displayItems = await attachDigestPortfoliosToFeedItems(supabase, newItems.slice(0, 3))
    const sendResult = await sendFeedDigestEmail({
      toEmail: admin.email!,
      userId: admin.id,
      displayItems,
      totalNew: newItems.length,
    })

    if (!sendResult.success) {
      return NextResponse.json({ success: false, error: sendResult.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      messageId: sendResult.messageId,
      totalNew: newItems.length,
      displayed: displayItems.length,
    })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 }
    )
  }
}
