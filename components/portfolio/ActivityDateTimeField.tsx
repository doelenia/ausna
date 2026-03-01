'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, Button, UIText } from '@/components/ui'
import { ActivityDateTimeBadge } from './ActivityDateTimeBadge'
import { ActivityDateTimePicker } from './ActivityDateTimePicker'
import type { ActivityDateTimeValue } from '@/lib/datetime'

const modalFooterClass =
  'mt-4 flex justify-between items-center gap-2 pb-[calc(var(--app-topnav-height)+env(safe-area-inset-bottom,0px)+16px)] md:pb-0'

export interface ActivityDateTimeFieldProps {
  /** Current value (controlled). */
  value: ActivityDateTimeValue | null
  /** Called when value changes (e.g. from picker or Clear). */
  onChange: (value: ActivityDateTimeValue | null) => void
  /** Title shown in the picker (e.g. activity name). */
  portfolioTitle: string
  /** Optional hint below the badge. */
  hint?: React.ReactNode
  /** When true, Done is disabled until selection has a start (create flow). */
  requireValidSelection?: boolean
  /** When true, open the picker modal on mount (e.g. edit from view badge). */
  defaultOpen?: boolean
}

/**
 * Shared activity date & time field: badge + modal with picker.
 * Used by both CreateActivityForm and PortfolioEditor so datetime UI stays in sync.
 */
export function ActivityDateTimeField({
  value,
  onChange,
  portfolioTitle,
  hint,
  requireValidSelection = false,
  defaultOpen = false,
}: ActivityDateTimeFieldProps) {
  const [showPicker, setShowPicker] = useState(false)
  const isSelectionValid = useMemo(() => !value || !!value.start, [value])

  useEffect(() => {
    if (defaultOpen) setShowPicker(true)
  }, [defaultOpen])

  return (
    <>
      <div className="max-w-full">
        <ActivityDateTimeBadge
          value={value ?? undefined}
          onClick={() => setShowPicker(true)}
        />
      </div>
      {hint && (
        <UIText as="p" className="text-xs text-gray-500 mt-1">
          {hint}
        </UIText>
      )}

      {showPicker && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40">
          <div className="w-full h-full md:h-auto md:max-w-2xl px-0 md:px-4">
            <Card>
              <ActivityDateTimePicker
                portfolioTitle={portfolioTitle}
                initialValue={value}
                onChange={onChange}
              />
              <div className={modalFooterClass}>
                <Button
                  type="button"
                  variant="text"
                  size="sm"
                  onClick={() => {
                    onChange(null)
                    setShowPicker(false)
                  }}
                >
                  <UIText>Clear</UIText>
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowPicker(false)}
                  >
                    <UIText>Cancel</UIText>
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={requireValidSelection && !isSelectionValid}
                    onClick={() => setShowPicker(false)}
                  >
                    <UIText>Done</UIText>
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
