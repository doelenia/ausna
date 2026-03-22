import type { FeedItem } from '@/app/main/actions'
import type { Note } from '@/types/note'
import type { Portfolio } from '@/types/portfolio'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { escapeHtml } from '@/lib/email/templates/digestEmailShell'

/** Matches NoteCard portfolio assignment banner (non-human assigned portfolio). */
export type DigestAssignedPortfolioBanner = {
  portfolioType: Portfolio['type']
  portfolioId: string
  name: string
  description?: string
  avatarUrl?: string | null
  emoji?: string | null
  projectTypeLabel?: string | null
}

export type NoteWithDigestPortfolio = Note & {
  digestAssignedPortfolio?: DigestAssignedPortfolioBanner | null
}

function toAbsoluteUrl(siteUrl: string, url: string): string {
  const u = (url || '').trim()
  if (!u) return ''
  if (u.startsWith('http://') || u.startsWith('https://')) return u
  if (u.startsWith('//')) return `https:${u}`
  const base = siteUrl.replace(/\/$/, '')
  const path = u.startsWith('/') ? u : `/${u}`
  return `${base}${path}`
}

function truncateText(text: string, max: number): string {
  const t = (text || '').trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1).trimEnd() + '…'
}

export function mapPortfolioRowToDigestBanner(row: Portfolio): DigestAssignedPortfolioBanner | null {
  if (row.type === 'human') return null
  const basic = getPortfolioBasic(row)
  const metadata = row.metadata as any
  return {
    portfolioType: row.type,
    portfolioId: row.id,
    name: basic.name,
    description: basic.description,
    avatarUrl: basic.avatar ?? null,
    emoji: (metadata?.basic?.emoji as string | undefined)?.trim() || null,
    projectTypeLabel: (metadata?.project_type_specific as string | undefined)?.trim() || null,
  }
}

export function pickFirstAssignedNonHumanBanner(
  assignedPortfolios: string[] | null | undefined,
  bannerByPortfolioId: Map<string, DigestAssignedPortfolioBanner>
): DigestAssignedPortfolioBanner | null {
  if (!Array.isArray(assignedPortfolios)) return null
  const id = assignedPortfolios.find((pid) => bannerByPortfolioId.has(pid))
  return id ? bannerByPortfolioId.get(id)! : null
}

export async function loadDigestAssignedPortfolioBannerMap(
  supabase: any,
  portfolioIds: string[]
): Promise<Map<string, DigestAssignedPortfolioBanner>> {
  const unique = [...new Set(portfolioIds.filter(Boolean))]
  if (unique.length === 0) return new Map()

  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('id, type, metadata')
    .in('id', unique)

  const map = new Map<string, DigestAssignedPortfolioBanner>()
  for (const p of portfolios || []) {
    if (p.type === 'human') continue
    const b = mapPortfolioRowToDigestBanner(p as Portfolio)
    if (b) map.set(p.id, b)
  }
  return map
}

export async function attachDigestPortfoliosToNotes<T extends Pick<Note, 'id' | 'assigned_portfolios'>>(
  supabase: any,
  notes: T[]
): Promise<Array<T & { digestAssignedPortfolio: DigestAssignedPortfolioBanner | null }>> {
  const ids: string[] = []
  for (const n of notes) {
    for (const id of n.assigned_portfolios || []) ids.push(id)
  }
  const bannerMap = await loadDigestAssignedPortfolioBannerMap(supabase, ids)
  return notes.map((n) => ({
    ...n,
    digestAssignedPortfolio: pickFirstAssignedNonHumanBanner(n.assigned_portfolios, bannerMap),
  }))
}

export async function attachDigestPortfoliosToFeedItems(
  supabase: any,
  items: FeedItem[]
): Promise<FeedItem[]> {
  const noteItems = items.filter((i): i is Extract<FeedItem, { kind: 'note' }> => i.kind === 'note')
  if (noteItems.length === 0) return items

  const withBanners = await attachDigestPortfoliosToNotes(
    supabase,
    noteItems.map((i) => i.note)
  )
  const byId = new Map(withBanners.map((n) => [n.id, n]))
  return items.map((item) => {
    if (item.kind !== 'note') return item
    const enriched = byId.get(item.note.id)
    return {
      ...item,
      note: (enriched ?? item.note) as NoteWithDigestPortfolio,
    }
  })
}

/**
 * Table-based banner (no nested &lt;a&gt; inside note card link). Link goes to portfolio.
 */
export function renderDigestAssignedPortfolioBannerHtml(
  siteUrl: string,
  banner: DigestAssignedPortfolioBanner | null | undefined
): string {
  if (!banner) return ''

  const href = toAbsoluteUrl(siteUrl, getPortfolioUrl(banner.portfolioType, banner.portfolioId))
  const name = escapeHtml(banner.name)
  const typeLabel = banner.projectTypeLabel ? escapeHtml(banner.projectTypeLabel) : ''
  const descRaw = banner.description?.trim()
  const desc = descRaw ? escapeHtml(truncateText(descRaw, 120)) : ''

  const av = banner.avatarUrl ? toAbsoluteUrl(siteUrl, banner.avatarUrl) : ''
  const stickerInner = av
    ? `<img src="${escapeHtml(av)}" alt="" width="48" height="48" style="width:48px;height:48px;border-radius:8px;object-fit:cover;display:block;" />`
    : banner.emoji
      ? `<div style="width:48px;height:48px;border-radius:8px;background:#f3f4f6;text-align:center;line-height:48px;font-size:24px;">${escapeHtml(
          banner.emoji
        )}</div>`
      : `<div style="width:48px;height:48px;border-radius:8px;background:#e5e7eb;"></div>`

  const nameTypeLine = `<span style="font-size:14px;font-weight:600;color:#111827;line-height:1.4;">${name}</span>${
    typeLabel
      ? `<span style="margin-left:8px;font-size:13px;color:#6b7280;line-height:1.4;">${typeLabel}</span>`
      : ''
  }`

  const descRow = desc
    ? `<div style="margin-top:4px;font-size:13px;color:#6b7280;line-height:1.45;">${desc}</div>`
    : ''

  return `
    <a href="${escapeHtml(href)}" style="text-decoration:none;color:inherit;display:block;margin-top:12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;border-radius:8px;">
        <tr>
          <td style="padding:12px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td valign="top" style="width:48px;padding:0 12px 0 0;line-height:0;">${stickerInner}</td>
                <td valign="top" style="padding:0;">
                  <div style="line-height:1.4;">${nameTypeLine}</div>
                  ${descRow}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </a>`
}
