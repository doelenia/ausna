import {
  getResendClient,
  getResendFromEmail,
  getSiteUrl,
  listUnsubscribeMailHeaders,
} from '@/lib/email/resend'
import type { FeedOpenCallNote } from '@/lib/open-calls/feedOpenCallsForUser'
import { renderOpenCallDigestEmail } from '@/lib/email/templates/openCallDigestEmail'
import { buildEmailUnsubscribeUrl } from '@/lib/email/buildUnsubscribeUrl'

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

function extractDigestNamesFromOpenCalls(notes: FeedOpenCallNote[]): string[] {
  const out: string[] = []
  for (const note of notes || []) {
    const profiles = Array.isArray((note as any)?.author_profiles)
      ? ((note as any).author_profiles as Array<{ name?: string }>)
      : []
    for (const p of profiles) {
      if (p?.name) out.push(p.name)
    }
  }
  return out
}

export async function sendOpenCallDigestEmail(input: {
  toEmail: string
  userId: string
  displayNotes: FeedOpenCallNote[]
  totalNew: number
}): Promise<{ success: true; messageId: string } | { success: false; error: string }> {
  const to = input.toEmail.trim()
  if (!to) return { success: false, error: 'Missing recipient email' }

  const siteUrl = getSiteUrl()
  const mainFeedUrl = `${siteUrl}/main?showOpenCalls=1&utm_source=open_call_digest_email&utm_medium=email`
  const unsubscribeUrl = buildEmailUnsubscribeUrl(input.userId, 'open_call_digest')

  const names = formatNameList(extractDigestNamesFromOpenCalls(input.displayNotes), { maxNames: 3 })

  const html = renderOpenCallDigestEmail({
    siteUrl,
    displayNotes: input.displayNotes,
    totalNew: input.totalNew,
    mainFeedUrl,
    unsubscribeUrl,
    names,
  })

  const subject = names ? `Open calls: ${names}` : 'Open calls'

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
