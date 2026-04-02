import {
  getResendClient,
  getResendFromEmail,
  getSiteUrl,
  listUnsubscribeMailHeaders,
} from '@/lib/email/resend'
import {
  MessagesDigestConversationInput,
  renderMessagesDigestEmail,
} from '@/lib/email/templates/messagesDigestEmail'
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

export async function sendMessagesDigestEmail(input: {
  toEmail: string
  userId: string
  userName?: string
  conversations: MessagesDigestConversationInput[]
}): Promise<{ success: true; messageId: string } | { success: false; error: string }> {
  const to = input.toEmail.trim()
  if (!to) return { success: false, error: 'Missing recipient email' }

  const siteUrl = getSiteUrl()
  const messagesUrl = `${siteUrl}/messages?utm_source=messages_digest_email&utm_medium=email`
  const unsubscribeUrl = buildEmailUnsubscribeUrl(input.userId, 'messages_digest')

  const names = formatNameList(
    (input.conversations || []).map((c) => c.partnerName).filter(Boolean),
    { maxNames: 3 }
  )

  const html = renderMessagesDigestEmail({
    userName: input.userName,
    conversations: input.conversations,
    messagesUrl,
    unsubscribeUrl,
    names,
  })

  const subject = names ? `New messages: ${names}` : 'New messages'

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

