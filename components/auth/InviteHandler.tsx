'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Client component to handle invite links with hash fragments
 * Supabase invite links redirect with tokens in the hash (#access_token=...)
 * Hash fragments are only accessible on the client side
 */
export function InviteHandler() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const handleInvite = async () => {
      // Check if we're on a page with hash fragments (invite link)
      if (typeof window === 'undefined') return

      const hash = window.location.hash
      if (!hash) return

      // Parse hash fragments (format: #access_token=...&expires_at=...&type=invite)
      const params = new URLSearchParams(hash.substring(1))
      const accessToken = params.get('access_token')
      const type = params.get('type')

      // Only handle invite type
      if (type !== 'invite' || !accessToken) return

      try {
        // Set the session using the access token
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: params.get('refresh_token') || '',
        })

        if (error) {
          console.error('Error setting session from invite:', error)
          // Redirect to login with error
          router.push('/login?error=invite_failed')
          return
        }

        if (data.session) {
          // Session set successfully, clear hash and redirect
          window.history.replaceState(null, '', window.location.pathname)
          router.push('/main')
          router.refresh()
        }
      } catch (err) {
        console.error('Exception handling invite:', err)
        router.push('/login?error=invite_failed')
      }
    }

    handleInvite()
  }, [router, supabase])

  return null
}


