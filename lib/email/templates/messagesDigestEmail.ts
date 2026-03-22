import { escapeHtml, renderDigestEmailShell } from '@/lib/email/templates/digestEmailShell'

export interface MessagesDigestConversationInput {
  partnerName: string
  partnerAvatarUrl?: string | null
  lastMessagePreview: string
  unreadCount: number
  lastMessageAt: string
}

export function renderMessagesDigestEmail(input: {
  userName?: string
  conversations: MessagesDigestConversationInput[]
  messagesUrl: string
  unsubscribeUrl?: string
}): string {
  const safeConversations = Array.isArray(input.conversations)
    ? input.conversations.slice(0, 20)
    : []

  const documentTitle = 'New messages from Ausna'
  const heading =
    safeConversations.length > 0
      ? `New messages from ${escapeHtml(
          safeConversations[0].partnerName || 'your conversations'
        )}${safeConversations.length > 1 ? ' and others' : ''}`
      : 'New messages on Ausna'

  const rowsHtml = safeConversations
    .map((conv) => {
      const preview =
        conv.lastMessagePreview.length > 140
          ? conv.lastMessagePreview.slice(0, 137) + '...'
          : conv.lastMessagePreview

      const unreadBadge =
        conv.unreadCount > 0
          ? `<span style="display:inline-block; min-width:20px; padding:2px 8px; border-radius:999px; background:#ef4444; color:#ffffff; font-size:11px; line-height:1.4; text-align:center;">
              ${conv.unreadCount > 9 ? '9+' : String(conv.unreadCount)}
            </span>`
          : ''

      const avatarUrl =
        typeof conv.partnerAvatarUrl === 'string' &&
        conv.partnerAvatarUrl.trim().length > 0
          ? conv.partnerAvatarUrl.trim()
          : null

      const avatar =
        avatarUrl !== null
          ? `<img src="${escapeHtml(
              avatarUrl
            )}" alt="" width="32" height="32" style="border-radius:999px; object-fit:cover; display:block;" />`
          : `<div style="width:32px; height:32px; border-radius:999px; background:#e5e7eb;"></div>`

      return `
        <a
          href="${escapeHtml(input.messagesUrl)}"
          style="text-decoration:none; color:inherit;"
        >
          <div style="padding:10px 12px; border-radius:12px; border:1px solid #e5e7eb; background:#ffffff; margin-bottom:8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td valign="top" style="width:32px; padding:0 12px 0 0; line-height:0;">${avatar}</td>
                <td valign="top" style="padding:0; min-width:0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td style="padding:0 8px 4px 0; vertical-align:middle;">
                        <div style="font-size:14px; line-height:1.4; font-weight:600; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                          ${escapeHtml(conv.partnerName || 'Conversation')}
                        </div>
                      </td>
                      <td style="padding:0 0 4px 0; vertical-align:middle; width:1%; white-space:nowrap;">
                        ${unreadBadge}
                      </td>
                    </tr>
                  </table>
                  <div style="font-size:13px; line-height:1.5; color:#4b5563; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${escapeHtml(preview)}
                  </div>
                </td>
              </tr>
            </table>
          </div>
        </a>
      `
    })
    .join('')

  return renderDigestEmailShell({
    documentTitle,
    headingHtml: heading,
    introText: 'You have new unread messages in your conversations on Ausna.',
    rowsHtml,
    ctaHref: input.messagesUrl,
    ctaLabel: 'View on Ausna',
    footerText: 'You’re receiving this because there are unread messages in your Ausna conversations.',
    unsubscribeUrl: input.unsubscribeUrl,
    unsubscribeTopic: 'message digest',
  })
}
