import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { buildLoginHref, getReturnToFromReferer } from '@/lib/auth/login-redirect'

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>

export type RequireAuthApiSuccess = {
  authorized: true
  user: User
  supabase: ServerSupabaseClient
}

export type RequireAuthApiFailure = {
  authorized: false
  response: NextResponse
}

export type RequireAuthApiResult = RequireAuthApiSuccess | RequireAuthApiFailure

/**
 * For Route Handlers: return 401 JSON instead of redirect().
 * `redirect()` throws NEXT_REDIRECT; catching it in try/catch turns auth failure into a 500.
 */
export async function requireAuthApi(): Promise<RequireAuthApiResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    }
  }

  return { authorized: true, user, supabase }
}

export async function requireAuth(returnTo?: string | null) {
  const isDev = process.env.NODE_ENV === 'development'
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  const authCookies = allCookies.filter(cookie => 
    cookie.name.includes('auth-token') || 
    cookie.name.includes('supabase') ||
    cookie.name.startsWith('sb-')
  )
  
  if (isDev) {
    console.log('All cookies in requireAuth:', allCookies.map(c => `${c.name}=${c.value.substring(0, 20)}...`).join(', ') || 'NONE')
    if (authCookies.length === 0) {
      console.error('No auth cookies found in requireAuth. Available cookies:', 
        allCookies.map(c => c.name).join(', ') || 'NONE')
    }
  }
  
  const supabase = await createClient()
  
  // CRITICAL: Use getUser() instead of getSession() for security
  // getUser() authenticates with the server, while getSession() reads from storage (may not be authentic)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  // If there's an error or no user, redirect to login
  if (userError || !user) {
    if (isDev) {
      console.error('Authentication failed in requireAuth:', {
        userError: userError?.message,
        errorCode: userError?.status,
        hasUser: !!user,
        authCookieCount: authCookies.length,
        authCookieNames: authCookies.map(c => c.name).join(', '),
        allCookieNames: allCookies.map(c => c.name).join(', ') || 'NONE',
      })
    }
    const referer = (await headers()).get('referer')
    const effectiveReturnTo = returnTo ?? getReturnToFromReferer(referer)
    redirect(buildLoginHref({ returnTo: effectiveReturnTo }))
  }

  return { user, supabase }
}

export async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}

