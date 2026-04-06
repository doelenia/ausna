import { formatDistanceToNowStrict } from 'date-fns'
import type { ReactNode } from 'react'
import { isActivityLive } from '@/lib/activityLive'
import type { ActivityDateTimeValue } from '@/lib/datetime'

function getSpaceStatus(portfolio: unknown): string | null {
  const status = (portfolio as { metadata?: { status?: unknown } })?.metadata?.status
  return typeof status === 'string' ? status : null
}

function getSpaceActivityDateTime(portfolio: unknown): ActivityDateTimeValue | null {
  const props =
    ((portfolio as { metadata?: { properties?: { activity_datetime?: unknown } } })?.metadata
      ?.properties || {}) as { activity_datetime?: unknown }
  const dt = props.activity_datetime
  return dt && typeof dt === 'object' ? (dt as ActivityDateTimeValue) : null
}

/** Positioning for live/upcoming dot on feed top-row space avatars (unread / “New” use the same corner). */
export const FEED_TOP_ROW_SPACE_STATUS_OVERLAY_CLASS =
  'absolute right-0 top-0 z-10 flex h-5 w-5 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 ring-2 ring-white'

/**
 * Icon-only live/upcoming marker for horizontal feed top rows (main feed + space/human feed tab).
 * Use in the same slot as unread count: show unread (or “New”) when present, else this overlay.
 */
export function renderFeedTopRowSpaceStatusOverlay(portfolio: unknown): ReactNode {
  const dt = getSpaceActivityDateTime(portfolio)
  const status = getSpaceStatus(portfolio)
  const hasActivity = !!dt?.start

  const liveOverlay = (
    <div className={FEED_TOP_ROW_SPACE_STATUS_OVERLAY_CLASS} aria-label="Live" role="status">
      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
    </div>
  )

  if (!hasActivity) {
    if (status === 'live') return liveOverlay
    return null
  }

  const live = isActivityLive(dt as ActivityDateTimeValue, status)
  if (live) return liveOverlay

  const start = dt?.start ? new Date(dt.start) : null
  const validStart = start && !Number.isNaN(start.getTime()) ? start : null
  if (!validStart) return null
  if (status === 'archived') return null
  if (new Date() >= validStart) return null

  const label = formatDistanceToNowStrict(validStart, { addSuffix: true })
  return (
    <div
      className={FEED_TOP_ROW_SPACE_STATUS_OVERLAY_CLASS}
      aria-label={`Starts ${label}`}
      role="status"
    >
      <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
    </div>
  )
}
