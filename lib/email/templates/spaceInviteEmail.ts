import { escape } from '@/lib/utils/htmlEscape'

export function renderSpaceInviteEmail(input: {
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
  /** When set (new/pseudo invitees), the email footer renders 3 action buttons instead of the generic CTA. */
  newUserCtaLinks?: {
    joinUrl: string
    followUrl: string
    passUrl: string
  } | null
}): string {
  const inviter = escape(input.inviterName || 'Someone')
  const invitee = escape(input.inviteeName || '')
  const action = escape(input.actionLabel)
  const space = escape(input.spaceName || 'a space')
  const description = (input.spaceDescription || '').trim()
  const safeDescription = description ? escape(description) : ''
  const ctaUrl = escape(input.ctaUrl)
  const avatarRaw = (input.spaceAvatarUrl || '').trim()
  const emojiRaw = (input.spaceEmoji || '').trim()
  const timeText = (input.timeText || '').trim()
  const locationText = (input.locationText || '').trim()
  const hosts = Array.isArray(input.hostNames) ? input.hostNames.filter(Boolean) : []
  const inviteMessageRaw = (input.inviteMessage || '').trim()
  const safeInviteMessage = inviteMessageRaw ? escape(inviteMessageRaw) : ''
  const membersCount =
    typeof input.membersCount === 'number' && Number.isFinite(input.membersCount) && input.membersCount > 0
      ? Math.floor(input.membersCount)
      : null
  const newUserLinks = input.newUserCtaLinks ?? null
  const singleSharedMagicLink =
    !!newUserLinks &&
    newUserLinks.joinUrl === newUserLinks.followUrl &&
    newUserLinks.joinUrl === newUserLinks.passUrl

  const titleText = inviter + ' invited you to ' + action.toLowerCase() + ' ' + space

  function toAbsoluteUrl(url: string): string {
    const u = (url || '').trim()
    if (!u) return ''
    if (u.startsWith('http://') || u.startsWith('https://')) return u
    if (u.startsWith('//')) return 'https:' + u
    try {
      const base = new URL(input.ctaUrl).origin
      const path = u.startsWith('/') ? u : '/' + u
      return base + path
    } catch {
      return u
    }
  }

  const avatarUrl = avatarRaw ? toAbsoluteUrl(avatarRaw) : ''
  const stickerInner = avatarUrl
    ? '<img src="' + escape(avatarUrl) + '" alt="" width="96" height="96" style="border-radius:16px; object-fit:cover; display:block; box-shadow: 0px 0px 5px rgba(0,0,0,0.1);" />'
    : emojiRaw
      ? '<div style="width:96px; height:96px; border-radius:16px; background:#f3f4f6; display:flex; align-items:center; justify-content:center; font-size:44px; box-shadow: 0px 0px 5px rgba(0,0,0,0.08);">' + escape(emojiRaw) + '</div>'
      : '<div style="width:96px; height:96px; border-radius:16px; background:#e5e7eb;"></div>'

  const pill = (label: string): string =>
    '<span style="display:inline-block; padding:4px 8px; border-radius:999px; background:#f3f4f6; color:#4b5563; font-size:12px; line-height:1.2;">' + label + '</span>'

  const pills: string[] = []
  if (membersCount !== null) pills.push(pill(membersCount + ' ' + (membersCount === 1 ? 'member' : 'members')))
  if (timeText) pills.push(pill('🕒 ' + escape(timeText)))
  if (locationText) pills.push(pill('📍 ' + escape(locationText)))

  const hostDetail =
    hosts.length > 0
      ? '<div style="margin-top:10px; font-size:12px; line-height:1.5; color:#6b7280;">Host · ' + escape(hosts.join(', ')) + '</div>'
      : ''

  const pillsRow = pills.length
    ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px; border-collapse:separate;"><tr>' +
      pills.map((p, idx) => '<td valign="middle" style="' + (idx === pills.length - 1 ? '' : 'padding-right:8px;') + '">' + p + '</td>').join('') +
      '</tr></table>'
    : ''

  const inviteePara = invitee
    ? '<p style="margin:0 0 16px 0; font-size: 14px; line-height: 1.6; color:#4b5563;">Hi ' + invitee + ',</p>'
    : '<div style="height: 12px;"></div>'

  const messageBlock = safeInviteMessage
    ? '<div style="margin:0 0 16px 0; padding:12px; border-radius:12px; background:#f9fafb; border:1px solid #e5e7eb;"><div style="font-size:12px; line-height:1.4; color:#6b7280; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px;">Message</div><div style="font-size:14px; line-height:1.6; color:#111827; white-space:pre-wrap;">' + safeInviteMessage + '</div></div>'
    : ''

  const descriptionBlock = safeDescription
    ? '<div style="font-size:14px; line-height:1.6; color:#4b5563; margin-top:8px; white-space:pre-wrap;">' + safeDescription + '</div>'
    : ''

  const ctaBlock = newUserLinks
    ? singleSharedMagicLink
      ? '<div style="margin-top: 4px; font-size: 14px; line-height: 1.6; color: #374151;">Open the space to sign in, pick <strong>Join</strong> (member), <strong>Follow</strong> (updates only), or <strong>Pass</strong> (decline), then finish on <strong>Join Ausna</strong> by setting your password.</div>' +
        '<div style="margin-top: 14px;"><a href="' +
        escape(newUserLinks.joinUrl) +
        '" style="display:inline-block; background:#2563eb; color:#ffffff; text-decoration:none; border-radius:10px; padding:10px 18px; font-size:13px; line-height:1; font-weight:600; border:1px solid #1d4ed8;">Open invitation</a></div>' +
        '<div style="margin-top: 12px; font-size: 11px; line-height: 1.5; color: #9ca3af;">One secure link opens the space first so you see what you were invited to before activating your account.</div>'
      : '<div style="margin-top: 4px; font-size: 14px; line-height: 1.6; color: #374151;">How would you like to respond to this invitation?</div>' +
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top: 12px; border-collapse:separate; border-spacing: 0;">' +
        '<tr>' +
        '<td><a href="' + escape(newUserLinks.joinUrl) + '" style="display:inline-block; background:#2563eb; color:#ffffff; text-decoration:none; border-radius:10px; padding:10px 18px; font-size:13px; line-height:1; font-weight:600; border:1px solid #1d4ed8;">Join</a></td>' +
        '<td style="padding-left:8px;"><a href="' + escape(newUserLinks.followUrl) + '" style="display:inline-block; background:#ffffff; color:#374151; text-decoration:none; border-radius:10px; padding:10px 18px; font-size:13px; line-height:1; font-weight:600; border:1px solid #d1d5db;">Follow</a></td>' +
        '<td style="padding-left:8px;"><a href="' + escape(newUserLinks.passUrl) + '" style="display:inline-block; background:#ffffff; color:#6b7280; text-decoration:none; border-radius:10px; padding:10px 18px; font-size:13px; line-height:1; font-weight:500; border:1px solid #e5e7eb;">Pass</a></td>' +
        '</tr></table>' +
        '<div style="margin-top: 12px; font-size: 11px; line-height: 1.5; color: #9ca3af;">Join = become a member &middot; Follow = stay updated &middot; Pass = decline for now</div>'
    : '<a href="' + ctaUrl + '" style="display:inline-block; background:#2563eb; color:#ffffff; text-decoration:none; border-radius: 10px; padding: 10px 16px; font-size: 13px; line-height: 1; font-weight: 600; border:1px solid #1d4ed8;">Check invite in space</a>' +
      '<div style="margin-top: 14px; font-size: 12px; line-height: 1.6; color: #6b7280;">If the button doesn\'t work, copy and paste this link: <span style="word-break: break-all;">' + ctaUrl + '</span></div>'

  return '<!doctype html>\n' +
    '<html lang="en">\n' +
    '  <head>\n' +
    '    <meta charset="utf-8" />\n' +
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
    '    <title>' + escape(titleText) + '</title>\n' +
    '  </head>\n' +
    '  <body style="margin:0; padding:0; background:#f9fafb; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">\n' +
    '    <div style="max-width: 600px; margin: 0 auto; padding: 28px 16px;">\n' +
    '      <div style="background:#ffffff; border-radius: 16px; padding: 20px 16px 16px 16px;">\n' +
    '        <div style="font-size: 14px; color: #6b7280;">Ausna</div>\n' +
    '        <h1 style="margin:8px 0 8px 0; font-size: 20px; line-height: 1.4; font-weight: 700; color:#111827;">' + escape(titleText) + '</h1>\n' +
    '        ' + inviteePara + '\n' +
    '        ' + messageBlock + '\n' +
    '        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px 0;">\n' +
    '          <tr>\n' +
    '            <td valign="top" style="width:96px; padding:0 16px 0 0; line-height:0;">' + stickerInner + '</td>\n' +
    '            <td valign="top" style="padding:0; min-width:0;">\n' +
    '              <div style="font-size:22px; font-weight:700; color:#111827; line-height:1.25;">' + space + '</div>\n' +
    '              ' + descriptionBlock + '\n' +
    '              ' + pillsRow + '\n' +
    '              ' + hostDetail + '\n' +
    '            </td>\n' +
    '          </tr>\n' +
    '        </table>\n' +
    '        ' + ctaBlock + '\n' +
    '      </div>\n' +
    '    </div>\n' +
    '  </body>\n' +
    '</html>'
}
