import { createBrowserClient } from '@supabase/ssr'

// Detect Safari browser
function isSafari(): boolean {
  if (typeof window === 'undefined') return false
  const userAgent = window.navigator.userAgent.toLowerCase()
  return /safari/.test(userAgent) && !/chrome/.test(userAgent) && !/chromium/.test(userAgent)
}

let browserClient: ReturnType<typeof createBrowserClient> | null = null
let browserClientId: string | null = null

export function createClient() {
  const clientId = Math.random().toString(36).substring(7)

  // Reuse a singleton client in the browser to avoid multiple competing Supabase clients
  if (typeof window !== 'undefined' && browserClient) {
    return browserClient
  }

  // Use publishable key (recommended) with fallback to legacy anon key for backward compatibility
  const apiKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Explicit cookie options so Safari ITP treats them as first-party and allows them
  const isSecure = typeof window !== 'undefined' && window.location?.protocol === 'https:'
  const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, apiKey, {
    cookieOptions: {
      path: '/',
      sameSite: 'lax',
      secure: isSecure,
      maxAge: 400 * 24 * 60 * 60,
    },
  })

  if (typeof window !== 'undefined') {
    browserClient = client
    browserClientId = clientId
  }
  
  // Safari: detect when auth cookies are missing (often due to ITP) so we can show a hint
  if (isSafari() && typeof window !== 'undefined') {
    const cookies = document.cookie.split(';').map(c => c.trim())
    const authCookies = cookies.filter(c =>
      c.includes('auth-token') ||
      c.includes('supabase') ||
      c.startsWith('sb-')
    )
    if (authCookies.length === 0) {
      try {
        if (!sessionStorage.getItem('safari-auth-cookie-hint-shown')) {
          sessionStorage.setItem('safari-auth-cookie-hint-shown', '1')
          window.dispatchEvent(new CustomEvent('safari-auth-cookies-blocked'))
        }
      } catch {
        /* ignore */
      }
    }
  }
  
  return client
}

