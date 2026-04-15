import type { SupabaseClient } from '@supabase/supabase-js'
import { DB_NON_HUMAN_TYPES, normalizePortfolioType } from '@/types/portfolio'
import { isActivityLive } from '@/lib/activityLive'
import type { ActivityDateTimeValue } from '@/lib/datetime'

export function getSpaceStatusFromRow(p: { metadata?: unknown }): string | null {
  const status = (p?.metadata as { status?: unknown } | undefined)?.status
  return typeof status === 'string' ? status : null
}

export function getSpaceActivityDateTimeFromRow(p: { metadata?: unknown }): ActivityDateTimeValue | null {
  const props =
    ((p?.metadata as { properties?: { activity_datetime?: unknown } } | undefined)?.properties || {}) as {
      activity_datetime?: unknown
    }
  const dt = props.activity_datetime
  return dt && typeof dt === 'object' ? (dt as ActivityDateTimeValue) : null
}

export function isSpaceRowLive(p: unknown): boolean {
  const status = getSpaceStatusFromRow(p as { metadata?: unknown })
  const dt = getSpaceActivityDateTimeFromRow(p as { metadata?: unknown })
  if (dt?.start) return isActivityLive(dt, status)
  return status === 'live'
}

export function isSpaceRowUpcoming(p: unknown): boolean {
  const row = p as { metadata?: unknown }
  const status = getSpaceStatusFromRow(row)
  if (status === 'archived') return false
  const dt = getSpaceActivityDateTimeFromRow(row)
  const start = dt?.start ? new Date(dt.start) : null
  if (!start || Number.isNaN(start.getTime())) return false
  return start.getTime() > Date.now()
}

export function userIsInPortfolioRow(userId: string, portfolioRow: unknown): boolean {
  if (!userId) return false
  const row = portfolioRow as { user_id?: string; metadata?: unknown }
  if (row?.user_id === userId) return true
  const meta = (row?.metadata as { members?: string[]; managers?: string[] } | undefined) || {}
  const members: string[] = Array.isArray(meta?.members) ? meta.members : []
  const managers: string[] = Array.isArray(meta?.managers) ? meta.managers : []
  return members.includes(userId) || managers.includes(userId)
}

/** Space row merged from joined + subscription, before main-feed ordering. */
export type ViewerFeedSpacePortfolio = Record<string, unknown> & {
  id: string
  relation: 'joined' | 'subscribed'
}

export type ViewerFeedSpaceItem = {
  portfolio: ViewerFeedSpacePortfolio
  lastNoteCreatedAt: string | null
  unread: number
}

function spaceItemRecencyMs(item: ViewerFeedSpaceItem): number {
  const k = item.lastNoteCreatedAt || (item.portfolio.created_at as string | undefined) || null
  const t = k ? new Date(k).getTime() : 0
  return Number.isNaN(t) ? 0 : t
}

/** Same ordering as space tiles in the main feed top row (unread buckets, then recency). */
export function orderSpaceItemsLikeMainFeedTopRow(items: ViewerFeedSpaceItem[]): ViewerFeedSpaceItem[] {
  const withUnread = items
    .filter((x) => x.unread > 0)
    .sort((a, b) => spaceItemRecencyMs(b) - spaceItemRecencyMs(a))
  const withoutUnread = items
    .filter((x) => x.unread === 0)
    .sort((a, b) => spaceItemRecencyMs(b) - spaceItemRecencyMs(a))
  return [...withUnread, ...withoutUnread]
}

/**
 * Joined ∪ subscribed space portfolios that are live or upcoming, with last-note and unread counts.
 * Matches main feed space half (no humans).
 */
export async function fetchViewerEligibleSpaceFeedItems(
  supabase: SupabaseClient,
  currentUserId: string
): Promise<ViewerFeedSpaceItem[]> {
  const [{ data: allSpacesRows }, { data: subscriptionsRows }] = await Promise.all([
    supabase
      .from('portfolios_directory')
      .select('id, type, slug, user_id, visibility, created_at, metadata')
      .in('type', [...DB_NON_HUMAN_TYPES])
      .limit(2000),
    supabase.from('subscriptions').select('portfolio_id').eq('user_id', currentUserId),
  ])

  const joinedSpaces = (allSpacesRows || []).filter((p: { user_id?: string; metadata?: unknown }) =>
    userIsInPortfolioRow(currentUserId, p)
  )

  const subscribedIds = Array.from(
    new Set((subscriptionsRows || []).map((r: { portfolio_id: string }) => String(r.portfolio_id)).filter(Boolean))
  )

  const { data: subscribedSpacesRows } =
    subscribedIds.length > 0
      ? await supabase
          .from('portfolios_directory')
          .select('id, type, slug, user_id, visibility, created_at, metadata')
          .in('id', subscribedIds)
      : { data: [] as Record<string, unknown>[] }

  const byId = new Map<string, ViewerFeedSpacePortfolio>()
  ;(joinedSpaces || []).forEach((p: Record<string, unknown>) => {
    byId.set(String(p.id), { ...p, relation: 'joined' } as ViewerFeedSpacePortfolio)
  })
  ;(subscribedSpacesRows || []).forEach((p: Record<string, unknown>) => {
    const id = String(p.id)
    const existing = byId.get(id)
    byId.set(
      id,
      { ...p, relation: existing ? 'joined' : 'subscribed' } as ViewerFeedSpacePortfolio
    )
  })
  const mergedSpaces = Array.from(byId.values())

  const eligibleSpaces = mergedSpaces.filter(
    (p) => normalizePortfolioType(p.type as string) === 'space' && (isSpaceRowLive(p) || isSpaceRowUpcoming(p))
  )

  const spaceIds = eligibleSpaces.map((p) => String(p.id))
  if (spaceIds.length === 0) {
    return []
  }

  const qs = new URLSearchParams({ portfolio_ids: spaceIds.join(',') })
  const res = await fetch(`/api/portfolios/last-note-created-at?${qs.toString()}`)
  const data = await res.json().catch(() => ({}))
  const spacesLastNoteById = (data?.lastNoteByPortfolioId || {}) as Record<string, string | null>

  const unreadQs = new URLSearchParams({
    space_ids: spaceIds.join(','),
    friend_ids: '',
  })
  const unreadRes = await fetch(`/api/unread-counts?${unreadQs.toString()}`)
  const unreadData = await unreadRes.json().catch(() => ({}))
  const unreadSpaces = (unreadData?.spaces as Record<string, number>) || {}

  const sortedByNote = [...eligibleSpaces].sort((a, b) => {
    const aKey = spacesLastNoteById[String(a.id)] || (a.created_at as string) || null
    const bKey = spacesLastNoteById[String(b.id)] || (b.created_at as string) || null
    const at = aKey ? new Date(aKey).getTime() : 0
    const bt = bKey ? new Date(bKey).getTime() : 0
    return bt - at
  })

  const items: ViewerFeedSpaceItem[] = sortedByNote.map((p) => ({
    portfolio: p,
    lastNoteCreatedAt: spacesLastNoteById[String(p.id)] ?? null,
    unread: unreadSpaces[String(p.id)] || 0,
  }))

  return orderSpaceItemsLikeMainFeedTopRow(items)
}
