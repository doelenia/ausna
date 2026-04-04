'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSharedAuth } from '@/lib/auth/browser-auth'
import { createClient } from '@/lib/supabase/client'
import { createHumanPortfolioHelpers } from '@/lib/portfolio/human-client'
import { getHumanProfileUrl } from '@/lib/portfolio/routes'

const EXPLORE_AFTER_MAIN_MS = 180
const IDLE_TIMEOUT_MS = 2500

function runWhenIdle(fn: () => void, timeoutMs: number) {
  if (typeof window === 'undefined') return
  const ric = window.requestIdleCallback
  if (typeof ric === 'function') {
    ric(() => fn(), { timeout: timeoutMs })
  } else {
    window.setTimeout(fn, Math.min(timeoutMs, 800))
  }
}

/**
 * Option B: always warm light nav targets; defer heavy routes until the browser is idle.
 * - Immediate: /search, /messages
 * - After sign-in: human profile (id URL, then canonical slug/id from portfolio)
 * - Idle (signed-in only): /main, then /explore (staggered)
 */
export function NavRouteWarmup() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    try {
      router.prefetch('/search')
      router.prefetch('/messages')
    } catch {
      /* noop */
    }

    void getSharedAuth().then((auth) => {
      if (cancelled) return
      const user = auth?.user
      if (!user) return

      try {
        router.prefetch(getHumanProfileUrl(user.id))
      } catch {
        /* noop */
      }

      const supabase = createClient()
      const helpers = createHumanPortfolioHelpers(supabase)
      void helpers
        .ensureHumanPortfolio(user.id)
        .then((p) => {
          if (cancelled) return
          try {
            router.prefetch(getHumanProfileUrl(p.slug || p.id))
          } catch {
            /* noop */
          }
        })
        .catch(() => {})

      runWhenIdle(() => {
        if (cancelled) return
        try {
          router.prefetch('/main')
        } catch {
          /* noop */
        }
        window.setTimeout(() => {
          if (cancelled) return
          try {
            router.prefetch('/explore')
          } catch {
            /* noop */
          }
        }, EXPLORE_AFTER_MAIN_MS)
      }, IDLE_TIMEOUT_MS)
    })

    return () => {
      cancelled = true
    }
  }, [router])

  return null
}
