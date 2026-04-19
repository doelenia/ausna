'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Portfolio } from '@/types/portfolio'
import { isHumanPortfolio } from '@/types/portfolio'
import { createNote } from '@/app/notes/actions'
import { Button, Card, Content, UIText } from '@/components/ui'
import { NotePostKindPill, type PostKind } from '@/components/notes/NotePostKindPill'
import { Settings } from 'lucide-react'
import type { NoteVisibility } from '@/types/note'

type AnnotationPrivacy = 'everyone' | 'friends' | 'authors'

function canCreateResourceClient(
  portfolio: Portfolio,
  isOwner: boolean,
  isManager: boolean,
  isMember: boolean
): boolean {
  if (isHumanPortfolio(portfolio)) return isOwner
  if (isOwner || isManager) return true
  const meta = portfolio.metadata as { properties?: { external?: boolean } } | undefined
  const ext = meta?.properties?.external === true
  return ext && isMember
}

interface SpaceFeedMiniNoteComposerProps {
  portfolio: Portfolio
  isOwner: boolean
  isManager: boolean
  isMember: boolean
  onCreated?: () => void
}

export function SpaceFeedMiniNoteComposer({
  portfolio,
  isOwner,
  isManager,
  isMember,
  onCreated,
}: SpaceFeedMiniNoteComposerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const kindMenuRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [text, setText] = useState('')
  const [postKind, setPostKind] = useState<PostKind>('post')
  const [postKindMenuOpen, setPostKindMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [visibility, setVisibility] = useState<NoteVisibility>('members')
  const [annotationPrivacy, setAnnotationPrivacy] = useState<AnnotationPrivacy>('everyone')
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([])
  const [collectionsLoading, setCollectionsLoading] = useState(false)
  const [collectionsLoaded, setCollectionsLoaded] = useState(false)
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canResource = canCreateResourceClient(portfolio, isOwner, isManager, isMember)
  const canSelectPostKind = canResource

  useEffect(() => {
    if (!canResource && postKind === 'resource') {
      setPostKind('post')
    }
  }, [canResource, postKind])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.overflow = 'hidden'
    const lineHeight = 24
    const maxHeight = 200
    const h = Math.min(Math.max(el.scrollHeight, lineHeight), maxHeight)
    el.style.height = `${h}px`
    el.style.overflow = h >= maxHeight ? 'auto' : 'hidden'
  }, [text])

  useEffect(() => {
    if (!settingsOpen && !postKindMenuOpen) return
    const onDocMouseDown = (e: MouseEvent) => {
      const node = e.target as Node
      if (rootRef.current?.contains(node)) return
      setSettingsOpen(false)
      setPostKindMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [settingsOpen, postKindMenuOpen])

  useEffect(() => {
    if (!settingsOpen || collectionsLoaded) return
    let cancelled = false
    const run = async () => {
      setCollectionsLoading(true)
      try {
        const res = await fetch(`/api/collections?portfolio_id=${encodeURIComponent(portfolio.id)}`)
        const data = await res.json().catch(() => ({}))
        if (!cancelled) {
          setCollections(Array.isArray(data.collections) ? data.collections : [])
          setCollectionsLoaded(true)
        }
      } catch {
        if (!cancelled) setCollections([])
      } finally {
        if (!cancelled) setCollectionsLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [settingsOpen, collectionsLoaded, portfolio.id])

  const toggleCollection = useCallback((id: string) => {
    setSelectedCollectionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || isSubmitting) return

    setError(null)
    setIsSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('text', trimmed)
      formData.append('assigned_portfolios', JSON.stringify([portfolio.id]))
      formData.append('note_type', postKind)
      formData.append('visibility', visibility)
      if (postKind === 'post') {
        formData.append('annotation_privacy', annotationPrivacy)
      }
      if (selectedCollectionIds.length > 0) {
        formData.append('collection_ids', JSON.stringify(selectedCollectionIds))
      }

      const result = await createNote(formData)
      if (result.success) {
        setText('')
        setSelectedCollectionIds([])
        setPostKindMenuOpen(false)
        setSettingsOpen(false)
        onCreated?.()
        requestAnimationFrame(() => textareaRef.current?.focus())
      } else {
        setError(result.error || 'Could not publish')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isResource = postKind === 'resource'

  return (
    <div ref={rootRef} className="mb-4 px-6 md:px-10">
      <Card variant="subtle" padding="sm" className="relative">
        <div className="absolute right-2 top-2 z-20">
          <Button
            type="button"
            variant="text"
            size="sm"
            className="min-w-0 p-2"
            aria-label="Advanced settings"
            aria-expanded={settingsOpen}
            aria-haspopup="dialog"
            onClick={() => {
              setSettingsOpen((o) => !o)
              setPostKindMenuOpen(false)
            }}
          >
            <Settings className="h-4 w-4 text-gray-600" strokeWidth={1.5} aria-hidden />
          </Button>
          {settingsOpen && (
            <div
              role="dialog"
              aria-label="Advanced settings"
              className="absolute right-0 top-10 z-30 w-[min(100vw-2rem,20rem)]"
            >
              <Card
                variant="default"
                padding="sm"
                className="border border-gray-200 shadow-lg"
              >
              <div className="space-y-4">
                <div>
                  <UIText as="span" className="mb-2 block text-gray-700">
                    Visibility
                  </UIText>
                  <div className="flex flex-wrap gap-2">
                    {(['public', 'members'] as const).map((v) => (
                      <Button
                        key={v}
                        type="button"
                        size="sm"
                        variant={visibility === v ? 'primary' : 'secondary'}
                        onClick={() => setVisibility(v)}
                      >
                        <UIText>{v === 'public' ? 'Public' : 'Members'}</UIText>
                      </Button>
                    ))}
                  </div>
                  <Content className="mt-1 text-gray-500">
                    Members-only notes are visible to members of this space.
                  </Content>
                </div>

                {!isResource && (
                  <div>
                    <UIText as="span" className="mb-2 block text-gray-700">
                      Comment privacy
                    </UIText>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { value: 'everyone' as const, label: 'Everyone' },
                          { value: 'friends' as const, label: 'Friends' },
                          { value: 'authors' as const, label: 'Authors' },
                        ] as const
                      ).map(({ value, label }) => (
                        <Button
                          key={value}
                          type="button"
                          size="sm"
                          variant={annotationPrivacy === value ? 'primary' : 'secondary'}
                          onClick={() => setAnnotationPrivacy(value)}
                        >
                          <UIText>{label}</UIText>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {!isResource && (
                  <div>
                    <UIText as="span" className="mb-2 block text-gray-700">
                      Collections (optional)
                    </UIText>
                    {collectionsLoading ? (
                      <UIText className="text-gray-500">Loading collections...</UIText>
                    ) : collections.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {collections.map((c) => (
                          <Button
                            key={c.id}
                            type="button"
                            size="sm"
                            variant={selectedCollectionIds.includes(c.id) ? 'primary' : 'secondary'}
                            onClick={() => toggleCollection(c.id)}
                          >
                            <UIText>{c.name}</UIText>
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <UIText className="text-gray-500">No collections in this space yet.</UIText>
                    )}
                  </div>
                )}
              </div>
              </Card>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="pr-10">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <UIText className="text-red-700">{error}</UIText>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a note..."
            rows={1}
            className="w-full min-h-[24px] resize-none border-0 bg-transparent px-0 py-2 focus:outline-none"
            disabled={isSubmitting}
          />

          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <div className="relative" ref={kindMenuRef}>
              {canSelectPostKind ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setPostKindMenuOpen((v) => !v)
                      setSettingsOpen(false)
                    }}
                    aria-haspopup="menu"
                    aria-expanded={postKindMenuOpen}
                    className="focus:outline-none"
                  >
                    <NotePostKindPill kind={postKind} interactive showChevron />
                  </button>
                  {postKindMenuOpen && (
                    <div
                      role="menu"
                      className="absolute left-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
                    >
                      {(['post', 'resource'] as PostKind[]).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setPostKind(kind)
                            setPostKindMenuOpen(false)
                          }}
                          className="flex w-full items-center justify-start px-3 py-2 hover:bg-gray-50"
                        >
                          <NotePostKindPill kind={kind} />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <NotePostKindPill kind="post" />
              )}
            </div>

            <Button type="submit" variant="primary" size="sm" disabled={isSubmitting || !text.trim()}>
              <UIText>{isSubmitting ? 'Posting...' : 'Post'}</UIText>
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
