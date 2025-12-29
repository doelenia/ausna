import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  // Use publishable key (recommended) with fallback to legacy anon key for backward compatibility
  const apiKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey,
    {
      cookies: {
        getAll() {
          // Return all cookies - server actions should have access to all cookies
          // The cookies() API from next/headers automatically handles URL decoding
          const allCookies = cookieStore.getAll()
          
          // Debug: Check if auth cookie exists and its format
          const authCookie = allCookies.find(c => c.name.includes('auth-token'))
          if (authCookie) {
            console.log('Auth cookie found:', {
              name: authCookie.name,
              valueLength: authCookie.value.length,
              valueStart: authCookie.value.substring(0, 50),
            })
          }
          
          return allCookies
        },
        setAll(cookiesToSet) {
          try {
            // In server actions, we can set cookies
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, {
                ...options,
                // Ensure SameSite is set to 'lax' for server actions to work
                sameSite: options?.sameSite || 'lax',
                // Ensure path is set
                path: options?.path || '/',
              })
            })
          } catch (error) {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions. But log it for debugging.
            console.warn('Failed to set cookies in server action:', error)
          }
        },
      },
    }
  )
}

