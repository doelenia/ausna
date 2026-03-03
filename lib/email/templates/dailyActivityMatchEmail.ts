function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function renderDailyActivityMatchEmail(input: {
  introText: string
  exploreUrl: string
  /** When set, show an unsubscribe link in the footer. */
  unsubscribeUrl?: string
  userName?: string
  dateLabel?: string
  activities?: Array<{
    timeLabel?: string
    locationLabel?: string
    hostLabel?: string
    interestLabels?: string[]
    friendsLabel?: string
  }>
  /** Optional background pattern image URL for the activity section. */
  patternUrl?: string
}): string {
  const intro = escapeHtml(input.introText || '').trim()
  const exploreUrl = input.exploreUrl
  const activities = Array.isArray(input.activities) ? input.activities.slice(0, 5) : []
  const patternUrl = input.patternUrl ? escapeHtml(input.patternUrl) : ''
  const activitySectionBackgroundStyle = patternUrl
    ? ` background-image:url('${patternUrl}'); background-repeat:repeat; background-size:contain;`
    : ''

  const namePart = input.userName ? escapeHtml(input.userName) : 'Your'
  const title = `${namePart} top picks activities from Ausna`
  const buttonText = 'Reveal on Ausna'

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0; padding:0; background:#f9fafb;">
    <div style="max-width: 600px; margin: 0 auto; padding: 28px 16px;">
      <div style="background:#ffffff; border-radius: 16px; padding: 0;">
        <div style="border-radius: 16px; overflow:hidden;${activitySectionBackgroundStyle}">
          <div style="padding: 24px; background:rgba(0, 0, 0, 0.5);">
            ${
              input.dateLabel
                ? `<p style="margin:0 0 4px 0; font-size: 36px; line-height: 1.4; font-weight: 700; color:#ffffff; opacity:0.85;">
              ${escapeHtml(input.dateLabel)}
            </p>`
                : ''
            }
            <h1 style="margin:0 0 8px 0; font-size: 36px; line-height: 1.3; font-weight: 700; color:#ffffff;">
              ${escapeHtml(title)}
            </h1>
            <p style="margin:0 0 16px 0; font-size: 15px; line-height: 1.6; font-weight: 400; color:#ffffff;">
              ${intro}
            </p>
            ${
              activities.length > 0
                ? `<p style="margin:0 0 10px 0; font-size: 14px; line-height: 1.5; color:#e5e7eb;">
            Open Ausna to reveal and explore more.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse; margin-bottom:16px;">
            ${activities
              .map((a) => {
                const hasMetaLine = !!(a.timeLabel || a.locationLabel)
                const hasPills =
                  !!a.hostLabel ||
                  (Array.isArray(a.interestLabels) && a.interestLabels.length > 0) ||
                  !!a.friendsLabel

                const interestLabels = Array.isArray(a.interestLabels)
                  ? a.interestLabels.filter((t) => t && t.trim().length > 0).slice(0, 3)
                  : []

                return `<a
              href="${exploreUrl}"
              style="text-decoration:none; color:inherit;"
            >
              <div style="display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border-radius:12px; border:1px solid #e5e7eb; background:#f9fafb; margin-bottom:12px;">
                <div style="width:32px; height:32px; border-radius:999px; background:#e5e7eb; filter:blur(3px); flex-shrink:0;"></div>
                <div style="flex:1; min-width:0;">
                  <div style="height:14px; width:65%; border-radius:999px; background:#e5e7eb; margin-bottom:6px; filter:blur(3px);"></div>
                  <div style="height:12px; width:90%; border-radius:999px; background:#e5e7eb; margin-bottom:4px; filter:blur(3px);"></div>
                  <div style="height:12px; width:55%; border-radius:999px; background:#e5e7eb; filter:blur(3px);"></div>
                  ${
                    hasMetaLine
                      ? `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px; font-size:12px; line-height:1.4; color:#4b5563;">
                      ${
                        a.timeLabel
                          ? `<span>🕒 ${escapeHtml(a.timeLabel)}</span>`
                          : ''
                      }
                      ${
                        a.locationLabel
                          ? `<span>📍 ${escapeHtml(a.locationLabel)}</span>`
                          : ''
                      }
                    </div>`
                      : ''
                  }
                  ${
                    hasPills
                      ? `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px;">
                      ${
                        a.hostLabel
                          ? `<span style="display:inline-block; padding:4px 8px; border-radius:999px; background:#eef2ff; color:#4f46e5; font-size:11px; line-height:1.2;">
                            Host · ${escapeHtml(a.hostLabel)}
                          </span>`
                          : ''
                      }
                      ${
                        interestLabels.length > 0
                          ? interestLabels
                              .map(
                                (label) => `<span style="display:inline-block; padding:4px 8px; border-radius:999px; background:#ecfeff; color:#0e7490; font-size:11px; line-height:1.2;">
                            ${escapeHtml(label)}
                          </span>`
                              )
                              .join('')
                          : ''
                      }
                      ${
                        a.friendsLabel
                          ? `<span style="display:inline-block; padding:4px 8px; border-radius:999px; background:#ecfdf3; color:#166534; font-size:11px; line-height:1.2;">
                            ${escapeHtml(a.friendsLabel)}
                          </span>`
                          : ''
                      }
                    </div>`
                      : ''
                  }
                </div>
              </div>
            </a>`
              })
              .join('')}
          </table>`
                : ''
            }
            <a
              href="${exploreUrl}"
              style="display:inline-block; background:#ffffff; color:#222222; text-decoration:none; border-radius: 10px; padding: 10px 14px; font-size: 14px; line-height: 1; font-weight: 500; border:1px solid #e5e7eb;"
            >
              ${escapeHtml(buttonText)}
            </a>
          </div>
        </div>
      </div>
      <div style="padding: 12px 8px 0 8px;">
        <p style="margin:0; font-size: 12px; line-height: 1.6; color:#6b7280;">
          You’re receiving this because you use Ausna.
          ${
            input.unsubscribeUrl
              ? ` <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#6b7280; text-decoration:underline;">Unsubscribe</a> from daily match emails.`
              : ''
          }
        </p>
      </div>
    </div>
  </body>
</html>`
}

