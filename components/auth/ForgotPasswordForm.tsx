'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button, UIText } from '@/components/ui'
import { getSiteUrl } from '@/lib/utils/site-url'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const siteUrl = getSiteUrl()
      // Ensure the redirect URL is absolute and points to our reset password page
      // Supabase will include this in the .ConfirmationURL in the email template
      const redirectUrl = `${siteUrl}/reset-password`
      
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      })

      if (resetError) throw resetError

      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <div className="mb-4">
            <svg
              className="mx-auto h-12 w-12 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <UIText as="h3" className="mb-2 font-semibold text-lg">
            Check your email
          </UIText>
          <UIText className="mb-4">
            We've sent a password reset link to <strong>{email}</strong>. Please check your email and click the link to reset your password.
          </UIText>
          <UIText as="p" className="text-xs text-gray-500">
            Didn't receive the email? Check your spam folder or try again.
          </UIText>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <UIText as="label" htmlFor="email" className="block mb-1">
            Email
          </UIText>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            placeholder="your@email.com"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={loading}
        >
          <UIText>
            {loading ? 'Sending...' : 'Send reset link'}
          </UIText>
        </Button>
      </form>
    </div>
  )
}

