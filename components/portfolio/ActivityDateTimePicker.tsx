'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { UIText } from '@/components/ui'
import type { ActivityDateTimeValue } from '@/lib/datetime'

interface ActivityDateTimePickerProps {
  portfolioTitle: string
  initialValue?: ActivityDateTimeValue | null
  onChange: (value: ActivityDateTimeValue | null) => void
}

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time'
  } catch {
    return 'Local time'
  }
}

function formatUtcOffset(now: Date): string {
  const minutes = -now.getTimezoneOffset() // opposite sign of getTimezoneOffset
  const sign = minutes >= 0 ? '+' : '-'
  const abs = Math.abs(minutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `UTC${sign}${hh}:${mm}`
}

function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  return { year, month, day }
}

function parseHm(hm: string): { hour: number; minute: number } | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hm)
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return { hour, minute }
}

function toLocalDate(ymd: string, hm?: string | null): Date | null {
  const d = parseYmd(ymd)
  if (!d) return null
  const t = hm ? parseHm(hm) : null
  const hour = t?.hour ?? 0
  const minute = t?.minute ?? 0
  const dt = new Date(d.year, d.month - 1, d.day, hour, minute, 0, 0)
  if (Number.isNaN(dt.getTime())) return null
  return dt
}

function localYmdFromDate(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function localHmFromDate(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export function ActivityDateTimePicker({
  portfolioTitle: _portfolioTitle,
  initialValue,
  onChange,
}: ActivityDateTimePickerProps) {
  const timeZone = useMemo(() => getBrowserTimeZone(), [])
  const utcOffset = useMemo(() => formatUtcOffset(new Date()), [])

  const [startDate, setStartDate] = useState<string>('')
  const [startTime, setStartTime] = useState<string>('') // optional
  const [endDate, setEndDate] = useState<string>('')
  const [endTime, setEndTime] = useState<string>('') // optional
  const [inProgress, setInProgress] = useState<boolean>(false)

  useEffect(() => {
    if (!initialValue?.start) {
      setStartDate('')
      setStartTime('')
      setEndDate('')
      setEndTime('')
      setInProgress(false)
      return
    }

    const start = new Date(initialValue.start)
    if (Number.isNaN(start.getTime())) return

    const allDay = initialValue.allDay === true
    setStartDate(localYmdFromDate(start))
    setStartTime(allDay ? '' : localHmFromDate(start))

    const endIso = initialValue.end || null
    if (initialValue.inProgress && allDay) {
      setInProgress(true)
      setEndDate('')
      setEndTime('')
      return
    }

    const end = endIso ? new Date(endIso) : null
    if (!end || Number.isNaN(end.getTime())) {
      setEndDate('')
      setEndTime('')
      setInProgress(false)
      return
    }

    if (allDay) {
      // Stored as end-exclusive midnight; show end-inclusive date.
      const endInclusive = new Date(end)
      endInclusive.setDate(endInclusive.getDate() - 1)
      setEndDate(localYmdFromDate(endInclusive))
      setEndTime('')
    } else {
      setEndDate(localYmdFromDate(end))
      setEndTime(localHmFromDate(end))
    }
    setInProgress(false)
  }, [initialValue, onChange])

  const handleInternalChange = useCallback(
    (next: ActivityDateTimeValue | null) => {
      onChange(next)
    },
    [onChange]
  )

  const computedAllDay = useMemo(() => {
    // If user did not set a time, treat as date-only (all-day).
    return !startTime
  }, [startTime])

  const isTimeEnabled = startDate.trim().length > 0

  const emitFromInputs = useCallback(
    (next: {
      startDate: string
      startTime: string
      endDate: string
      endTime: string
      inProgress: boolean
    }) => {
      const hasStartDate = next.startDate.trim().length > 0
      if (!hasStartDate) {
        handleInternalChange(null)
        return
      }

      const allDay = next.startTime.trim().length === 0
      const start = toLocalDate(next.startDate, allDay ? null : next.startTime)
      if (!start) return

      if (allDay) {
        const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0)
        const endInclusive = next.endDate.trim().length > 0 ? toLocalDate(next.endDate, null) : null

        if (next.inProgress) {
          handleInternalChange({
            start: startMidnight.toISOString(),
            end: null,
            inProgress: true,
            allDay: true,
          })
          return
        }

        const endExclusive = (() => {
          if (endInclusive) {
            const endEx = new Date(
              endInclusive.getFullYear(),
              endInclusive.getMonth(),
              endInclusive.getDate(),
              0,
              0,
              0,
              0
            )
            endEx.setDate(endEx.getDate() + 1)
            return endEx
          }
          const fallback = new Date(startMidnight)
          fallback.setDate(fallback.getDate() + 1)
          return fallback
        })()

        handleInternalChange({
          start: startMidnight.toISOString(),
          end: endExclusive.toISOString(),
          inProgress: false,
          allDay: true,
        })
        return
      }

      const end = (() => {
        if (next.endDate.trim().length === 0) return null
        const endTimeToUse =
          next.endTime.trim().length > 0 ? next.endTime : next.startTime.trim().length > 0 ? next.startTime : null
        return toLocalDate(next.endDate, endTimeToUse)
      })()

      handleInternalChange({
        start: start.toISOString(),
        end: end ? end.toISOString() : null,
        inProgress: false,
        allDay: false,
      })
    },
    [handleInternalChange]
  )

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <UIText as="p" className="text-xs text-gray-500">
          Times shown in {timeZone} ({utcOffset})
        </UIText>
        <div>
          <UIText as="label" className="block mb-1">
            Start
          </UIText>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                const next = e.target.value
                setStartDate(next)
                setInProgress(false)
                emitFromInputs({
                  startDate: next,
                  startTime,
                  endDate,
                  endTime,
                  inProgress: false,
                })
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="time"
              value={startTime}
              disabled={!isTimeEnabled}
              onChange={(e) => {
                const next = e.target.value
                setStartTime(next)
                setInProgress(false)
                emitFromInputs({
                  startDate,
                  startTime: next,
                  endDate,
                  endTime,
                  inProgress: false,
                })
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <UIText as="label">End</UIText>
            {computedAllDay && (
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={inProgress}
                  onChange={(e) => {
                    const next = e.target.checked
                    setInProgress(next)
                    emitFromInputs({
                      startDate,
                      startTime,
                      endDate,
                      endTime,
                      inProgress: next,
                    })
                  }}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <UIText as="span">In progress</UIText>
              </label>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              type="date"
              value={endDate}
              disabled={inProgress}
              onChange={(e) => {
                const next = e.target.value
                setEndDate(next)
                emitFromInputs({
                  startDate,
                  startTime,
                  endDate: next,
                  endTime,
                  inProgress,
                })
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
            />
            <input
              type="time"
              value={endTime}
              disabled={!isTimeEnabled || computedAllDay || inProgress}
              onChange={(e) => {
                const next = e.target.value
                setEndTime(next)
                emitFromInputs({
                  startDate,
                  startTime,
                  endDate,
                  endTime: next,
                  inProgress,
                })
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

