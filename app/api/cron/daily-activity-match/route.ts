import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { computeAndStoreDailyExploreMatchService } from '@/lib/explore/dailyExploreMatchService'
import { sendDailyActivityMatchEmail } from '@/lib/email/dailyActivityMatch'
import { getSiteUrl } from '@/lib/email/resend'
import { createUnsubscribeToken } from '@/lib/email/unsubscribeToken'
import { formatActivityLocation } from '@/lib/formatActivityLocation'
import { DEFAULT_ACTIVITY_PATTERN_PATH } from '@/lib/explore/activityPatterns'
import { isLocalEightAmNow, localDateForIso } from '@/lib/timezone/localTime'

export const dynamic = 'force-dynamic'
/** Avoid caching large Supabase responses (e.g. topics with name_vector) that exceed Next.js 2MB cache limit. */
export const fetchCache = 'force-no-store'

/** Default timezone when user has no timezone set (e.g. no location recorded). */
const DEFAULT_TIMEZONE = 'Asia/Tokyo'

/** For local/testing: skip 8am check so match+email run for eligible users. Use ?force_run=1 with CRON_SECRET. */
function isForceRun(request: NextRequest): boolean {
  if (process.env.VERCEL_ENV === 'production') return false
  return request.nextUrl.searchParams.get('force_run') === '1'
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization') || ''
  if (auth === `Bearer ${secret}`) return true
  const qs = request.nextUrl.searchParams.get('secret') || ''
  return qs === secret
}

function extractUserEmail(input: { authEmail?: string | null; portfolioMetadata?: any }): string | null {
  const authEmail = typeof input.authEmail === 'string' ? input.authEmail.trim() : ''
  if (authEmail) return authEmail

  const meta = input.portfolioMetadata || {}
  const metaEmail = typeof meta.email === 'string' ? meta.email.trim() : ''
  if (metaEmail) return metaEmail

  const basicEmail = typeof meta?.basic?.email === 'string' ? meta.basic.email.trim() : ''
  if (basicEmail) return basicEmail

  return null
}

export async function GET(request: NextRequest) {
  const forceRun = isForceRun(request)
  console.log('[daily-activity-match] START', {
    time: new Date().toISOString(),
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    force_run: forceRun,
  })

  if (!isAuthorized(request)) {
    console.warn('[daily-activity-match] Unauthorized request', {
      hasAuthHeader: !!request.headers.get('authorization'),
      hasSecretQueryParam: !!request.nextUrl.searchParams.get('secret'),
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
  const supabase = createServiceClient()
  const siteUrl = getSiteUrl()
  const exploreUrl = `${siteUrl}/explore?utm_source=daily_match_email&utm_medium=email`

  const now = new Date()
  const pageSize = 500

  let scanned = 0
  let ran = 0
  let emailed = 0
  const errors: Array<{ userId?: string; error: string }> = []

  for (let offset = 0; ; offset += pageSize) {
    const { data: humans, error } = await supabase
      .from('portfolios')
      .select('id, user_id, is_pseudo, metadata')
      .eq('type', 'human')
      .eq('is_pseudo', false)
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error('[daily-activity-match] Failed to load human portfolios batch', {
        offset,
        pageSize,
        error: error.message,
      })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!humans || humans.length === 0) {
      console.log('[daily-activity-match] No more humans to scan', { offset })
      break
    }

    console.log('[daily-activity-match] Loaded humans batch', {
      offset,
      batchSize: humans.length,
    })

    for (const row of humans as any[]) {
      scanned += 1
      const userId = row.user_id as string
      const meta = row.metadata as any
      const tzRaw = meta?.properties?.timezone
      const tz = typeof tzRaw === 'string' && tzRaw.trim() ? tzRaw.trim() : DEFAULT_TIMEZONE
      const usedDefaultTz = !(typeof tzRaw === 'string' && tzRaw.trim())

      if (!forceRun) {
        const eightAmCheck = isLocalEightAmNow({ now, timeZone: tz })
        if (!eightAmCheck.ok) {
          console.log('[daily-activity-match] Skip user; not 8am local', {
            userId,
            timezone: tz,
            usedDefaultTz,
            reason: eightAmCheck.reason,
          })
          continue
        }

        if (meta?.properties?.daily_explore_match?.unsubscribed === true) {
          console.log('[daily-activity-match] Skip user; unsubscribed', { userId })
          continue
        }

        const lastRanAtIso = meta?.properties?.daily_explore_match?.ran_at
        if (typeof lastRanAtIso === 'string') {
          const lastRanLocal = localDateForIso(lastRanAtIso, tz)
          if (lastRanLocal && lastRanLocal === eightAmCheck.localDate) {
            console.log('[daily-activity-match] Skip user; already ran today', {
              userId,
              lastRanAtIso,
              localDate: lastRanLocal,
            })
            continue
          }
        }
      } else {
        if (meta?.properties?.daily_explore_match?.unsubscribed === true) {
          console.log('[daily-activity-match] Skip user; unsubscribed (force_run)', { userId })
          continue
        }
      }

      console.log('[daily-activity-match] Running match for user', {
        userId,
        timezone: tz,
        usedDefaultTz,
      })
      ran += 1

      const daily = await computeAndStoreDailyExploreMatchService(userId)
      if (!daily.success) {
        console.error('[daily-activity-match] Compute match failed', {
          userId,
          error: daily.error,
        })
        errors.push({ userId, error: daily.error ?? 'Failed to compute match' })
        continue
      }

      if (!daily.activities || daily.activities.length < 1) {
        console.log('[daily-activity-match] No activities to email', {
          userId,
          activityCount: daily.activities?.length ?? 0,
        })
        continue
      }

      let authEmail: string | null = null
      try {
        const { data: userRes } = await supabase.auth.admin.getUserById(userId)
        authEmail = (userRes as any)?.user?.email ?? null
      } catch (e: any) {
        console.error('[daily-activity-match] getUserById failed', {
          userId,
          error: e?.message,
        })
        errors.push({ userId, error: e?.message ?? 'Failed to get user' })
        continue
      }

      const toEmail = extractUserEmail({ authEmail, portfolioMetadata: meta })
      if (!toEmail) {
        console.error('[daily-activity-match] No email for user', { userId })
        errors.push({ userId, error: 'No email address found for user' })
        continue
      }

      const introText =
        (daily.introText || '').trim() ||
        'A few activities stood out for you today. Take a look and see what feels right.'

      const userName =
        (meta?.basic?.name && typeof meta.basic.name === 'string' && meta.basic.name.trim()) || undefined

      const localDateYmd = localDateForIso(now.toISOString(), tz)
      const dateLabel = (() => {
        const ymd = localDateYmd
        if (!ymd) return undefined
        const d = new Date(`${ymd}T00:00:00`)
        if (Number.isNaN(d.getTime())) return undefined
        return new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
        }).format(d)
      })()

      const unsubscribeToken = createUnsubscribeToken(userId)
      const unsubscribeUrl = `${siteUrl}/api/unsubscribe/daily-match?token=${encodeURIComponent(unsubscribeToken)}`

      console.log('[daily-activity-match] Sending email', {
        userId,
        toEmail: toEmail.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
        activityCount: daily.activities.length,
      })

      const sendResult = await sendDailyActivityMatchEmail({
        toEmail,
        exploreUrl,
        unsubscribeUrl,
        introText,
        userName,
        dateLabel,
        patternPath: daily.patternPath ?? DEFAULT_ACTIVITY_PATTERN_PATH,
        activities: daily.activities.map((a) => ({
          timeLabel: a.activity.activityDateTime?.start
            ? new Intl.DateTimeFormat(undefined, {
                month: 'short',
                day: 'numeric',
              }).format(new Date(a.activity.activityDateTime.start))
            : undefined,
          locationLabel: (() => {
            if (!a.activity.location) return undefined
            const { line1, line2 } = formatActivityLocation(a.activity.location)
            return line2 || line1 || undefined
          })(),
          hostLabel: (() => {
            const host = a.highlight.host
            if (!host) return undefined
            if (host.kind === 'friend') return host.name
            if (host.kind === 'project') return host.name
            if (host.kind === 'community') return host.name
            return undefined
          })(),
          interestLabels: a.highlight.interestTags.map((t) => t.topicName),
          friendsLabel: (() => {
            const f = a.highlight.friends
            if (!f) return undefined
            if (f.topFriends.length === 0) return undefined
            if (f.topFriends.length === 1 && f.extraCount === 0) return `${f.topFriends[0].name} is going`
            const count = f.topFriends.length + f.extraCount
            return `${count} friends are going`
          })(),
        })),
      })

      if (!sendResult.success) {
        console.error('[daily-activity-match] Send email failed', {
          userId,
          error: sendResult.error,
        })
        errors.push({ userId, error: sendResult.error })
        continue
      }

      emailed += 1
      console.log('[daily-activity-match] Email sent', { userId })
    }
  }

  console.log('[daily-activity-match] DONE', {
    scanned_users: scanned,
    matches_ran: ran,
    emails_sent: emailed,
    error_count: errors.length,
  })

  return NextResponse.json({
    ok: true,
    scanned_users: scanned,
    matches_ran: ran,
    emails_sent: emailed,
    error_count: errors.length,
    errors: errors.slice(0, 50),
  })
  } catch (e: unknown) {
    const err = e as { message?: string; stack?: string }
    console.error('[daily-activity-match] UNHANDLED ERROR', {
      error: err?.message,
      stack: err?.stack,
    })
    return NextResponse.json(
      { error: err?.message ?? 'Internal server error in daily-activity-match' },
      { status: 500 }
    )
  }
}

