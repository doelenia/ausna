'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

const STORAGE_PREFIX = 'appScroll:'

function storageKey(pathname: string) {
  return `${STORAGE_PREFIX}${pathname}`
}

/**
 * Persists scrollTop of the main app column in sessionStorage per pathname
 * so browser Back restores position (native restoration does not apply to overflow divs).
 */
export function useAppScrollPersistence(scrollEl: HTMLDivElement | null) {
  const pathname = usePathname()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!scrollEl) return

    const flushSave = () => {
      try {
        sessionStorage.setItem(storageKey(pathname), String(Math.round(scrollEl.scrollTop)))
      } catch {
        /* quota / private mode */
      }
    }

    const onScroll = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(flushSave, 120)
    }

    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      flushSave()
    }
  }, [pathname, scrollEl])

  useEffect(() => {
    if (!scrollEl) return

    const hasHash = typeof window !== 'undefined' && window.location.hash.length > 1
    if (hasHash) return

    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(storageKey(pathname))
    } catch {
      raw = null
    }

    const y = raw != null ? Math.max(0, parseInt(raw, 10) || 0) : 0

    const apply = () => {
      const max = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
      scrollEl.scrollTop = Math.min(y, max)
    }

    requestAnimationFrame(() => {
      apply()
      requestAnimationFrame(apply)
    })
  }, [pathname, scrollEl])
}
