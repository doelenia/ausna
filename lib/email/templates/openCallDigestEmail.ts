import { escapeHtml, renderDigestEmailShell } from '@/lib/email/templates/digestEmailShell'
import type { FeedOpenCallNote } from '@/lib/open-calls/feedOpenCallsForUser'
import type { OpenCallMetadata } from '@/types/note'

function toAbsoluteUrl(siteUrl: string, url: string): string {
  const u = (url || '').trim()
  if (!u) return ''
  if (u.startsWith('http://') || u.startsWith('https://')) return u
  if (u.startsWith('//')) return `https:${u}`
  const base = siteUrl.replace(/\/$/, '')
  const path = u.startsWith('/') ? u : `/${u}`
  return `${base}${path}`
}

function formatFeedTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

function openCallDaysLeft(meta: OpenCallMetadata | undefined): number | null {
  const end = meta?.end_date
  if (!end) return null
  const endDate = new Date(end)
  if (Number.isNaN(endDate.getTime())) return null
  const days = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return days > 0 ? days : null
}

function avatarCell(siteUrl: string, avatarUrl: string | null | undefined): string {
  const av = avatarUrl ? toAbsoluteUrl(siteUrl, avatarUrl) : ''
  if (av) {
    return `<img src="${escapeHtml(av)}" alt="" width="32" height="32" style="border-radius:999px; object-fit:cover; display:block; border:2px solid #ffffff;" />`
  }
  return `<div style="width:32px; height:32px; border-radius:999px; background:#e5e7eb; border:2px solid #ffffff;"></div>`
}

function renderOpenCallAuthorRow(siteUrl: string, note: FeedOpenCallNote): string {
  const profiles = Array.isArray((note as any).author_profiles) ? (note as any).author_profiles : []
  const timeStr = formatFeedTime(note.created_at)
  const project = (note as any).first_project_name
  const projectHtml = project
    ? `<span style="display:inline-block; margin-left:10px; padding:2px 8px; border-radius:999px; background:#f3f4f6; font-size:12px; color:#374151; vertical-align:middle;">${escapeHtml(
        project
      )}</span>`
    : ''

  if (profiles.length <= 1) {
    const p = profiles[0]
    const name = p?.name || 'Someone'
    const left = avatarCell(siteUrl, p?.avatar)
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:10px;">
        <tr>
          <td valign="middle" style="width:32px; padding:0 12px 0 0; line-height:0;">${left}</td>
          <td valign="middle" style="padding:0;">
            <span style="font-size:14px; font-weight:600; color:#111827; line-height:1.4;">${escapeHtml(name)}</span><span style="font-size:13px; color:#6b7280; line-height:1.4; margin-left:10px; white-space:nowrap;">${escapeHtml(timeStr)}</span>${projectHtml}
          </td>
        </tr>
      </table>`
  }

  const slice = profiles.slice(0, 5)
  const avatarsRow = slice
    .map((author: any, index: number) => {
      const cell = avatarCell(siteUrl, author.avatar)
      const pad = index === 0 ? '' : 'padding-left:6px;'
      return `<td valign="middle" style="${pad} line-height:0;">${cell}</td>`
    })
    .join('')

  const names = profiles.map((a: any) => a.name).filter(Boolean)
  const label =
    names.length <= 2 ? names.join(' & ') : `${names[0]}, ${names[1]} & ${names.length - 2} others`

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:10px;">
      <tr>
        <td valign="middle" style="padding:0 12px 0 0; line-height:0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${avatarsRow}</tr></table>
        </td>
        <td valign="middle" style="padding:0;">
          <span style="font-size:14px; font-weight:600; color:#111827; line-height:1.4;">${escapeHtml(label)}</span><span style="font-size:13px; color:#6b7280; line-height:1.4; margin-left:10px; white-space:nowrap;">${escapeHtml(timeStr)}</span>${projectHtml}
        </td>
      </tr>
    </table>`
}

function renderOpenCallCard(siteUrl: string, note: FeedOpenCallNote): string {
  const href = toAbsoluteUrl(siteUrl, `/notes/${note.id}`)
  const meta = note.metadata as OpenCallMetadata | undefined
  const title = meta?.title?.trim() || 'Open call'
  const days = openCallDaysLeft(meta)
  const ends =
    days !== null
      ? `<span style="color:#ea580c;"> · ends in ${days === 1 ? '1 day' : `${days} days`}</span>`
      : ''

  const text =
    note.text?.trim() &&
    `<div style="font-size:14px; line-height:1.5; color:#4b5563; white-space:pre-wrap; margin-top:8px;">${escapeHtml(
      note.text.length > 400 ? note.text.slice(0, 399).trimEnd() + '…' : note.text
    )}</div>`

  return `
    <a href="${escapeHtml(href)}" style="text-decoration:none; color:inherit;">
      <div style="display:block; padding:10px 12px; border-radius:12px; border:1px solid #e5e7eb; background:#ffffff; margin-bottom:8px;">
        <div style="font-size:14px; font-weight:600; color:#ea580c; margin-bottom:8px;">
          Open call${ends}
        </div>
        <div style="font-size:17px; font-weight:600; color:#111827; line-height:1.35; margin-bottom:8px;">
          ${escapeHtml(title)}
        </div>
        ${renderOpenCallAuthorRow(siteUrl, note)}
        ${text || ''}
      </div>
    </a>`
}

export function renderOpenCallDigestEmail(input: {
  siteUrl: string
  displayNotes: FeedOpenCallNote[]
  totalNew: number
  mainFeedUrl: string
  unsubscribeUrl?: string
}): string {
  const { siteUrl, displayNotes, totalNew, mainFeedUrl, unsubscribeUrl } = input
  const documentTitle = 'New Open Calls on Ausna'
  const heading = 'Daily digest of new open calls on Ausna'
  const intro =
    totalNew === 1
      ? 'There is 1 open call on your feed you haven’t opened yet.'
      : `There are ${totalNew} open calls on your feed you haven’t opened yet.`

  const ctaLabel =
    totalNew === 1 ? 'View open call on Ausna' : `View ${totalNew} open calls on Ausna`

  const rowsHtml = displayNotes.map((n) => renderOpenCallCard(siteUrl, n)).join('')

  return renderDigestEmailShell({
    documentTitle,
    headingHtml: escapeHtml(heading),
    introText: intro,
    rowsHtml,
    ctaHref: mainFeedUrl,
    ctaLabel,
    footerText: 'You’re receiving this because you have unviewed open calls on Ausna.',
    unsubscribeUrl,
    unsubscribeTopic: 'open call digest',
  })
}
