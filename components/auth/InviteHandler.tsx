'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Client component to handle auth hash fragments from Supabase.
 * Handles invite links, email confirmations, password resets, etc.
 * Supabase redirects with tokens in the hash (#access_token=...).
 */
export function InviteHandler() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const hasRunRef = useRef(false)

  useEffect(() => {
    if (hasRunRef.current) return
    hasRunRef.current = true

    const handleAuthHash = async () => {
      if (typeof window === 'undefined') return

      const hash = window.location.hash
      if (!hash) return

      const params = new URLSearchParams(hash.substring(1))
      const accessToken = params.get('access_token')
      const type = params.get('type')
      if (!accessToken) return

      console.log('Processing auth hash fragment, type:', type)

      if (type === 'recovery') {
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: params.get('refresh_token') || '',
          })

          if (error) {
            console.error('Error setting session from recovery token:', error)
            router.push('/reset-password?error=invalid_token')
            return
          }

          if (data.session) {
            window.history.replaceState(null, '', '/reset-password')
            router.push('/reset-password')
          } else {
            router.push('/reset-password?error=invalid_token')
          }
        } catch (err) {
          console.error('Exception handling recovery token:', err)
          router.push('/reset-password?error=invalid_token')
        }
        return
      }

      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: params.get('refresh_token') || '',
        })

        if (error) {
          console.error('Error setting session from auth hash:', error)
          const errorParam = type === 'invite' ? 'invite_failed' : 'auth_failed'
          router.push(`/login?error=${errorParam}`)
          return
        }

        if (data.session) {
          window.history.replaceState(null, '', window.location.pathname)
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


