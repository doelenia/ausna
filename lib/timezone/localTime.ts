export type LocalDateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function getPart(parts: Intl.DateTimeFormatPart[], type: string): string | null {
  const p = parts.find((x) => x.type === type)?.value
  return typeof p === 'string' ? p : null
}

export function getLocalDateParts(date: Date, timeZone: string): LocalDateParts | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date)

    const year = Number(getPart(parts, 'year'))
    const month = Number(getPart(parts, 'month'))
    const day = Number(getPart(parts, 'day'))
    const hour = Number(getPart(parts, 'hour'))
    const minute = Number(getPart(parts, 'minute'))

    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      !Number.isFinite(hour) ||
      !Number.isFinite(minute)
    ) {
      return null
    }

    return { year, month, day, hour, minute }
  } catch {
    return null
  }
}

export function formatLocalYmd(parts: Pick<LocalDateParts, 'year' | 'month' | 'day'>): string {
  const y = String(parts.year).padStart(4, '0')
  const m = String(parts.month).padStart(2, '0')
  const d = String(parts.day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isLocalEightAmNow(input: {
  now: Date
  timeZone: string
  allowedMinuteWindow?: { startInclusive: number; endInclusive: number }
}): { ok: true; localDate: string } | { ok: false; reason: string } {
  const parts = getLocalDateParts(input.now, input.timeZone)
  if (!parts) return { ok: false, reason: 'Invalid timezone' }

  if (parts.hour !== 8) return { ok: false, reason: 'Not 8am local time' }

  const window = input.allowedMinuteWindow
  if (window) {
    if (parts.minute < window.startInclusive || parts.minute > window.endInclusive) {
      return { ok: false, reason: 'Outside minute window' }
    }
  }

  return { ok: true, localDate: formatLocalYmd(parts) }
}

export function localDateForIso(iso: string, timeZone: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = getLocalDateParts(d, timeZone)
  if (!parts) return null
  return formatLocalYmd(parts)
}

