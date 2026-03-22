import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth/requireAdmin'
import { getFeedOpenCallsForUserId } from '@/lib/open-calls/feedOpenCallsForUser'
import { sendOpenCallDigestEmail } from '@/lib/email/openCallDigest'

export const dynamic = 'force-dynamic'

/**
 * Admin-only: email top 5 feed open calls (same stack order, includes viewed) for template QA.
 */
export async function GET() {
  const admin = await checkAdmin()
  if (!admin?.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = await createClient()
    const result = await getFeedOpenCallsForUserId(supabase, admin.id, {
      limit: 5,
      unviewedOnly: false,
    })

    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    if (result.openCalls.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No open calls to preview',
      })
    }

    const sendResult = await sendOpenCallDigestEmail({
      toEmail: admin.email!,
      userId: admin.id,
      displayNotes: result.openCalls,
      totalNew: result.openCalls.length,
    })

    if (!sendResult.success) {
      return NextResponse.json({ success: false, error: sendResult.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      messageId: sendResult.messageId,
      itemCount: result.openCalls.length,
    })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Internal error' },
      { status: 500 }
    )
  }
}
