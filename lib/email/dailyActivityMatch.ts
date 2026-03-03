import { getResendClient, getResendFromEmail, getSiteUrl } from '@/lib/email/resend'
import { renderDailyActivityMatchEmail } from '@/lib/email/templates/dailyActivityMatchEmail'
import { DEFAULT_ACTIVITY_PATTERN_PATH } from '@/lib/explore/activityPatterns'

export async function sendDailyActivityMatchEmail(input: {
  toEmail: string
  exploreUrl: string
  /** When set, adds List-Unsubscribe headers and footer link. */
  unsubscribeUrl?: string
  introText: string
  userName?: string
  dateLabel?: string
  patternPath?: string
  activities?: Array<{
    timeLabel?: string
    locationLabel?: string
    hostLabel?: string
    interestLabels?: string[]
    friendsLabel?: string
  }>
  subject?: string
}): Promise<{ success: true; messageId: string } | { success: false; error: string }> {
  const to = input.toEmail.trim()
  if (!to) return { success: false, error: 'Missing recipient email' }

  const baseSubject = input.subject || 'Ausna matches for today'
  const namePart = input.userName ? input.userName.trim() : ''
  const datePart = input.dateLabel ? `[${input.dateLabel.trim()}] ` : ''
  const subjectCore = namePart ? `${namePart} – ${baseSubject}` : baseSubject
  const subject = `${datePart}${subjectCore}`.trim()
  const patternPath = input.patternPath ?? DEFAULT_ACTIVITY_PATTERN_PATH
  const patternUrl = `${getSiteUrl()}${patternPath}`

  const html = renderDailyActivityMatchEmail({
    introText: input.introText,
    exploreUrl: input.exploreUrl,
    unsubscribeUrl: input.unsubscribeUrl,
    userName: input.userName,
    dateLabel: input.dateLabel,
    activities: input.activities,
    patternUrl,
  })

  const headers: Record<string, string> = {}
  if (input.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${input.unsubscribeUrl}>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }

  try {
    const result = await getResendClient().emails.send({
      from: getResendFromEmail(),
      to,
      subject,
      html,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    })

    if ((result as any)?.error) {
      return { success: false, error: (result as any).error?.message ?? 'Failed to send email' }
    }

    const id = (result as any)?.data?.id
    if (!id) return { success: false, error: 'Resend did not return a message id' }
    return { success: true, messageId: id }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Failed to send email' }
  }
}

