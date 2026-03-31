'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buildLoginHref } from '@/lib/auth/login-redirect'

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

      // Handle query `code` (PKCE exchange) — needed for email confirmation redirects.
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        const emailConfirmation = url.searchParams.get('emailConfirmation') === '1'

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)

          // Always remove `code` from URL. If exchange succeeded, show success banner.
          // If exchange failed due to missing PKCE verifier (common when Safari/storage is cleared),
          // still show "verified" but prompt the user to sign in.
          url.searchParams.delete('code')
          url.searchParams.delete('emailConfirmation')
          if (emailConfirmation) url.searchParams.set('email_confirmed', '1')
          if (error) {
            const msg = String(error.message || '')
            if (msg.includes('PKCE code verifier not found')) {
              url.searchParams.set('verified_needs_login', '1')
            } else {
              url.searchParams.set('verified_needs_login', '1')
            }
          } else {
            url.searchParams.delete('verified_needs_login')
          }
          // On success, do a full navigation so server components see fresh cookies immediately.
          if (!error) {
            window.location.href = url.toString()
            return
          }

          // On failure, route user to login (clearer than leaving them on /main while logged out).
          if (emailConfirmation) {
            const loginUrl = new URL(buildLoginHref({ returnTo: '/main' }), window.location.origin)
            loginUrl.searchParams.set('email_confirmed', '1')
            loginUrl.searchParams.set('verified_needs_login', '1')
            window.location.href = loginUrl.toString()
            return
          }

          window.history.replaceState(null, '', url.toString())
          router.refresh()
          return
        }
      } catch {
        // ignore and fall back to hash handling
      }

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
          const url = new URL(window.location.href)
          url.hash = ''
          const otpType = typeof type === 'string' ? type : ''
          // Email confirmation and magiclink should show a one-time "verified" banner.
          if (otpType === 'signup' || otpType === 'magiclink') {
            url.searchParams.set('email_confirmed', '1')
          }
          // Preserve existing query params (e.g. returnTo-derived params) while removing the hash.
          window.history.replaceState(null, '', url.toString())
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



