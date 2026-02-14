import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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
          return allCookies
        },
        setAll(cookiesToSet) {
          try {
            const isProduction = process.env.NODE_ENV === 'production'
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
            const isSecure = isProduction || siteUrl.startsWith('https:')
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, {
                ...options,
                sameSite: (options?.sameSite as 'lax' | 'strict' | 'none') || 'lax',
                path: options?.path || '/',
                secure: options?.secure ?? isSecure,
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

/**
 * Create a Supabase client for anonymous/public operations
 * This client explicitly uses the anon key and doesn't require authentication
 * Use this for operations that need to work for unauthenticated users
 * 
 * Note: This mimics the client-side behavior where anonymous users can insert
 * into tables with RLS policies that allow anonymous access (WITH CHECK true)
 * 
 * IMPORTANT: When using the anon/publishable key, Supabase automatically uses the 'anon' role
 * which matches our RLS policy that allows 'anon' role to insert.
 */
export function createAnonymousClient() {
  // Use publishable key (recommended) with fallback to legacy anon key for backward compatibility
  const apiKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  if (!apiKey) {
    throw new Error('Supabase anon/publishable key is not configured. Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  // Use the standard Supabase client for anonymous operations
  // This bypasses cookie-based session management and works like client-side anonymous access
  // When using the anon key, Supabase automatically sets the role to 'anon' in the JWT
  // The client will automatically set the Authorization header with the anon key as Bearer token
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, apiKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      // Don't try to get user session - we want anonymous access
      storage: undefined,
    },
  })
}

