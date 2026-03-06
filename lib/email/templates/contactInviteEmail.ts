function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function renderContactInviteEmail(input: {
  inviterName: string
  inviteeName: string
  inviteLink: string
}): string {
  const inviter = escapeHtml(input.inviterName || 'Someone')
  const invitee = escapeHtml(input.inviteeName || 'you')
  const link = input.inviteLink

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>You're invited to Ausna</title>
  </head>
  <body style="margin:0; padding:0; background:#f9fafb;">
    <div style="max-width: 600px; margin: 0 auto; padding: 28px 16px;">
      <div style="background:#ffffff; border-radius: 16px; padding: 24px;">
        <h1 style="margin:0 0 16px 0; font-size: 24px; font-weight: 700; color:#111827;">
          You're invited to Ausna
        </h1>
        <p style="margin:0 0 24px 0; font-size: 16px; line-height: 1.6; color:#4b5563;">
          ${inviter} has invited ${invitee} to join Ausna.
        </p>
        <p style="margin:0 0 24px 0;">
          <a href="${escapeHtml(link)}" style="display:inline-block; padding: 12px 24px; background:#111827; color:#ffffff; text-decoration:none; border-radius: 8px; font-weight: 600;">
            Accept invitation
          </a>
        </p>
        <p style="margin:0; font-size: 14px; color:#6b7280;">
          Or copy this link: ${escapeHtml(link)}
        </p>
      </div>
    </div>
  </body>
</html>`
}
