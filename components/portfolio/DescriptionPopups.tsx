'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Content, UIText } from '@/components/ui'

const MAX_DESCRIPTION_CHARS = 3000

function useEscapeToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])
}

function useAutosizeTextarea({
  value,
  open,
  maxHeightRatio = 0.6,
}: {
  value: string
  open: boolean
  maxHeightRatio?: number
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const [maxPx, setMaxPx] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    const compute = () => setMaxPx(Math.max(220, Math.floor(window.innerHeight * maxHeightRatio)))
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [open, maxHeightRatio])

  useEffect(() => {
    const el = ref.current
    if (!el || !open) return
    el.style.height = 'auto'
    const next = maxPx ? Math.min(el.scrollHeight, maxPx) : el.scrollHeight
    el.style.height = `${next}px`
  }, [value, open, maxPx])

  return { ref, maxPx }
}

export function DescriptionEditorPopup({
  open,
  value,
  onChange,
  onClose,
}: {
  open: boolean
  value: string
  onChange: (next: string) => void
  onClose: () => void
}) {
  useEscapeToClose(open, onClose)
  const { ref } = useAutosizeTextarea({ value, open })
  const remaining = useMemo(() => MAX_DESCRIPTION_CHARS - value.length, [value.length])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <Card variant="default" padding="sm">
          <div className="flex items-start justify-between gap-3">
            <UIText as="span">Description</UIText>
            <Button variant="text" size="sm" onClick={onClose} aria-label="Close description editor">
              <UIText>×</UIText>
            </Button>
          </div>

          <div className="mt-3">
            <textarea
              ref={ref}
              value={value}
              onChange={(e) => onChange(e.target.value.slice(0, MAX_DESCRIPTION_CHARS))}
              maxLength={MAX_DESCRIPTION_CHARS}
              placeholder="Write a description. You can use paragraphs."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white resize-none overflow-y-auto whitespace-pre-wrap"
              rows={4}
            />
            <div className="mt-2 flex items-center justify-between">
              <UIText className="text-xs text-gray-500">Max {MAX_DESCRIPTION_CHARS} characters</UIText>
              <UIText
                className={`text-xs ${remaining < 0 ? 'text-red-600' : 'text-gray-500'}`}
              >
                {value.length}/{MAX_DESCRIPTION_CHARS}
              </UIText>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

export function DescriptionViewerPopup({
  open,
  description,
  onClose,
}: {
  open: boolean
  description: string
  onClose: () => void
}) {
  useEscapeToClose(open, onClose)
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <Card variant="default" padding="sm">
          <div className="flex items-start justify-end">
            <Button variant="text" size="sm" onClick={onClose} aria-label="Close description">
              <UIText>×</UIText>
            </Button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            <Content className="whitespace-pre-wrap">{description}</Content>
          </div>
        </Card>
      </div>
    </div>
  )
}

