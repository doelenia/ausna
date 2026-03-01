'use client'

import { useState, useEffect } from 'react'
import { Card, Button, UIText } from '@/components/ui'
import { ActivityLocationBadge } from './ActivityLocationBadge'
import { ActivityLocationPicker } from './ActivityLocationPicker'
import type { ActivityLocationValue } from '@/lib/location'

const modalFooterClass =
  'mt-4 flex justify-between items-center gap-2 pb-[calc(var(--app-topnav-height)+env(safe-area-inset-bottom,0px)+16px)] md:pb-0'

export interface ActivityLocationFieldProps {
  /** Current value (controlled). */
  value: ActivityLocationValue | null
  /** Called when value changes (e.g. from picker or Clear). */
  onChange: (value: ActivityLocationValue | null) => void
  /** Title shown in the picker (e.g. activity name). */
  portfolioTitle: string
  /** When true, full address is shown (create/edit flows). */
  canSeeFullLocation?: boolean
  /** When true, open the picker modal on mount (e.g. edit from view badge). */
  defaultOpen?: boolean
}

/**
 * Shared activity location field: badge + modal with picker (physical + online).
 * Used by both CreateActivityForm and PortfolioEditor so location UI stays in sync.
 */
export function ActivityLocationField({
  value,
  onChange,
  portfolioTitle,
  canSeeFullLocation = true,
  defaultOpen = false,
}: ActivityLocationFieldProps) {
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    if (defaultOpen) setShowPicker(true)
  }, [defaultOpen])

  return (
    <>
      <div className="max-w-full">
        <ActivityLocationBadge
          value={value ?? undefined}
          canSeeFullLocation={canSeeFullLocation}
          onClick={() => setShowPicker(true)}
        />
      </div>

      {showPicker && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40">
          <div className="w-full h-full md:h-auto md:max-w-2xl px-0 md:px-4">
            <Card>
              <ActivityLocationPicker
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
