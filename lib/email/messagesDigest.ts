import { getResendClient, getResendFromEmail, getSiteUrl } from '@/lib/email/resend'
import {
  MessagesDigestConversationInput,
  renderMessagesDigestEmail,
} from '@/lib/email/templates/messagesDigestEmail'

export async function sendMessagesDigestEmail(input: {
  toEmail: string
  userName?: string
  conversations: MessagesDigestConversationInput[]
}): Promise<{ success: true; messageId: string } | { success: false; error: string }> {
  const to = input.toEmail.trim()
  if (!to) return { success: false, error: 'Missing recipient email' }

  const siteUrl = getSiteUrl()
  const messagesUrl = `${siteUrl}/messages?utm_source=messages_digest_email&utm_medium=email`

  const html = renderMessagesDigestEmail({
    userName: input.userName,
    conversations: input.conversations,
    messagesUrl,
  })

  const subject = 'New messages from Ausna'

  try {
    const result = await getResendClient().emails.send({
      from: getResendFromEmail(),
      to,
      subject,
      html,
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

