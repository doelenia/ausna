import type { ActivityDateTimeValue } from '@/lib/datetime'

export interface ActivityCalendarEvent {
  start: Date
  end: Date
  title: string
  inProgress?: boolean
  allDay?: boolean
}

export function activityToCalendarEvent(
  value: ActivityDateTimeValue | null | undefined,
  title: string
): ActivityCalendarEvent[] {
  if (!value || !value.start) return []

  const start = new Date(value.start)
  if (Number.isNaN(start.getTime())) return []

  let end: Date

  if (value.allDay) {
    const rawEnd = value.end ? new Date(value.end) : new Date(start)
    if (Number.isNaN(rawEnd.getTime())) {
      end = new Date(start)
      end.setDate(end.getDate() + 1)
    } else {
      end = rawEnd
    }

    return [
      {
        start,
        end,
        title,
        inProgress: false,
        allDay: true,
      },
    ]
  }

  if (value.inProgress || !value.end) {
    // Visual long block for in-progress activity (12h window by default)
    end = new Date(start.getTime() + 12 * 60 * 60 * 1000)
  } else {
    const parsedEnd = new Date(value.end)
    end = Number.isNaN(parsedEnd.getTime()) ? new Date(start.getTime() + 60 * 60 * 1000) : parsedEnd
  }

  return [
    {
      start,
      end,
      title,
      inProgress: !!value.inProgress,
      allDay: false,
    },
  ]
}

