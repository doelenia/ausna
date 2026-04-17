import { getResendClient, getResendFromEmail } from '@/lib/email/resend'
import { renderSpaceInviteEmail } from '@/lib/email/templates/spaceInviteEmail'

export async function sendSpaceInviteEmail(input: {
  toEmail: string
  inviterName: string
  inviteeName?: string | null
  actionLabel: 'Follow' | 'Join'
  spaceName: string
  spaceDescription?: string | null
  spaceAvatarUrl?: string | null
  spaceEmoji?: string | null
  inviteMessage?: string | null
  membersCount?: number | null
  hostNames?: string[] | null
  timeText?: string | null
  locationText?: string | null
  ctaUrl: string
  /** When set, the email renders Join/Follow/Pass CTA buttons instead of the generic one. New/pseudo users only. */
  newUserCtaLinks?: {
    joinUrl: string
    followUrl: string
    passUrl: string
  } | null
}): Promise<{ success: true; messageId: string } | { success: false; error: string }> {
  const to = input.toEmail.trim()
  if (!to) return { success: false, error: 'Missing recipient email' }

  const subject = `${input.inviterName} invited you to ${input.actionLabel.toLowerCase()} ${input.spaceName}`
  const html = renderSpaceInviteEmail(input)

  try {
    const result = await getResendClient().emails.send({
      from: getResendFromEmail(),
      to,
      subject,
      html,
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
