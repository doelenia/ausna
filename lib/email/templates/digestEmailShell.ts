function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export { escapeHtml }

/**
 * Shared outer chrome for batched notification emails (messages digest, feed digest).
 * Keep in sync with the original messages digest layout.
 */
export function renderDigestEmailShell(input: {
  /** <title> and related */
  documentTitle: string
  /** Main h1 (HTML allowed for styling spans inside — caller must escape user bits) */
  headingHtml: string
  /** Intro paragraph plain text (will be escaped) */
  introText: string
  /** Inner rows HTML (cards); caller responsible for escaping */
  rowsHtml: string
  ctaHref: string
  ctaLabel: string
  /** Footer disclaimer plain text (will be escaped) */
  footerText: string
  /** One-click unsubscribe (same URL for GET and List-Unsubscribe-Post) */
  unsubscribeUrl?: string
  /** e.g. "feed digest" / "message digest" — plain text, will be escaped */
  unsubscribeTopic?: string
}): string {
  const title = escapeHtml(input.documentTitle)
  const intro = escapeHtml(input.introText)
  const ctaLabel = escapeHtml(input.ctaLabel)
  const footer = escapeHtml(input.footerText)
  const topic = input.unsubscribeTopic ? escapeHtml(input.unsubscribeTopic) : ''
  const unsubscribeBlock =
    input.unsubscribeUrl && topic
      ? `<br /><br /><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#6b7280; text-decoration:underline;">Unsubscribe</a> from ${topic} emails.`
      : ''

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0; padding:0; background:#f9fafb;">
    <div style="max-width: 600px; margin: 0 auto; padding: 28px 16px;">
      <div style="background:#ffffff; border-radius: 16px; padding: 20px 16px 16px 16px;">
        <h1 style="margin:0 0 8px 0; font-size: 20px; line-height: 1.4; font-weight: 700; color:#111827;">
          ${input.headingHtml}
        </h1>
        <p style="margin:0 0 16px 0; font-size: 14px; line-height: 1.6; color:#4b5563;">
          ${intro}
        </p>
        <div style="margin:0 0 16px 0;">
          ${input.rowsHtml}
        </div>
        <a
          href="${escapeHtml(input.ctaHref)}"
          style="display:inline-block; background:#f3f4f6; color:#4b5563; text-decoration:none; border-radius: 10px; padding: 10px 16px; font-size: 13px; line-height: 1; font-weight: 500; border:1px solid #e5e7eb;"
        >
          ${ctaLabel}
        </a>
      </div>
      <div style="padding: 12px 4px 0 4px;">
        <p style="margin:0; font-size: 12px; line-height: 1.6; color:#6b7280;">
          ${footer}${unsubscribeBlock}
        </p>
      </div>
    </div>
  </body>
</html>`
}
