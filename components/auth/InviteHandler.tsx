'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Client component to handle auth hash fragments from Supabase
 * Handles invite links, email confirmations, password resets, etc.
 * Supabase redirects with tokens in the hash (#access_token=...)
 * Hash fragments are only accessible on the client side
 * 
 * Supported types:
 * - invite: User invite links
 * - signup: Email confirmation links
 * - recovery: Password reset links
 * - email_change: Email change confirmation
 */
export function InviteHandler() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const handleAuthHash = async () => {
      // Check if we're on a page with hash fragments
      if (typeof window === 'undefined') return

      const hash = window.location.hash
      if (!hash) return

      // Parse hash fragments (format: #access_token=...&expires_at=...&type=signup|invite|recovery)
      const params = new URLSearchParams(hash.substring(1))
      const accessToken = params.get('access_token')
      const type = params.get('type')

      // Handle any auth type that has an access_token
      // Types: invite, signup, recovery, email_change, etc.
      if (!accessToken) return

      console.log('Processing auth hash fragment, type:', type)

      try {
        // Set the session using the access token
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: params.get('refresh_token') || '',
        })

        if (error) {
          console.error('Error setting session from auth hash:', error)
          // Redirect to login with error
          const errorParam = type === 'invite' ? 'invite_failed' : 'auth_failed'
          router.push(`/login?error=${errorParam}`)
          return
        }

        if (data.session) {
          console.log('Session set successfully from auth hash, type:', type)
          // Session set successfully, clear hash and refresh
          window.history.replaceState(null, '', window.location.pathname)
          // Refresh to update server-side auth state
          router.refresh()
        } else {
          console.warn('No session returned after setting auth hash')
        }
      } catch (err) {
        console.error('Exception handling auth hash:', err)
        const errorParam = type === 'invite' ? 'invite_failed' : 'auth_failed'
        router.push(`/login?error=${errorParam}`)
      }
    }

    handleAuthHash()
  }, [router, supabase])

  return null
}


