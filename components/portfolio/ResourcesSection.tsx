'use client'

import { useEffect, useMemo, useState } from 'react'
import { Folder } from 'lucide-react'
import type { Note } from '@/types/note'
import type { Portfolio } from '@/types/portfolio'
import { NotesMasonry } from '@/components/notes/NotesMasonry'
import { OpenCallCarouselPopup } from '@/components/notes/OpenCallCarouselPopup'
import { UIText } from '@/components/ui'

type ResourcesApiResponse = {
  success: boolean
  resources: Note[]
  canCreateResource: boolean
  resourceLimit: number
  resourceCount: number
  error?: string
}

interface ResourcesSectionProps {
  portfolioId: string
  portfolioType: Portfolio['type']
  currentUserId?: string
}

export function ResourcesSection({
  portfolioId,
  portfolioType,
  currentUserId,
}: ResourcesSectionProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resources, setResources] = useState<Note[]>([])
  const [popupOpen, setPopupOpen] = useState(false)
  const [popupIndex, setPopupIndex] = useState(0)
  const [canCreateResource, setCanCreateResource] = useState(false)
  const [resourceLimit, setResourceLimit] = useState(6)
  const [resourceCount, setResourceCount] = useState(0)

  const createUrl = useMemo(() => {
    if (portfolioType === 'human') return '/notes/create?kind=resource'
    return `/notes/create?portfolio=${encodeURIComponent(portfolioId)}&kind=resource`
  }, [portfolioId, portfolioType])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/resources?portfolioId=${encodeURIComponent(portfolioId)}`)
        const data: ResourcesApiResponse = await res.json()
        if (cancelled) return

        if (res.ok && data?.success) {
          setResources(Array.isArray(data.resources) ? data.resources : [])
          setCanCreateResource(!!data.canCreateResource)
          setResourceLimit(typeof data.resourceLimit === 'number' ? data.resourceLimit : 6)
          setResourceCount(typeof data.resourceCount === 'number' ? data.resourceCount : 0)
        } else {
          setError(data?.error || 'Failed to load resources')
        }
      } catch (e: any) {
        if (cancelled) return
        setError(e?.message || 'Failed to load resources')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [portfolioId, currentUserId])

  const showSection = canCreateResource || resources.length > 0
  const showPlaceholder = canCreateResource && resourceCount < resourceLimit

  if (loading) return null
  if (error) return null
  if (!showSection) return null

  const openPopupAt = (index: number) => {
    if (!resources[index]) return
    setPopupIndex(index)
    setPopupOpen(true)
  }

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Folder className="w-5 h-5 text-gray-600" strokeWidth={1.5} aria-hidden />
        <UIText>Resources</UIText>
      </div>

      <NotesMasonry
        notes={resources}
        portfolioId={portfolioId}
        currentUserId={currentUserId}
        disableNavigation
        onNoteClick={openPopupAt}
        showPlaceholder={showPlaceholder}
        placeholderHref={createUrl}
      />

      {popupOpen && resources.length > 0 && (
        <OpenCallCarouselPopup
          openCalls={resources}
          initialIndex={popupIndex}
          currentUserId={currentUserId}
          onClose={() => setPopupOpen(false)}
        />
      )}
    </div>
  )
}

