'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button, Card, Content, UIText, UIButtonText } from '@/components/ui'
import { StickerAvatar } from '@/components/portfolio/StickerAvatar'
import { ActivityCard } from '@/components/explore/ExploreView'
import { getSpaceUrl } from '@/lib/portfolio/routes'
import { Lock, X } from 'lucide-react'
import { isActivityLive } from '@/lib/activityLive'
import { isCallToJoinWindowOpen } from '@/lib/callToJoin'
import type { ActivityDateTimeValue } from '@/lib/datetime'
import type { ActivityLocationValue } from '@/lib/location'
import { renderFeedTopRowSpaceStatusOverlay } from '@/components/main/feedTopRowSpaceStatus'
import {
  fetchViewerEligibleSpaceFeedItems,
  userIsInPortfolioRow,
  type ViewerFeedSpaceItem,
  type ViewerFeedSpacePortfolio,
} from '@/lib/spaces/viewerFeedSpaces'
import {
  getExploreActivityHighlights,
  type DailyMatchHighlightMeta,
  type ExploreActivity,
} from '@/app/explore/actions'
import type { ActivityCallToJoinConfig } from '@/types/portfolio'

type TimelineActivity = {
  id: string
  name: string
  avatar?: string
  emoji?: string
  description?: string
  hostProjectId?: string | null
  activityDateTime?: ActivityDateTimeValue | null
  location?: ActivityLocationValue | null
  external?: boolean
}

type TimelineItem = { portfolio: ViewerFeedSpacePortfolio; activity: TimelineActivity }

function getSpaceName(p: ViewerFeedSpacePortfolio): string {
  const basic = (p.metadata as { basic?: { name?: string } } | undefined)?.basic || {}
  return (basic.name as string) || ''
}

function getSpaceStatus(p: ViewerFeedSpacePortfolio): string | null {
  const status = (p.metadata as { status?: unknown } | undefined)?.status
  return typeof status === 'string' ? status : null
}

function getSpaceActivityDateTime(p: ViewerFeedSpacePortfolio): ActivityDateTimeValue | null {
  const props =
    ((p.metadata as { properties?: { activity_datetime?: unknown } } | undefined)?.properties || {}) as {
      activity_datetime?: unknown
    }
  const dt = props.activity_datetime
  return dt && typeof dt === 'object' ? (dt as ActivityDateTimeValue) : null
}

function isSpaceLive(p: ViewerFeedSpacePortfolio): boolean {
  const status = getSpaceStatus(p)
  const dt = getSpaceActivityDateTime(p)
  if (dt?.start) return isActivityLive(dt, status)
  return status === 'live'
}

function isSpaceUpcoming(p: ViewerFeedSpacePortfolio): boolean {
  const status = getSpaceStatus(p)
  if (status === 'archived') return false
  const dt = getSpaceActivityDateTime(p)
  const start = dt?.start ? new Date(dt.start) : null
  if (!start || Number.isNaN(start.getTime())) return false
  return start.getTime() > Date.now()
}

function isSpaceJoinable(p: ViewerFeedSpacePortfolio, currentUserId: string | undefined): boolean {
  if (!currentUserId) return false
  if ((p.visibility || 'public') === 'private') return false
  const status = getSpaceStatus(p)
  if (status === 'archived') return false
  if (p.user_id === currentUserId) return false
  const meta = (p.metadata as Record<string, unknown>) || {}
  const managersArr: string[] = Array.isArray(meta?.managers) ? (meta.managers as string[]) : []
  const membersArr: string[] = Array.isArray(meta?.members) ? (meta.members as string[]) : []
  if (managersArr.includes(currentUserId) || membersArr.includes(currentUserId)) return false
  const props = (meta?.properties as Record<string, unknown> | undefined) || {}
  if (props.external === true) return true
  const callToJoin = (props.call_to_join as ActivityCallToJoinConfig | null | undefined) ?? null
  const dt = getSpaceActivityDateTime(p) ?? undefined
  const visibility = (p.visibility as 'public' | 'private' | undefined | null) ?? 'public'
  return isCallToJoinWindowOpen(visibility, callToJoin, dt, status)
}

function toExploreActivity(p: ViewerFeedSpacePortfolio): TimelineActivity {
  const meta = (p.metadata as Record<string, unknown>) || {}
  const basic = (meta.basic as Record<string, unknown>) || {}
  const props = (meta.properties as Record<string, unknown>) || {}
  return {
    id: String(p.id),
    name: (basic.name as string) || 'Space',
    avatar: basic.avatar as string | undefined,
    emoji: basic.emoji as string | undefined,
    description: (basic.description as string) || undefined,
    hostProjectId: null,
    activityDateTime: (props.activity_datetime as ActivityDateTimeValue | null | undefined) ?? null,
    location: (props.location as ActivityLocationValue | null | undefined) ?? null,
    external: props.external === true,
  }
}

function getStartDate(a: TimelineActivity): Date | null {
  const start = a.activityDateTime?.start
  if (!start) return null
  const d = new Date(start)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function getDateKey(a: TimelineActivity): string {
  const d = getStartDate(a)
  if (!d) return 'no-date'
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateGroupLabel(key: string): string {
  if (key === 'no-date') return 'Anytime'
  const [y, m, d] = key.split('-').map((v) => parseInt(v, 10))
  if (!y || !m || !d) return 'Anytime'
  const date = new Date(y, m - 1, d)
  if (Number.isNaN(date.getTime())) return 'Anytime'

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(
    tomorrow.getDate()
  ).padStart(2, '0')}`

  if (key === todayKey) {
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date)
    return `Today ${weekday}`
  }
  if (key === tomorrowKey) {
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date)
    return `Tomorrow ${weekday}`
  }

  const monthDay = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date)
  return `${monthDay} ${weekday}`
}

interface SpacesDirectoryViewProps {
  currentUserId: string
}

export function SpacesDirectoryView({ currentUserId }: SpacesDirectoryViewProps) {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ViewerFeedSpaceItem[]>([])
  const [highlights, setHighlights] = useState<Record<string, DailyMatchHighlightMeta>>({})
  const [searchMode, setSearchMode] = useState(false)
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'upcoming'>('grid')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const next = await fetchViewerEligibleSpaceFeedItems(supabase, currentUserId)
        if (!cancelled) setItems(next)
      } catch {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, currentUserId])

  useEffect(() => {
    if (!currentUserId || items.length === 0) {
      setHighlights({})
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const ids = items.map((x) => x.portfolio.id)
        const result = await getExploreActivityHighlights(currentUserId, ids)
        if (!cancelled && result.success) {
          setHighlights(result.highlights || {})
        }
      } catch {
        // non-critical
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentUserId, items])

  const renderGridTile = (row: ViewerFeedSpaceItem, withJoinBelow: boolean) => {
    const p = row.portfolio
    const basic = (p.metadata as { basic?: { name?: string; avatar?: string; emoji?: string } } | undefined)
      ?.basic || {}
    const name = (basic.name as string) || 'Space'
    const avatar = basic.avatar as string | undefined
    const emoji = basic.emoji as string | undefined
    const unread = row.unread
    const joined = userIsInPortfolioRow(currentUserId, p)
    const subscribedOnly = p.relation === 'subscribed' && !joined
    const isJoinedOrSubscribed = joined || subscribedOnly
    const showJoinBelow =
      withJoinBelow && isSpaceJoinable(p, currentUserId) && !userIsInPortfolioRow(currentUserId, p)

    return (
      <div
        key={p.id}
        className={`flex min-w-0 w-full flex-col items-center${showJoinBelow ? ' gap-1' : ''}`}
      >
        <Link
          href={getSpaceUrl((p.slug as string) || p.id)}
          className="flex w-full flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition-colors hover:bg-gray-100"
        >
          <div className="relative inline-flex shrink-0">
            {(p.visibility || 'public') === 'private' && (
              <Lock
                className="absolute left-0 top-0 z-20 h-4 w-4 text-gray-600 drop-shadow-sm"
                aria-label="Private"
              />
            )}
            <StickerAvatar
              src={avatar}
              alt={name}
              type="space"
              size={80}
              variant="mini"
              emoji={emoji}
              name={name}
            />
            {unread > 0 ? (
              isJoinedOrSubscribed ? (
                <div
                  className="absolute right-0 top-0 z-10 flex min-h-5 min-w-5 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-500 px-1 ring-2 ring-white"
                  aria-label={`${unread} unread`}
                >
                  <UIText as="span" className="text-[11px] text-white leading-none">
                    {unread > 99 ? '99+' : unread}
                  </UIText>
                </div>
              ) : (
                <div className="absolute right-0 top-0 z-10 translate-x-1/3 -translate-y-1/3 rounded-full bg-gray-200 px-2 py-0.5 ring-2 ring-white">
                  <UIText as="span" className="text-[11px] text-gray-800 leading-none">
                    New
                  </UIText>
                </div>
              )
            ) : (
              renderFeedTopRowSpaceStatusOverlay(p)
            )}
          </div>
          <UIText className="block w-full min-w-0 text-center leading-tight truncate" title={name}>
            {name}
          </UIText>
        </Link>
        {showJoinBelow ? (
          <Button
            asLink
            href={`${getSpaceUrl((p.slug as string) || p.id)}?join=1`}
            variant="primary"
            size="sm"
            className="w-full max-w-[100px] px-1 py-0.5"
          >
            <UIText>Join</UIText>
          </Button>
        ) : null}
      </div>
    )
  }

  const filteredPortfolios = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((row) => {
      const name = getSpaceName(row.portfolio).toLowerCase()
      const slug = String(row.portfolio.slug || '').toLowerCase()
      return name.includes(q) || slug.includes(q)
    })
  }, [items, query])

  const body = (() => {
    if (loading) {
      return <UIText className="text-gray-500">Loading...</UIText>
    }
    if (items.length === 0) {
      return (
        <Card variant="default" padding="md">
          <Content className="text-gray-500">No subscribed or joined spaces right now.</Content>
        </Card>
      )
    }

    if (searchMode) {
      const alphabetical = [...filteredPortfolios].sort((a, b) =>
        getSpaceName(a.portfolio)
          .toLowerCase()
          .localeCompare(getSpaceName(b.portfolio).toLowerCase())
      )
      return (
        <div className="space-y-3">
          {alphabetical.map((row) => {
            const p = row.portfolio
            const joinable = isSpaceJoinable(p, currentUserId)
            const a = toExploreActivity(p)
            const meta = (p.metadata as Record<string, unknown>) || {}
            const managersArr: string[] = Array.isArray(meta?.managers) ? (meta.managers as string[]) : []
            const membersArr: string[] = Array.isArray(meta?.members) ? (meta.members as string[]) : []
            const memberUserIds = Array.from(
              new Set<string>(
                [String(p.user_id), ...managersArr, ...membersArr].filter(Boolean)
              )
            )
            const memberLabel =
              memberUserIds.length > 0
                ? `${memberUserIds.length} member${memberUserIds.length === 1 ? '' : 's'}`
                : undefined
            return (
              <ActivityCard
                key={p.id}
                activity={a as ExploreActivity}
                hrefOverride={getSpaceUrl((p.slug as string) || p.id)}
                avatarTypeOverride="space"
                joinable={joinable}
                highlight={highlights[String(p.id)]}
                memberLabel={memberLabel}
                memberUserIds={memberUserIds}
              />
            )
          })}
        </div>
      )
    }

    if (viewMode === 'grid') {
      if (filteredPortfolios.length === 0) {
        return (
          <Card variant="default" padding="md">
            <Content className="text-gray-500">No spaces match.</Content>
          </Card>
        )
      }
      return (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(100px,1fr))] gap-2 items-start">
          {filteredPortfolios.map((row) => renderGridTile(row, true))}
        </div>
      )
    }

    const timelineItems: TimelineItem[] = filteredPortfolios.map((row) => ({
      portfolio: row.portfolio,
      activity: toExploreActivity(row.portfolio),
    }))

    const sorted = [...timelineItems].sort((a, b) => {
      const da = getStartDate(a.activity)
      const db = getStartDate(b.activity)
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return da.getTime() - db.getTime()
    })

    const upcoming = sorted.filter((x) => !isSpaceLive(x.portfolio) && isSpaceUpcoming(x.portfolio))
    const upcomingGroups = new Map<string, TimelineItem[]>()
    upcoming.forEach((x) => {
      const key = getDateKey(x.activity)
      const list = upcomingGroups.get(key)
      if (list) list.push(x)
      else upcomingGroups.set(key, [x])
    })

    const sortedKeys = Array.from(upcomingGroups.keys()).sort((a, b) => {
      if (a === 'no-date' && b === 'no-date') return 0
      if (a === 'no-date') return 1
      if (b === 'no-date') return -1
      return a.localeCompare(b)
    })

    const groups: Array<{ label: string; items: TimelineItem[] }> = []
    sortedKeys.forEach((key) => {
      const list = upcomingGroups.get(key)
      if (list && list.length > 0) {
        groups.push({ label: formatDateGroupLabel(key), items: list })
      }
    })

    if (groups.length === 0) {
      return (
        <Card variant="default" padding="md">
          <Content className="text-gray-500">No upcoming spaces.</Content>
        </Card>
      )
    }

    return (
      <div className="relative pl-4">
        <div className="absolute left-1 top-0 bottom-0 border-l border-dashed border-gray-200" />
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.label} className="relative pb-1">
              <div className="ml-2 mb-2 text-gray-500">
                <UIButtonText as="span">{group.label}</UIButtonText>
              </div>
              <div className="ml-2 space-y-4">
                {group.items.map((x) => {
                  const p = x.portfolio
                  const row = items.find((i) => String(i.portfolio.id) === String(p.id))
                  const unreadForSpace = row?.unread ?? 0
                  const joinedViewer = userIsInPortfolioRow(currentUserId, p)
                  const joinHref =
                    isSpaceJoinable(p, currentUserId) && !userIsInPortfolioRow(currentUserId, p)
                      ? `${getSpaceUrl((p.slug as string) || p.id)}?join=1`
                      : undefined
                  const meta = (p.metadata as Record<string, unknown>) || {}
                  const managersArr: string[] = Array.isArray(meta?.managers) ? (meta.managers as string[]) : []
                  const membersArr: string[] = Array.isArray(meta?.members) ? (meta.members as string[]) : []
                  const memberUserIds = Array.from(
                    new Set<string>([String(p.user_id), ...managersArr, ...membersArr].filter(Boolean))
                  )
                  const memberLabel =
                    memberUserIds.length > 0
                      ? `${memberUserIds.length} member${memberUserIds.length === 1 ? '' : 's'}`
                      : undefined

                  return (
                    <ActivityCard
                      key={p.id}
                      activity={x.activity as ExploreActivity}
                      hrefOverride={getSpaceUrl((p.slug as string) || p.id)}
                      avatarTypeOverride="space"
                      joinable={isSpaceJoinable(p, currentUserId)}
                      highlight={highlights[String(p.id)]}
                      memberLabel={memberLabel}
                      memberUserIds={memberUserIds}
                      joined={joinedViewer}
                      timelineUnreadCount={joinedViewer ? unreadForSpace : undefined}
                      joinHref={joinHref}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  })()

  return (
    <div className="mt-6 px-4 md:px-0">
      <div className="mb-3 flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchMode(true)}
          onBlur={(e) => {
            const next = e.relatedTarget as HTMLElement | null
            if (next?.dataset?.role === 'spaces-dir-search-clear') return
            setSearchMode(false)
            setQuery('')
          }}
          placeholder="Search by name or slug..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          autoComplete="off"
        />
        {searchMode && (
          <Button
            variant="text"
            type="button"
            onClick={() => {
              setSearchMode(false)
              setQuery('')
            }}
            data-role="spaces-dir-search-clear"
            disabled={loading}
          >
            <X className="w-4 h-4" aria-hidden />
          </Button>
        )}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Button
          type="button"
          variant={viewMode === 'grid' ? 'secondary' : 'text'}
          size="sm"
          onClick={() => setViewMode('grid')}
          disabled={loading}
        >
          <UIText>Grid</UIText>
        </Button>
        <Button
          type="button"
          variant={viewMode === 'upcoming' ? 'secondary' : 'text'}
          size="sm"
          onClick={() => setViewMode('upcoming')}
          disabled={loading}
        >
          <UIText>Upcoming</UIText>
        </Button>
      </div>

      {body}
    </div>
  )
}
