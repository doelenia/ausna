'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, UIText } from '@/components/ui'

export function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasValidSession, setHasValidSession] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // `returnTo` allows callers (e.g. space invite activation flow) to redirect
  // back to a specific page after password reset instead of the default login page.
  const returnTo = searchParams?.get('returnTo') || null

  useEffect(() => {
    const checkSession = async () => {
      if (typeof window !== 'undefined') {
        const hash = window.location.hash
        if (hash) {
          const params = new URLSearchParams(hash.substring(1))
          const accessToken = params.get('access_token')
          const type = params.get('type')

          if (accessToken && type === 'recovery') {
            try {
              const { data, error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: params.get('refresh_token') || '',
              })

              if (error) {
                console.error('Error setting recovery session:', error)
                setHasValidSession(false)
                return
              }

              if (data.session) {
                // Preserve returnTo param when cleaning the hash
                const cleanPath = returnTo
                  ? `/reset-password?returnTo=${encodeURIComponent(returnTo)}`
                  : '/reset-password'
                window.history.replaceState(null, '', cleanPath)
                setHasValidSession(true)
                return
              }
            } catch (err) {
              console.error('Exception setting recovery session:', err)
              setHasValidSession(false)
              return
            }
          }
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      setHasValidSession(!!session)
    }
    checkSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      setLoading(false)
      return
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      // Finalize account activation (clear pseudo flag + pending invite metadata)
      try {
        await fetch('/api/auth/activate', { method: 'POST' })
      } catch {
        // Non-critical; proceed regardless
      }

      if (returnTo) {
        window.location.href = returnTo
      } else {
        router.push('/login?password_reset=success')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!hasValidSession) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <UIText as="h3" className="mb-2 font-semibold text-lg">
            Invalid or expired link
          </UIText>
          <UIText className="mb-4">
            This password reset link is invalid or has expired. Please request a new one.
          </UIText>
          <Button variant="primary" asLink href="/forgot-password">
            <UIText>Request new reset link</UIText>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <UIText as="label" htmlFor="password" className="block mb-1">
            New Password
          </UIText>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            placeholder="••••••••"
          />
        </div>

        <div>
          <UIText as="label" htmlFor="confirmPassword" className="block mb-1">
            Confirm New Password
          </UIText>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}

        <Button type="submit" variant="primary" fullWidth disabled={loading}>
          <UIText>{loading ? 'Updating...' : 'Update password'}</UIText>
        </Button>
      </form>
    </div>
  )
}
