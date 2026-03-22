import type { FeedItem } from '@/app/main/actions'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { renderDigestAssignedPortfolioBannerHtml } from '@/lib/email/digestAssignedPortfolio'
import { escapeHtml, renderDigestEmailShell } from '@/lib/email/templates/digestEmailShell'
import { formatActivityLocation } from '@/lib/formatActivityLocation'
import type { ActivityDateTimeValue } from '@/lib/datetime'
import type { ActivityLocationValue } from '@/lib/location'
import type { Note, NoteSource, OpenCallMetadata } from '@/types/note'
import type { Portfolio } from '@/types/portfolio'

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

function truncateText(text: string, max: number): string {
  const t = (text || '').trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1).trimEnd() + '…'
}

function feedSourceLabel(source: NoteSource | null | undefined): string | null {
  if (!source) return null
  if (source.type === 'friend') return 'Friend'
  if (source.type === 'subscribed') return 'Subscribed'
  if (source.type === 'community') return `From ${source.communityName}`
  return null
}

function openCallDaysLeft(meta: OpenCallMetadata | undefined): number | null {
  const end = meta?.end_date
  if (!end) return null
  const endDate = new Date(end)
  if (Number.isNaN(endDate.getTime())) return null
  const days = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return days > 0 ? days : null
}

function portfolioTypeWord(type: Portfolio['type']): string {
  if (type === 'projects') return 'project'
  if (type === 'activities') return 'activity'
  if (type === 'community') return 'community'
  return 'portfolio'
}

function avatarCell(siteUrl: string, avatarUrl: string | null | undefined): string {
  const av = avatarUrl ? toAbsoluteUrl(siteUrl, avatarUrl) : ''
  if (av) {
    return `<img src="${escapeHtml(av)}" alt="" width="32" height="32" style="border-radius:999px; object-fit:cover; display:block; border:2px solid #ffffff;" />`
  }
  return `<div style="width:32px; height:32px; border-radius:999px; background:#e5e7eb; border:2px solid #ffffff;"></div>`
}

/** Table-based row: reliable spacing in Gmail/Apple Mail (flex gap is often ignored). */
function renderAuthorRow(
  siteUrl: string,
  note: Note & { author_profiles?: Array<{ id: string; name: string; avatar?: string | null }> },
  createdAt: string,
  sourceLabel: string | null
): string {
  const profiles = Array.isArray(note.author_profiles) ? note.author_profiles : []
  const timeStr = formatFeedTime(createdAt)
  const sourceHtml = sourceLabel
    ? `<span style="display:inline-block; margin-left:10px; padding:2px 8px; border-radius:999px; background:#f3f4f6; font-size:12px; color:#374151; vertical-align:middle;">${escapeHtml(
        sourceLabel
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
            <span style="font-size:14px; font-weight:600; color:#111827; line-height:1.4;">${escapeHtml(name)}</span><span style="font-size:13px; color:#6b7280; line-height:1.4; margin-left:10px; white-space:nowrap;">${escapeHtml(timeStr)}</span>${sourceHtml}
          </td>
        </tr>
      </table>`
  }

  const slice = profiles.slice(0, 5)
  const avatarsRow = slice
    .map((author, index) => {
      const cell = avatarCell(siteUrl, author.avatar)
      const pad = index === 0 ? '' : 'padding-left:6px;'
      return `<td valign="middle" style="${pad} line-height:0;">${cell}</td>`
    })
    .join('')

  const names = profiles.map((a) => a.name).filter(Boolean)
  const label =
    names.length <= 2 ? names.join(' & ') : `${names[0]}, ${names[1]} & ${names.length - 2} others`

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:10px;">
      <tr>
        <td valign="middle" style="padding:0 12px 0 0; line-height:0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${avatarsRow}</tr></table>
        </td>
        <td valign="middle" style="padding:0;">
          <span style="font-size:14px; font-weight:600; color:#111827; line-height:1.4;">${escapeHtml(label)}</span><span style="font-size:13px; color:#6b7280; line-height:1.4; margin-left:10px; white-space:nowrap;">${escapeHtml(timeStr)}</span>${sourceHtml}
        </td>
      </tr>
    </table>`
}

function renderNoteCard(siteUrl: string, item: FeedItem & { kind: 'note' }): string {
  const note = item.note
  const href = toAbsoluteUrl(siteUrl, `/notes/${note.id}`)
  const sourceLabel = feedSourceLabel((note as any).feedSource)
  const portfolioBanner = renderDigestAssignedPortfolioBannerHtml(
    siteUrl,
    (note as any).digestAssignedPortfolio
  )

  if (note.type === 'open_call') {
    const meta = note.metadata as OpenCallMetadata | undefined
    const title = meta?.title?.trim() || 'Open call'
    const days = openCallDaysLeft(meta)
    const ends =
      days !== null
        ? `<span style="color:#ea580c;"> · ends in ${days === 1 ? '1 day' : `${days} days`}</span>`
        : ''

    return `
      <div style="display:block; padding:10px 12px; border-radius:12px; border:1px solid #e5e7eb; background:#ffffff; margin-bottom:8px;">
        <a href="${escapeHtml(href)}" style="text-decoration:none; color:inherit;">
          <div style="font-size:14px; font-weight:600; color:#ea580c; margin-bottom:8px;">
            Open call${ends}
          </div>
          <div style="font-size:17px; font-weight:600; color:#111827; line-height:1.35; margin-bottom:8px;">
            ${escapeHtml(title)}
          </div>
          ${renderAuthorRow(siteUrl, note as any, note.created_at, null)}
          ${
            note.text?.trim()
              ? `<div style="font-size:14px; line-height:1.5; color:#4b5563; white-space:pre-wrap;">${escapeHtml(
                  truncateText(note.text, 400)
                )}</div>`
              : ''
          }
        </a>
        ${portfolioBanner}
      </div>`
  }

  const refs = Array.isArray(note.references) ? note.references : []
  const firstImage = refs.find((r: any) => r && r.type === 'image' && r.url) as { url: string } | undefined
  const imgUrl = firstImage?.url ? toAbsoluteUrl(siteUrl, firstImage.url) : ''
  const imgHtml = imgUrl
    ? `<div style="margin-bottom:10px; border-radius:8px; overflow:hidden; max-height:220px;">
         <img src="${escapeHtml(imgUrl)}" alt="" width="100%" style="display:block; width:100%; max-height:220px; object-fit:cover;" />
       </div>`
    : ''

  const body =
    note.text?.trim() &&
    `<div style="font-size:14px; line-height:1.5; color:#4b5563; white-space:pre-wrap;">${escapeHtml(
      truncateText(note.text, 400)
    )}</div>`

  return `
    <div style="display:block; padding:10px 12px; border-radius:12px; border:1px solid #e5e7eb; background:#ffffff; margin-bottom:8px;">
      <a href="${escapeHtml(href)}" style="text-decoration:none; color:inherit;">
        ${renderAuthorRow(siteUrl, note as any, note.created_at, sourceLabel)}
        ${imgHtml}
        ${body || ''}
      </a>
      ${portfolioBanner}
    </div>`
}

function renderPortfolioCreatedCard(siteUrl: string, item: FeedItem & { kind: 'portfolio_created' }): string {
  const { portfolio, creator_profile } = item
  const typeWord = portfolioTypeWord(portfolio.type)
  const href = toAbsoluteUrl(siteUrl, getPortfolioUrl(portfolio.type, portfolio.id))
  const meta = (portfolio.metadata as any) || {}
  const basic = meta.basic || {}
  const name = (basic.name as string)?.trim() || 'Untitled'
  const description = (basic.description as string | undefined)?.trim()
  const emoji = (basic.emoji as string | undefined)?.trim()
  const avatar = (basic.avatar as string | undefined)?.trim()
  const props = (meta.properties as any) || {}
  const activityDateTime = (props.activity_datetime as ActivityDateTimeValue | null | undefined) ?? null
  const location = (props.location as ActivityLocationValue | null | undefined) ?? null

  const creatorAv = creator_profile.avatar ? toAbsoluteUrl(siteUrl, creator_profile.avatar) : ''
  const creatorAvatarHtml = creatorAv
    ? `<img src="${escapeHtml(creatorAv)}" alt="" width="32" height="32" style="border-radius:999px; object-fit:cover; display:block;" />`
    : `<div style="width:32px; height:32px; border-radius:999px; background:#e5e7eb;"></div>`

  let dateLocLine = ''
  if (portfolio.type === 'activities' && activityDateTime?.start) {
    const d = new Date(activityDateTime.start)
    const dateStr = Number.isNaN(d.getTime())
      ? ''
      : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
    const loc = location ? formatActivityLocation(location) : null
    const locShort = loc
      ? location?.online
        ? loc.line1 || 'Online'
        : loc.line2 || ''
      : ''
    const parts = [dateStr, locShort].filter(Boolean)
    if (parts.length) {
      dateLocLine = `<div style="font-size:13px; color:#4b5563; margin-bottom:6px;">${escapeHtml(
        parts.join(' · ')
      )}</div>`
    }
  }

  const stickerInner = avatar
    ? `<img src="${escapeHtml(toAbsoluteUrl(siteUrl, avatar))}" alt="" width="48" height="48" style="border-radius:8px; object-fit:cover; display:block;" />`
    : emoji
      ? `<div style="width:48px; height:48px; border-radius:8px; background:#f3f4f6; display:flex; align-items:center; justify-content:center; font-size:24px;">${escapeHtml(
          emoji
        )}</div>`
      : `<div style="width:48px; height:48px; border-radius:8px; background:#e5e7eb;"></div>`

  const descHtml = description
    ? `<div style="font-size:14px; line-height:1.5; color:#6b7280; margin-top:4px;">${escapeHtml(
        truncateText(description, 200)
      )}</div>`
    : ''

  return `
    <a href="${escapeHtml(href)}" style="text-decoration:none; color:inherit;">
      <div style="padding:10px 12px; border-radius:12px; border:1px solid #e5e7eb; background:#ffffff; margin-bottom:8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:10px;">
          <tr>
            <td valign="top" style="width:32px; padding:0 12px 0 0; line-height:0;">${creatorAvatarHtml}</td>
            <td valign="top" style="padding:0;">
              <div style="font-size:14px; color:#374151; line-height:1.4;">
                <span style="font-weight:600;">${escapeHtml(creator_profile.name)}</span>
                <span> created a ${escapeHtml(typeWord)}</span>
              </div>
              <div style="font-size:13px; color:#6b7280; margin-top:4px; line-height:1.4;">${escapeHtml(
                formatFeedTime(portfolio.created_at)
              )}</div>
            </td>
          </tr>
        </table>
        <div style="border:1px solid #e5e7eb; border-radius:10px; padding:12px; background:#ffffff;">
          <div style="display:flex; align-items:flex-start; gap:12px;">
            <div style="flex-shrink:0;">${stickerInner}</div>
            <div style="flex:1; min-width:0;">
              <div style="font-size:18px; font-weight:700; color:#111827; line-height:1.3;">${escapeHtml(name)}</div>
              ${dateLocLine}
              ${descHtml}
            </div>
          </div>
        </div>
      </div>
    </a>`
}

function buildRowsHtml(siteUrl: string, items: FeedItem[]): string {
  return items
    .map((item) => {
      if (item.kind === 'note') return renderNoteCard(siteUrl, item)
      return renderPortfolioCreatedCard(siteUrl, item)
    })
    .join('')
}

export function renderFeedDigestEmail(input: {
  siteUrl: string
  /** Up to 3 items to show */
  displayItems: FeedItem[]
  totalNew: number
  mainFeedUrl: string
  unsubscribeUrl?: string
}): string {
  const { siteUrl, displayItems, totalNew, mainFeedUrl, unsubscribeUrl } = input
  const documentTitle = 'New feeds on Ausna'
  const heading = 'New on your feed'
  const intro =
    totalNew === 1
      ? 'There is 1 new item on your Ausna feed since we last checked.'
      : `There are ${totalNew} new items on your Ausna feed since we last checked.`

  const ctaLabel = totalNew === 1 ? 'Check 1 new feed' : `Check ${totalNew} new feeds`

  const rowsHtml = buildRowsHtml(siteUrl, displayItems)

  return renderDigestEmailShell({
    documentTitle,
    headingHtml: escapeHtml(heading),
    introText: intro,
    rowsHtml,
    ctaHref: mainFeedUrl,
    ctaLabel,
    footerText: 'You’re receiving this because you have new activity on your Ausna feed.',
    unsubscribeUrl,
    unsubscribeTopic: 'feed digest',
  })
}
