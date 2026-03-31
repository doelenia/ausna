import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { sanitizeReturnTo } from '@/lib/auth/login-redirect'

function getEffectiveOrigin(requestUrl: URL, request: Request): string {
  // Prefer explicit site URL when configured (helps dev where server may run on 0.0.0.0).
  const env = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '')
  if (env) return env

  const h = (name: string) => request.headers.get(name)
  const xfProto = h('x-forwarded-proto')?.split(',')[0]?.trim()
  const xfHost = h('x-forwarded-host')?.split(',')[0]?.trim()
  const host = (xfHost || h('host') || requestUrl.host).trim()
  const proto = (xfProto || requestUrl.protocol.replace(':', '') || 'http').trim()
  return `${proto}://${host}`
}

/**
 * Auth callback: session cookies are set on the redirect response explicitly
 * so Safari ITP receives them as first-party (same response as the redirect).
 *
 * For Safari compatibility, ensure in Supabase Dashboard → Auth → URL Configuration:
 * - Site URL matches your app origin exactly (e.g. https://www.ausna.co, including www)
 * - Redirect URLs include that same origin (e.g. https://www.ausna.co/auth/callback)
 * So the OAuth redirect lands on the same origin and cookies are first-party.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = getEffectiveOrigin(requestUrl, request)
  const returnTo = sanitizeReturnTo(requestUrl.searchParams.get('returnTo'))
  const redirectTo = `${origin}${returnTo}`
  const emailConfirmation = requestUrl.searchParams.get('emailConfirmation') === '1'
  const showEmailConfirmed = emailConfirmation

  if (!code) {
    const finalUrl = new URL(redirectTo)
    if (showEmailConfirmed) finalUrl.searchParams.set('email_confirmed', '1')
    return NextResponse.redirect(finalUrl.toString())
  }

  // Server-side exchange does not work reliably for email-confirm PKCE because the verifier lives in browser storage.
  // Forward `code` to the app page so the client can exchange it and establish a session.
  const next = new URL(redirectTo)
  next.searchParams.set('code', code)
  if (showEmailConfirmed) next.searchParams.set('emailConfirmation', '1')

  return NextResponse.redirect(next.toString())
}

