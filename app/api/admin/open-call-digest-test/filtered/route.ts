import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/requireAdmin'
import { getFeedOpenCallsForUserId } from '@/lib/open-calls/feedOpenCallsForUser'
import { sendOpenCallDigestEmail } from '@/lib/email/openCallDigest'

export const dynamic = 'force-dynamic'

const DIGEST_DISPLAY_LIMIT = 5

/**
 * Admin-only: production logic — unviewed feed open calls only (max 5 in body).
 */
export async function GET() {
  const admin = await checkAdmin()
  if (!admin?.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = await createClient()
    const result = await getFeedOpenCallsForUserId(supabase, admin.id, {
      limit: DIGEST_DISPLAY_LIMIT,
      unviewedOnly: true,
    })

    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    if (result.totalMatching === 0) {
      return NextResponse.json({
        success: false,
        error: 'No unviewed open calls match the production digest filter.',
      })
    }

    const sendResult = await sendOpenCallDigestEmail({
      toEmail: admin.email!,
      userId: admin.id,
      displayNotes: result.openCalls,
      totalNew: result.totalMatching,
    })

    if (!sendResult.success) {
      return NextResponse.json({ success: false, error: sendResult.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      messageId: sendResult.messageId,
      totalNew: result.totalMatching,
      displayed: result.openCalls.length,
    })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 }
    )
  }
}
