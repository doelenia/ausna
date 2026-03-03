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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/fab1a5e4-0675-4ead-a1dd-862094e22f59', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'ddc618',
    },
    body: JSON.stringify({
      sessionId: 'ddc618',
      runId: 'initial',
      hypothesisId: 'H1',
      location: 'lib/callToJoin.ts:isCallToJoinWindowOpen:entry',
      message: 'isCallToJoinWindowOpen entry',
      data: {
        visibility,
        callToJoinEnabled: callToJoin?.enabled,
        callToJoinJoinBy: callToJoin?.join_by,
        hasActivityStart: !!activityDateTime?.start,
        status,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (!isCallToJoinAvailable(visibility) || !callToJoin) {
    return false
  }
  const now = new Date()

  if (callToJoin.enabled === false) {
    return false
  }

  if (status === 'archived') {
    return false
  }

  const hasActivityStart = !!activityDateTime?.start

  // When there is no scheduled activity datetime, fall back to manual live/archive status.
  if (!hasActivityStart) {
    const isManuallyLive = status === 'live'

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fab1a5e4-0675-4ead-a1dd-862094e22f59', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'ddc618',
      },
      body: JSON.stringify({
        sessionId: 'ddc618',
        runId: 'initial',
        hypothesisId: 'H2',
        location: 'lib/callToJoin.ts:isCallToJoinWindowOpen:no-activity',
        message: 'No activity start branch',
        data: {
          status,
          isManuallyLive,
          joinBy: callToJoin.join_by,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    // No join_by configured: joinable while manually marked live.
    if (!callToJoin.join_by) {
      return isManuallyLive
    }

    // join_by configured: only joinable while manually live and before join_by.
    if (!isManuallyLive) {
      return false
    }

    const joinByDate = new Date(callToJoin.join_by)
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fab1a5e4-0675-4ead-a1dd-862094e22f59', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'ddc618',
      },
      body: JSON.stringify({
        sessionId: 'ddc618',
        runId: 'initial',
        hypothesisId: 'H3',
        location: 'lib/callToJoin.ts:isCallToJoinWindowOpen:join-by-no-activity',
        message: 'join_by evaluation with no activity start',
        data: {
          joinByRaw: callToJoin.join_by,
          joinByTime: Number.isNaN(joinByDate.getTime()) ? null : joinByDate.getTime(),
          nowTime: now.getTime(),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

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

  const live = isActivityLive(activityDateTime, status || null)
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
