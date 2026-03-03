import type { ActivityCallToJoinConfig } from '@/types/portfolio'
import type { ActivityDateTimeValue } from '@/lib/datetime'
import { isActivityLive } from './activityLive'

/**
 * Call-to-join is available when the activity is not private (no separate enable/disable).
 */
export function isCallToJoinAvailable(visibility: 'public' | 'private' | undefined | null): boolean {
  return visibility !== 'private'
}

/**
 * Whether the call-to-join application window is still open.
 *
 * Rules:
 * - Call-to-join must be available (not a private activity and config enabled).
 * - When join_by is set: window closes when now > join_by.
 * - Without join_by (or in addition to it), call-to-join is only active when:
 *   - It is before the activity begin datetime (if a begin datetime exists), OR
 *   - The activity is currently LIVE (per isActivityLive).
 */
export function isCallToJoinWindowOpen(
  visibility: 'public' | 'private' | undefined | null,
  callToJoin: ActivityCallToJoinConfig | undefined | null,
  activityDateTime: ActivityDateTimeValue | undefined | null,
  status: string | undefined | null
): boolean {
  if (!isCallToJoinAvailable(visibility) || !callToJoin) {
    return false
  }
  const now = new Date()

  if (callToJoin.enabled === false) {
    return false
  }

  const hasActivityStart = !!activityDateTime?.start

  // When there is no scheduled activity datetime, fall back to manual live/archive status.
  if (!hasActivityStart) {
    const isManuallyLive = status === 'live'

    // No join_by configured: joinable while manually marked live.
    if (!callToJoin.join_by) {
      return isManuallyLive
    }

    // join_by configured: only joinable while manually live and before join_by.
    if (!isManuallyLive) {
      return false
    }

    const joinByDate = new Date(callToJoin.join_by)

    if (Number.isNaN(joinByDate.getTime())) {
      return false
    }
    return now.getTime() <= joinByDate.getTime()
  }

  // Determine if we are before the activity start, when a start exists
  let isBeforeStart = false
  if (activityDateTime?.start) {
    const startRaw = new Date(activityDateTime.start)
    if (!Number.isNaN(startRaw.getTime())) {
      if (activityDateTime.allDay) {
        const dayStart = new Date(startRaw.getFullYear(), startRaw.getMonth(), startRaw.getDate())
        isBeforeStart = now < dayStart
      } else {
        isBeforeStart = now < startRaw
      }
    }
  }

  // When a datetime exists, ignore manual status and rely purely on datetime
  const live = isActivityLive(activityDateTime, null)
  const baseOpen = isBeforeStart || live

  if (!baseOpen) {
    return false
  }

  if (callToJoin.join_by) {
    const joinByDate = new Date(callToJoin.join_by)
    if (Number.isNaN(joinByDate.getTime())) {
      return false
    }
    return now.getTime() <= joinByDate.getTime()
  }

  return true
}
