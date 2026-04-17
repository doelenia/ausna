'use client'

import { UIText } from '@/components/ui'
import { ChevronDown, FileText, Folder } from 'lucide-react'

export type PostKind = 'post' | 'resource'

export function NotePostKindPill({
  kind,
  interactive = false,
  showChevron = false,
  className = '',
}: {
  kind: PostKind
  interactive?: boolean
  showChevron?: boolean
  className?: string
}) {
  const label = kind === 'post' ? 'Note' : 'Resource'
  const Icon = kind === 'post' ? FileText : Folder

  const pillClass =
    kind === 'post'
      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      : kind === 'resource'
        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'

  const base =
    'inline-flex items-center gap-2 px-2 py-0.5 rounded-full transition-colors flex-shrink-0 min-w-0'

  return (
    <span className={`${base} ${pillClass} ${interactive ? 'cursor-pointer' : ''} ${className}`}>
      <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.8} aria-hidden />
      <UIText as="span" className="whitespace-nowrap">
        {label}
      </UIText>
      {showChevron && <ChevronDown className="w-4 h-4 flex-shrink-0" strokeWidth={1.8} aria-hidden />}
    </span>
  )
}

