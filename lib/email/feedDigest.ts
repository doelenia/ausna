import {
  getResendClient,
  getResendFromEmail,
  getSiteUrl,
  listUnsubscribeMailHeaders,
} from '@/lib/email/resend'
import type { FeedItem } from '@/app/main/actions'
import { renderFeedDigestEmail } from '@/lib/email/templates/feedDigestEmail'
import { buildEmailUnsubscribeUrl } from '@/lib/email/buildUnsubscribeUrl'

/** Lookback floor for “new” items and minimum spacing between feed digest sends (8 hours). */
export const FEED_DIGEST_WINDOW_MS = 8 * 60 * 60 * 1000

/**
 * Waterline for digest “new” items: max(user_feed_state.last_updated, now − 8h).
 * Items with created_at in (sinceMs, now] are eligible.
 */
export function computeFeedDigestSinceMs(lastUpdatedIso: string): number {
  const nowMs = Date.now()
  const floorMs = nowMs - FEED_DIGEST_WINDOW_MS
  const lastUpdatedMs = new Date(lastUpdatedIso).getTime()
  if (Number.isNaN(lastUpdatedMs)) {
    return floorMs
  }
  return lastUpdatedMs < floorMs ? floorMs : lastUpdatedMs
}

/** True if a digest was sent recently enough that we should skip this cron run. */
export function isWithinFeedDigestSendCooldown(lastSentAtIso: string): boolean {
  const sent = new Date(lastSentAtIso)
  if (Number.isNaN(sent.getTime())) return false
  return Date.now() - sent.getTime() < FEED_DIGEST_WINDOW_MS
}

function formatNameList(names: string[], opts?: { maxNames?: number }): string {
  const maxNames = opts?.maxNames ?? 3
  const clean = names.map((n) => (n || '').trim()).filter(Boolean)
  const unique: string[] = []
  const seen = new Set<string>()
  for (const n of clean) {
    const key = n.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(n)
  }
  if (unique.length === 0) return ''
  if (unique.length === 1) return unique[0]
  if (unique.length === 2) return `${unique[0]} & ${unique[1]}`
  const head = unique.slice(0, maxNames)
  const remaining = unique.length - head.length
  if (remaining <= 0) {
    return `${head.slice(0, -1).join(', ')} & ${head[head.length - 1]}`
  }
  return `${head.join(', ')} & ${remaining} others`
}

function extractDigestNamesFromFeedItems(items: FeedItem[]): string[] {
  const out: string[] = []
  for (const item of items || []) {
    if (item.kind === 'note') {
      const profiles = Array.isArray((item.note as any)?.author_profiles)
        ? ((item.note as any).author_profiles as Array<{ name?: string }>)
        : []
      for (const p of profiles) {
        if (p?.name) out.push(p.name)
      }
    } else if (item.kind === 'portfolio_created') {
      if (item.creator_profile?.name) out.push(item.creator_profile.name)
    }
  }
  return out
}

export async function sendFeedDigestEmail(input: {
  toEmail: string
  userId: string
  displayItems: FeedItem[]
  totalNew: number
}): Promise<{ success: true; messageId: string } | { success: false; error: string }> {
  const to = input.toEmail.trim()
  if (!to) return { success: false, error: 'Missing recipient email' }

  const siteUrl = getSiteUrl()
  const mainFeedUrl = `${siteUrl}/main?utm_source=feed_digest_email&utm_medium=email`
  const unsubscribeUrl = buildEmailUnsubscribeUrl(input.userId, 'feed_digest')

  const names = formatNameList(extractDigestNamesFromFeedItems(input.displayItems), { maxNames: 3 })

  const html = renderFeedDigestEmail({
    siteUrl,
    displayItems: input.displayItems,
    totalNew: input.totalNew,
    mainFeedUrl,
    unsubscribeUrl,
    names,
  })

  const subject = names ? `New on your feed: ${names}` : 'New on your feed'

  const headers = listUnsubscribeMailHeaders(unsubscribeUrl)

  try {
    const result = await getResendClient().emails.send({
      from: getResendFromEmail(),
      to,
      subject,
      html,
      headers,
    })

    if ((result as any)?.error) {
      return {
        success: false,
        error: (result as any).error?.message ?? 'Failed to send email',
      }
    }

    const id = (result as any)?.data?.id
    if (!id) return { success: false, error: 'Resend did not return a message id' }
    return { success: true, messageId: id }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Failed to send email' }
  }
}
