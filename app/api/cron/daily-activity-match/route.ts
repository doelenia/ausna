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
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!humans || humans.length === 0) break

    for (const row of humans as any[]) {
      scanned += 1
      const userId = row.user_id as string
      const meta = row.metadata as any
      const tz = meta?.properties?.timezone
      if (typeof tz !== 'string' || !tz.trim()) continue

      const eightAmCheck = isLocalEightAmNow({ now, timeZone: tz.trim() })
      if (!eightAmCheck.ok) continue

      if (meta?.properties?.daily_explore_match?.unsubscribed === true) continue

      const lastRanAtIso = meta?.properties?.daily_explore_match?.ran_at
      if (typeof lastRanAtIso === 'string') {
        const lastRanLocal = localDateForIso(lastRanAtIso, tz.trim())
        if (lastRanLocal && lastRanLocal === eightAmCheck.localDate) {
          continue
        }
      }

      ran += 1

      const daily = await computeAndStoreDailyExploreMatchService(userId)
      if (!daily.success) {
        errors.push({ userId, error: daily.error ?? 'Failed to compute match' })
        continue
      }

      if (!daily.activities || daily.activities.length < 1) continue

      let authEmail: string | null = null
      try {
        const { data: userRes } = await supabase.auth.admin.getUserById(userId)
        authEmail = (userRes as any)?.user?.email ?? null
      } catch (e: any) {
        console.error('cron daily-activity-match: getUserById failed', userId, e)
      }

      const toEmail = extractUserEmail({ authEmail, portfolioMetadata: meta })
      if (!toEmail) {
        errors.push({ userId, error: 'No email address found for user' })
        continue
      }

      const introText =
        (daily.introText || '').trim() ||
        'A few activities stood out for you today. Take a look and see what feels right.'

      const userName =
        (meta?.basic?.name && typeof meta.basic.name === 'string' && meta.basic.name.trim()) || undefined

      const dateLabel = (() => {
        const ymd = eightAmCheck.localDate
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
        errors.push({ userId, error: sendResult.error })
        continue
      }

      emailed += 1
    }
  }

  return NextResponse.json({
    ok: true,
    scanned_users: scanned,
    matches_ran: ran,
    emails_sent: emailed,
    error_count: errors.length,
    errors: errors.slice(0, 50),
  })
}

