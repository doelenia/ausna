import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/requireAdmin'
import { getFeedItemsForUserId } from '@/app/main/actions'
import { sendFeedDigestEmail } from '@/lib/email/feedDigest'

export const dynamic = 'force-dynamic'

/**
 * Admin-only: send a feed digest email with the newest 3 feed items (no time / user_feed_state filter).
 * For visual QA of the template.
 */
export async function GET() {
  const admin = await checkAdmin()
  if (!admin?.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = await createClient()
    const result = await getFeedItemsForUserId(supabase, admin.id, 'all', null, 0, 3)

    if (!result.success || !result.items) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to load feed' },
        { status: 500 }
      )
    }

    const items = result.items
    if (items.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No feed items to preview',
      })
    }

    const sendResult = await sendFeedDigestEmail({
      toEmail: admin.email!,
      userId: admin.id,
      displayItems: items,
      totalNew: items.length,
    })

    if (!sendResult.success) {
      return NextResponse.json({ success: false, error: sendResult.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      messageId: sendResult.messageId,
      itemCount: items.length,
    })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 }
    )
  }
}
