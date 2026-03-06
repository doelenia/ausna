import { getResendClient, getResendFromEmail } from '@/lib/email/resend'
import { renderContactInviteEmail } from '@/lib/email/templates/contactInviteEmail'

export async function sendContactInviteEmail(input: {
  toEmail: string
  inviterName: string
  inviteeName: string
  inviteLink: string
}): Promise<{ success: true; messageId: string } | { success: false; error: string }> {
  const to = input.toEmail.trim()
  if (!to) return { success: false, error: 'Missing recipient email' }

  const html = renderContactInviteEmail({
    inviterName: input.inviterName,
    inviteeName: input.inviteeName,
    inviteLink: input.inviteLink,
  })

  try {
    const result = await getResendClient().emails.send({
      from: getResendFromEmail(),
      to,
      subject: "You're invited to Ausna",
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
