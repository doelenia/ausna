import {
  getResendClient,
  getResendFromEmail,
  getSiteUrl,
  listUnsubscribeMailHeaders,
} from '@/lib/email/resend'
import type { FeedOpenCallNote } from '@/lib/open-calls/feedOpenCallsForUser'
import { renderOpenCallDigestEmail } from '@/lib/email/templates/openCallDigestEmail'
import { buildEmailUnsubscribeUrl } from '@/lib/email/buildUnsubscribeUrl'

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

  const html = renderOpenCallDigestEmail({
    siteUrl,
    displayNotes: input.displayNotes,
    totalNew: input.totalNew,
    mainFeedUrl,
    unsubscribeUrl,
  })

  const subject = 'Open calls on Ausna'

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
