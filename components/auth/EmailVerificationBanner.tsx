'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, Button, Title, Content, UIText } from '@/components/ui'
import { buildLoginHref } from '@/lib/auth/login-redirect'
import { getSharedAuth } from '@/lib/auth/browser-auth'

type VerificationBannerState = 'success' | 'expired' | 'error'

export function EmailVerificationBanner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const emailConfirmed = searchParams.get('email_confirmed') === '1'
  const verifiedNeedsLogin = searchParams.get('verified_needs_login') === '1'
  const errorCode = searchParams.get('error_code') || ''
  const error = searchParams.get('error') || ''
  const errorDescription = searchParams.get('error_description') || ''

  const verificationState: VerificationBannerState | null = useMemo(() => {
    if (emailConfirmed) return 'success'
    if (!errorCode) return null
    if (errorCode === 'otp_expired') return 'expired'
    // Supabase may send other OTP-related error codes; keep a generic message for those.
    return 'error'
  }, [emailConfirmed, errorCode, error])

  const shouldShow = verificationState !== null

  const [dismissed, setDismissed] = useState(false)
  const [hasUser, setHasUser] = useState<boolean | null>(null)

  // Resend form state (only shown when logged out)
  const [resendEmail, setResendEmail] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)
  const [resendSuccess, setResendSuccess] = useState(false)

  function clearVerificationParams() {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)

    url.searchParams.delete('email_confirmed')
    url.searchParams.delete('error')
    url.searchParams.delete('error_code')
    url.searchParams.delete('error_description')
    url.searchParams.delete('sb')

    void router.replace(url.pathname + url.search)
  }

  useEffect(() => {
    if (!shouldShow) return
    if (hasUser !== null) return

    let cancelled = false
    getSharedAuth()
      .then((auth) => {
        if (cancelled) return
        setHasUser(!!auth?.user)
      })
      .catch(() => {
        if (cancelled) return
        setHasUser(false)
      })

    return () => {
      cancelled = true
    }
  }, [shouldShow, hasUser])

  // If the user is actually signed in, clear the "needs login" hint from the URL.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (hasUser !== true) return
    const url = new URL(window.location.href)
    if (url.searchParams.get('verified_needs_login') !== '1') return
    url.searchParams.delete('verified_needs_login')
    window.history.replaceState(null, '', url.toString())
    router.refresh()
  }, [hasUser, router])

  useEffect(() => {
    if (!emailConfirmed || dismissed) return

    const t = window.setTimeout(() => {
      clearVerificationParams()
      setDismissed(true)
    }, 8000)

    return () => window.clearTimeout(t)
  }, [emailConfirmed, dismissed])

  if (!shouldShow || dismissed || !verificationState) return null

  // When already signed in, treat "expired link" as informational, not an error.
  const effectiveState: VerificationBannerState =
    hasUser === true && verificationState !== 'success' ? 'success' : verificationState

  const titleText =
    effectiveState === 'success'
      ? 'Email verified'
      : effectiveState === 'expired'
        ? 'Verification link expired'
        : 'Verification issue'

  const contentText =
    effectiveState === 'success'
      ? hasUser === true
        ? verificationState === 'expired'
          ? 'This link has expired, but you’re already signed in. You can continue onboarding below.'
          : 'Thanks for confirming your email. Let’s finish onboarding.'
        : verifiedNeedsLogin
          ? 'Your email is verified, but we could not automatically sign you in. Please sign in to continue onboarding.'
          : 'Thanks for confirming your email. Let’s finish onboarding.'
      : effectiveState === 'expired'
        ? errorDescription ||
          'Your verification link has expired. Please sign in and request a new confirmation email.'
        : errorDescription || 'We could not verify your email link. Please try again.'

  const loginHref = buildLoginHref({ returnTo: '/main' })

  async function handleResend(e: React.FormEvent) {
    e.preventDefault()
    if (!resendEmail.trim().includes('@')) {
      setResendError('Please enter a valid email address.')
      setResendSuccess(false)
      return
    }

    setResendLoading(true)
    setResendError(null)
    setResendSuccess(false)

    try {
      const res = await fetch('/api/auth/resend-signup-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail.trim() }),
      })

      const json = (await res.json().catch(() => ({}))) as { error?: string; success?: boolean }
      if (!res.ok || !json.success) {
        setResendError(json.error || 'Failed to send a new confirmation email.')
        return
      }

      setResendSuccess(true)
    } catch (err: any) {
      setResendError(err?.message || 'Failed to send a new confirmation email.')
    } finally {
      setResendLoading(false)
    }
  }

  const showLoggedOutActions = hasUser === false
  const showLoggedInActions = hasUser === true
  const authStateLoading = hasUser === null

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] p-3 pointer-events-none flex justify-center">
      <div
        className="w-full pointer-events-auto"
        style={{ maxWidth: 'var(--max-content-width)' }}
      >
        <Card
          variant="default"
          className={[
            verificationState === 'success' ? 'bg-green-50 border border-green-200' : '',
            verificationState === 'expired' ? 'bg-red-50 border border-red-200' : '',
            verificationState === 'error' ? 'bg-red-50 border border-red-200' : '',
          ].join(' ')}
        >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <Title as="h3" className="mb-1">
              {titleText}
            </Title>
            <Content as="p" className="mb-3">
              {contentText}
            </Content>

            {resendSuccess && (
              <UIText as="p" className="mb-2">
                If the email exists, we sent a new confirmation link. Please check your inbox.
              </UIText>
            )}

            {verificationState !== 'success' && showLoggedOutActions && (
              <form onSubmit={handleResend} className="space-y-2">
                <div>
                  <UIText as="label" className="block mb-1" htmlFor="resend-email">
                    Email address
                  </UIText>
                  <input
                    id="resend-email"
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="you@example.com"
                    autoComplete="email"
                    inputMode="email"
                  />
                </div>

                {resendError && (
                  <UIText as="p" className="mb-1">
                    {resendError}
                  </UIText>
                )}

                <div className="flex gap-2 flex-wrap">
                  <Button variant="primary" size="sm" type="submit" disabled={resendLoading}>
                    <UIText>{resendLoading ? 'Sending...' : 'Send new link'}</UIText>
                  </Button>

                  <Button variant="secondary" size="sm" asLink href={loginHref}>
                    <UIText>Log in</UIText>
                  </Button>
                </div>
              </form>
            )}

            {verificationState !== 'success' && showLoggedInActions && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    clearVerificationParams()
                    setDismissed(true)
                  }}
                >
                  <UIText>Continue</UIText>
                </Button>
              </div>
            )}

            {verificationState === 'success' && authStateLoading && (
              <div className="flex gap-2 flex-wrap">
                <UIText>Finishing sign-in…</UIText>
              </div>
            )}

            {verificationState === 'success' && showLoggedInActions && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    clearVerificationParams()
                    setDismissed(true)
                  }}
                >
                  <UIText>Continue</UIText>
                </Button>
              </div>
            )}

            {verificationState === 'success' && showLoggedOutActions && (
              <div className="flex gap-2 flex-wrap">
                <Button variant="primary" size="sm" asLink href={loginHref}>
                  <UIText>Log in to continue</UIText>
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              variant="text"
              size="sm"
              onClick={() => {
                clearVerificationParams()
                setDismissed(true)
              }}
            >
              <UIText>Dismiss</UIText>
            </Button>
          </div>
        </div>
        </Card>
      </div>
    </div>
  )
}

