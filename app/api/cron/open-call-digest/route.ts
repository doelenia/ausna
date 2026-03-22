import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getFeedOpenCallsForUserId } from '@/lib/open-calls/feedOpenCallsForUser'
import { sendOpenCallDigestEmail } from '@/lib/email/openCallDigest'

export const dynamic = 'force-dynamic'

const DIGEST_DISPLAY_LIMIT = 5

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization') || ''
  if (auth === `Bearer ${secret}`) return true
  const qs = request.nextUrl.searchParams.get('secret') || ''
  return qs === secret
}

function alreadySentOpenCallDigestTodayUtc(lastSentAtIso: string): boolean {
  const sent = new Date(lastSentAtIso)
  if (Number.isNaN(sent.getTime())) return false
  const now = new Date()
  return (
    sent.getUTCFullYear() === now.getUTCFullYear() &&
    sent.getUTCMonth() === now.getUTCMonth() &&
    sent.getUTCDate() === now.getUTCDate()
  )
}

export async function GET(request: NextRequest) {
  console.log('[open-call-digest] START', {
    time: new Date().toISOString(),
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
  })

  if (!isAuthorized(request)) {
    console.warn('[open-call-digest] Unauthorized request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceClient()
    const pageSize = 500

    let scanned = 0
    let withUnviewed = 0
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
        console.error('[open-call-digest] Failed to load human portfolios batch', {
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
        const digestMeta = meta?.properties?.open_call_digest || {}

        if (digestMeta.unsubscribed === true) {
          continue
        }

        const lastSentAt = digestMeta.last_sent_at as string | undefined
        if (lastSentAt && alreadySentOpenCallDigestTodayUtc(lastSentAt)) {
          continue
        }

        const result = await getFeedOpenCallsForUserId(supabase, userId, {
          limit: DIGEST_DISPLAY_LIMIT,
          unviewedOnly: true,
        })

        if (result.error) {
          errors.push({ userId, error: result.error })
          continue
        }

        if (result.totalMatching === 0) {
          continue
        }

        withUnviewed += 1

        let authEmail: string | null = null
        try {
          const { data: userRes } = await supabase.auth.admin.getUserById(userId)
          authEmail = (userRes as any)?.user?.email ?? null
        } catch (e: any) {
          errors.push({
            userId,
            error: e?.message || 'Failed to load auth user for email',
          })
          continue
        }

        if (!authEmail) {
          continue
        }

        const sendResult = await sendOpenCallDigestEmail({
          toEmail: authEmail,
          userId,
          displayNotes: result.openCalls,
          totalNew: result.totalMatching,
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
            open_call_digest: {
              ...digestMeta,
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
            error: updateError.message || 'Failed to update open_call_digest metadata',
          })
        }
      }
    }

    console.log('[open-call-digest] DONE', {
      scanned_users: scanned,
      users_with_unviewed_open_calls: withUnviewed,
      emails_sent: emailsSent,
      error_count: errors.length,
    })

    return NextResponse.json({
      ok: true,
      scanned_users: scanned,
      users_with_unviewed_open_calls: withUnviewed,
      emails_sent: emailsSent,
      error_count: errors.length,
      errors: errors.slice(0, 50),
    })
  } catch (e: any) {
    console.error('[open-call-digest] UNHANDLED ERROR', {
      error: e?.message,
      stack: e?.stack,
    })
    return NextResponse.json(
      { error: e?.message || 'Internal server error in open-call-digest' },
      { status: 500 }
    )
  }
}
