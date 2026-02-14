import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

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
  const origin = requestUrl.origin
  const redirectTo = `${origin}/main`

  const redirectResponse = NextResponse.redirect(redirectTo)

  if (!code) {
    return redirectResponse
  }

  const apiKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey,
    {
      cookies: {
        getAll() {
          const header = request.headers.get('cookie')
          if (!header) return []
          return header.split(';').map((c) => {
            const eq = c.trim().indexOf('=')
            if (eq === -1) return { name: c.trim(), value: '' }
            return { name: c.trim().slice(0, eq), value: c.trim().slice(eq + 1) }
          })
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            redirectResponse.cookies.set(name, value, {
              path: options?.path ?? '/',
              maxAge: options?.maxAge ?? 400 * 24 * 60 * 60,
              sameSite: (options?.sameSite as 'lax' | 'strict' | 'none') ?? 'lax',
              secure: options?.secure ?? requestUrl.protocol === 'https:',
              httpOnly: options?.httpOnly ?? false,
            })
          )
        },
      },
    }
  )

  await supabase.auth.exchangeCodeForSession(code)
  return redirectResponse
}

