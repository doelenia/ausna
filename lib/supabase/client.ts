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

  // createBrowserClient from @supabase/ssr automatically handles cookies
  // It sets cookies with proper SameSite=Lax which allows them to be sent with server actions
  const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, apiKey)

  if (typeof window !== 'undefined') {
    browserClient = client
    browserClientId = clientId
  }
  
  // Safari-specific handling: Ensure cookies are accessible
  if (isSafari() && typeof window !== 'undefined') {
    // Log cookie availability for debugging
    const cookies = document.cookie.split(';').map(c => c.trim())
    const authCookies = cookies.filter(c => 
      c.includes('auth-token') || 
      c.includes('supabase') ||
      c.startsWith('sb-')
    )
    console.log('[Safari] Auth cookies found:', authCookies.length, 'Total cookies:', cookies.length)
    
    // Check if cookies are actually accessible
    if (authCookies.length === 0 && cookies.length > 0) {
      console.warn('[Safari] Auth cookies may be blocked by ITP. Available cookies:', cookies.map(c => c.split('=')[0]).join(', '))
    }
  }
  
  return client
}

