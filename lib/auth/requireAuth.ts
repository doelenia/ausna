import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export async function requireAuth() {
  // Debug: Check what cookies are available
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  const authCookies = allCookies.filter(cookie => 
    cookie.name.includes('auth-token') || 
    cookie.name.includes('supabase') ||
    cookie.name.startsWith('sb-')
  )
  
  // Log all cookies for debugging
  console.log('All cookies in requireAuth:', allCookies.map(c => `${c.name}=${c.value.substring(0, 20)}...`).join(', ') || 'NONE')
  
  if (authCookies.length === 0) {
    console.error('No auth cookies found in requireAuth. Available cookies:', 
      allCookies.map(c => c.name).join(', ') || 'NONE')
  }
  
  const supabase = await createClient()
  
  // CRITICAL: Server actions bypass middleware, so we must handle session refresh here
  // Try getSession first - this reads from cookies directly
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  
  // If we have a session, use it to get the user
  // Otherwise, try getUser which might refresh the session
  let user = null
  let userError = null
  
  if (session?.user) {
    // We have a valid session, use the user from it
    user = session.user
  } else {
    // No session, try getUser which will attempt to refresh
    const result = await supabase.auth.getUser()
    user = result.data.user
    userError = result.error
  }

  // If there's an error or no user after refresh attempt, redirect to login
  if (userError || !user) {
    // Log for debugging (remove in production if needed)
    console.error('Authentication failed in requireAuth:', {
      userError: userError?.message,
      errorCode: userError?.status,
      hasUser: !!user,
      hasSession: !!session,
      sessionError: sessionError?.message,
      authCookieCount: authCookies.length,
      authCookieNames: authCookies.map(c => c.name).join(', '),
      allCookieNames: allCookies.map(c => c.name).join(', ') || 'NONE',
    })
    redirect('/login')
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

