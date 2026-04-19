'use client'

import type { CSSProperties, ReactNode } from 'react'
import { UIText } from '@/components/ui'
import type { MemberFeedCountsPayload } from '@/components/main/FeedView'
import { BookMarked, Folder, X } from 'lucide-react'

export type SpaceMemberFeedTab = null | 'resources' | { kind: 'collection'; id: string }

interface SpaceMemberFeedFilterTabsProps {
  active: SpaceMemberFeedTab
  onChange: (next: SpaceMemberFeedTab) => void
  collections: Array<{ id: string; name: string }>
  counts: MemberFeedCountsPayload | null
}

const segmentBlurShellStyle = {
  WebkitBackdropFilter: 'blur(24px)',
  backdropFilter: 'blur(24px)',
  WebkitTransform: 'translateZ(0)',
  transform: 'translateZ(0)',
  isolation: 'isolate',
} as CSSProperties

function countLabel(n: number | undefined): string {
  if (n === undefined) return '(—)'
  return `(${n})`
}

/** Matches main `FeedTabs` segment height (`px-4 py-2` + ~14px text ≈ 2.5rem). */
const TAB_GROUP_TRIGGER_H = 'h-10 min-h-10'

function ActiveFilterClearShell({
  children,
  tone,
  onClear,
}: {
  children: ReactNode
  tone: 'blue' | 'gray'
  onClear: () => void
}) {
  const divider = tone === 'blue' ? 'border-blue-200' : 'border-gray-300'
  return (
    <div
      className={`group inline-flex max-w-full flex-shrink-0 items-stretch overflow-hidden rounded-lg ${TAB_GROUP_TRIGGER_H} ${
        tone === 'blue' ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-800'
      }`}
    >
      {children}
      <button
        type="button"
        aria-label="Clear filter"
        className={`inline-flex h-full min-h-0 items-center justify-center self-stretch border-l px-2 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${divider} opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto ${
          tone === 'blue' ? 'focus-visible:ring-blue-400' : 'focus-visible:ring-gray-400'
        }`}
        onClick={onClear}
      >
        <X className="h-4 w-4 flex-shrink-0" strokeWidth={2} aria-hidden />
      </button>
    </div>
  )
}

export function SpaceMemberFeedFilterTabs({
  active,
  onChange,
  collections,
  counts,
}: SpaceMemberFeedFilterTabsProps) {
  const resN = counts?.resources
  const isResources = active === 'resources'
  const activeCollectionId = typeof active === 'object' && active && active.kind === 'collection' ? active.id : null
  const activeCollection =
    activeCollectionId != null ? collections.find((c) => c.id === activeCollectionId) : null

  const clearFilter = () => onChange(null)

  const stripInner = (
    <div className={`flex items-center gap-2 overflow-x-auto scrollbar-hide ${TAB_GROUP_TRIGGER_H}`}>
      <button
        type="button"
        onClick={() => onChange('resources')}
        className={`inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-white px-4 ring-1 ring-inset ring-blue-200 transition-colors text-blue-700 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${TAB_GROUP_TRIGGER_H}`}
        aria-pressed={false}
      >
        <Folder className="h-4 w-4 flex-shrink-0" strokeWidth={1.8} aria-hidden />
        <UIText as="span" className="whitespace-nowrap">
          Resources{countLabel(resN)}
        </UIText>
      </button>

      {collections.map((c) => {
        const cn = counts?.collections?.[c.id]
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange({ kind: 'collection', id: c.id })}
            className={`inline-flex max-w-[min(100%,280px)] flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-white px-4 ring-1 ring-inset ring-gray-200 transition-colors text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 ${TAB_GROUP_TRIGGER_H}`}
            aria-pressed={false}
          >
            <BookMarked className="h-4 w-4 flex-shrink-0 text-gray-500" strokeWidth={1.8} aria-hidden />
            <UIText as="span" className="min-w-0 truncate" title={c.name}>
              {c.name}
              {countLabel(cn)}
            </UIText>
          </button>
        )
      })}
    </div>
  )

  const singleFilterInner =
    isResources ? (
      <ActiveFilterClearShell tone="blue" onClear={clearFilter}>
        <button
          type="button"
          onClick={clearFilter}
          className={`inline-flex min-h-0 min-w-0 flex-1 items-center gap-2 px-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${TAB_GROUP_TRIGGER_H}`}
          aria-pressed
        >
          <Folder className="h-4 w-4 flex-shrink-0" strokeWidth={1.8} aria-hidden />
          <UIText as="span" className="min-w-0 truncate">
            Resources{countLabel(resN)}
          </UIText>
        </button>
      </ActiveFilterClearShell>
    ) : activeCollectionId ? (
      <ActiveFilterClearShell tone="gray" onClear={clearFilter}>
        <button
          type="button"
          onClick={clearFilter}
          className={`inline-flex min-h-0 min-w-0 flex-1 items-center gap-2 px-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-400 ${TAB_GROUP_TRIGGER_H}`}
          aria-pressed
        >
          <BookMarked className="h-4 w-4 flex-shrink-0 text-gray-600" strokeWidth={1.8} aria-hidden />
          <UIText
            as="span"
            className="min-w-0 truncate"
            title={activeCollection?.name ?? 'Collection'}
          >
            {activeCollection?.name ?? 'Collection'}
            {countLabel(
              activeCollection ? counts?.collections?.[activeCollection.id] : undefined
            )}
          </UIText>
        </button>
      </ActiveFilterClearShell>
    ) : null

  return (
    <div className="mb-3 px-6 md:px-10">
      <div
        className="rounded-xl bg-gray-50/80 p-1 backdrop-blur-xl"
        style={segmentBlurShellStyle}
      >
        {active === null ? stripInner : <div className="flex flex-wrap gap-2">{singleFilterInner}</div>}
      </div>
    </div>
  )
}
