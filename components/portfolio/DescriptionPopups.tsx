'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { Button, Card, Content, UIText } from '@/components/ui'

export const MAX_DESCRIPTION_CHARS = 3000

export const DEFAULT_DESCRIPTION_EDITOR_PLACEHOLDER =
  'Write a description. You can use paragraphs.'

/** Help text for human (account) portfolio description in forms */
export const HUMAN_DESCRIPTION_HELP_TEXT =
  'Tell us a bit about what you’re working on, what you care about, and what kinds of opportunities you’d like to find. You can also add links to projects, portfolios, websites, or other work that represents you (please do not put LinkedIn links here).\n\nThis helps us recommend more relevant opportunities to you.'

export const HUMAN_DESCRIPTION_PLACEHOLDER =
  'Student into climate tech, design, and community projects. Also love cafes, creative ideas, and meeting people. Currently working on hackathons and startup-related projects in Tokyo. Looking for collaborators!'

/** Help text for space (non-human) description in edit/create forms */
export const SPACE_DESCRIPTION_HELP_TEXT =
  'You can add relevant links (NOT LinkedIn!) This description helps us build the knowledge graph to find better opportunities for you.'

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
  placeholder = DEFAULT_DESCRIPTION_EDITOR_PLACEHOLDER,
}: {
  open: boolean
  value: string
  onChange: (next: string) => void
  onClose: () => void
  placeholder?: string
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
      aria-label="Edit description"
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <Card variant="default" padding="sm">
          <div className="flex items-start justify-end gap-3">
            <Button variant="text" size="sm" onClick={onClose} aria-label="Close description editor">
              <UIText>×</UIText>
            </Button>
          </div>

          <div className="mt-1">
            <textarea
              ref={ref}
              value={value}
              onChange={(e) => onChange(e.target.value.slice(0, MAX_DESCRIPTION_CHARS))}
              maxLength={MAX_DESCRIPTION_CHARS}
              placeholder={placeholder}
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

/** Space view: read-only popup with optional edit (owner/manager) and save. */
export function DescriptionSpacePopup({
  open,
  onClose,
  description,
  canEdit,
  onSave,
  onSaved,
  emptyViewHint = 'No description yet.',
}: {
  open: boolean
  onClose: () => void
  description: string
  canEdit: boolean
  onSave?: (next: string) => Promise<{ success: boolean; error?: string }>
  onSaved?: (trimmed: string) => void
  emptyViewHint?: string
}) {
  useEscapeToClose(open, onClose)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [draft, setDraft] = useState(description)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { ref } = useAutosizeTextarea({ value: draft, open: open && mode === 'edit' })
  const remaining = useMemo(() => MAX_DESCRIPTION_CHARS - draft.length, [draft.length])

  useEffect(() => {
    if (!open) return
    setMode('view')
    setDraft(description)
    setSaveError(null)
    setSaving(false)
  }, [open, description])

  if (!open) return null

  const handleEdit = () => {
    setDraft(description)
    setSaveError(null)
    setMode('edit')
  }

  const handleCancelEdit = () => {
    setDraft(description)
    setSaveError(null)
    setMode('view')
  }

  const handleSave = async () => {
    if (!onSave) return
    const next = draft.slice(0, MAX_DESCRIPTION_CHARS)
    setSaving(true)
    setSaveError(null)
    try {
      const result = await onSave(next)
      if (!result.success) {
        setSaveError(result.error || 'Could not save')
        setSaving(false)
        return
      }
      const trimmed = next.trim()
      onSaved?.(trimmed)
      setSaving(false)
      onClose()
    } catch (e: any) {
      setSaveError(e?.message || 'Could not save')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Description"
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <Card variant="default" padding="sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center min-h-[36px]">
              {canEdit && mode === 'view' && (
                <Button
                  type="button"
                  variant="text"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleEdit()
                  }}
                  className="p-2 -ml-2 flex-shrink-0"
                  aria-label="Edit description"
                >
                  <Pencil className="w-5 h-5 text-gray-700" aria-hidden />
                </Button>
              )}
            </div>
            <Button variant="text" size="sm" onClick={onClose} aria-label="Close" className="flex-shrink-0">
              <UIText>×</UIText>
            </Button>
          </div>

          {mode === 'view' && (
            <div className="mt-1 max-h-[70vh] overflow-y-auto min-h-[3rem]">
              {description.trim() ? (
                <Content className="whitespace-pre-wrap">{description}</Content>
              ) : (
                <Content>{emptyViewHint}</Content>
              )}
            </div>
          )}

          {mode === 'edit' && (
            <div className="mt-2">
              <textarea
                ref={ref}
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_DESCRIPTION_CHARS))}
                maxLength={MAX_DESCRIPTION_CHARS}
                placeholder={DEFAULT_DESCRIPTION_EDITOR_PLACEHOLDER}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white resize-none overflow-y-auto whitespace-pre-wrap"
                rows={4}
                disabled={saving}
              />
              <div className="mt-2 flex items-center justify-between">
                <UIText className="text-xs text-gray-500">Max {MAX_DESCRIPTION_CHARS} characters</UIText>
                <UIText className={`text-xs ${remaining < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                  {draft.length}/{MAX_DESCRIPTION_CHARS}
                </UIText>
              </div>
              {saveError && (
                <div className="mt-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md">
                  <UIText>{saveError}</UIText>
                </div>
              )}
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" onClick={handleCancelEdit} disabled={saving}>
                  <UIText>Cancel</UIText>
                </Button>
                <Button type="button" variant="primary" onClick={() => void handleSave()} disabled={saving}>
                  <UIText>{saving ? 'Saving…' : 'Save'}</UIText>
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

/** Unified create/edit: helper + clickable preview (empty placeholder) opens the editor popup. */
export function DescriptionFieldSection({
  value,
  onChange,
  disabled = false,
  helperContent,
  previewEmptyText,
  editorPlaceholder = DEFAULT_DESCRIPTION_EDITOR_PLACEHOLDER,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  helperContent: ReactNode
  previewEmptyText: string
  editorPlaceholder?: string
}) {
  const [editorOpen, setEditorOpen] = useState(false)

  return (
    <>
      <DescriptionEditorPopup
        open={editorOpen}
        value={value}
        onChange={onChange}
        onClose={() => setEditorOpen(false)}
        placeholder={editorPlaceholder}
      />
      <div>
        <UIText as="label" className="block mb-2">
          Description
        </UIText>
        <div className="mb-2">{helperContent}</div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setEditorOpen(true)}
          className="w-full text-left rounded-lg px-2 py-2 -mx-2 border border-gray-200 bg-gray-50 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          aria-label={value.trim() ? 'Edit description' : 'Add description'}
        >
          {value.trim() ? (
            <Content className="whitespace-pre-wrap line-clamp-5 cursor-pointer">{value}</Content>
          ) : (
            <Content className="cursor-pointer text-gray-500">{previewEmptyText}</Content>
          )}
        </button>
      </div>
    </>
  )
}
