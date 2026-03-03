function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

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
}): string {
  const safeConversations = Array.isArray(input.conversations)
    ? input.conversations.slice(0, 20)
    : []

  const title = 'New messages from Ausna'
  const heading =
    safeConversations.length > 0
      ? `New messages from ${escapeHtml(
          safeConversations[0].partnerName || 'your conversations'
        )}${safeConversations.length > 1 ? ' and others' : ''}`
      : 'New messages on Ausna'

  const buttonText = 'View on Ausna'

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
          href="${input.messagesUrl}"
          style="text-decoration:none; color:inherit;"
        >
          <div style="display:flex; align-items:flex-start; padding:10px 12px; border-radius:12px; border:1px solid #e5e7eb; background:#f9fafb; margin-bottom:8px;">
            <div style="flex-shrink:0;">
              ${avatar}
            </div>
            <div style="flex:1; min-width:0; margin-left:12px;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:4px;">
                <div style="font-size:14px; line-height:1.4; font-weight:600; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  ${escapeHtml(conv.partnerName || 'Conversation')}
                </div>
                ${unreadBadge}
              </div>
              <div style="font-size:13px; line-height:1.5; color:#4b5563; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${escapeHtml(preview)}
              </div>
            </div>
          </div>
        </a>
      `
    })
    .join('')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0; padding:0; background:#f9fafb;">
    <div style="max-width: 600px; margin: 0 auto; padding: 28px 16px;">
      <div style="background:#ffffff; border-radius: 16px; padding: 20px 16px 16px 16px;">
        <h1 style="margin:0 0 8px 0; font-size: 20px; line-height: 1.4; font-weight: 700; color:#111827;">
          ${heading}
        </h1>
        <p style="margin:0 0 16px 0; font-size: 14px; line-height: 1.6; color:#4b5563;">
          You have new unread messages in your conversations on Ausna.
        </p>
        <div style="margin:0 0 16px 0;">
          ${rowsHtml}
        </div>
        <a
          href="${input.messagesUrl}"
          style="display:inline-block; background:#f3f4f6; color:#4b5563; text-decoration:none; border-radius: 10px; padding: 10px 16px; font-size: 13px; line-height: 1; font-weight: 500; border:1px solid #e5e7eb;"
        >
          ${escapeHtml(buttonText)}
        </a>
      </div>
      <div style="padding: 12px 4px 0 4px;">
        <p style="margin:0; font-size: 12px; line-height: 1.6; color:#6b7280;">
          You’re receiving this because there are unread messages in your Ausna conversations.
        </p>
      </div>
    </div>
  </body>
</html>`
}

