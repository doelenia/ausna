import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Use publishable key (recommended) with fallback to legacy anon key for backward compatibility
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
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: Call getUser() immediately after creating the client
  // This will automatically refresh expired sessions and update cookies
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  // Redirect root path to /main
  if (request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/main'
    // Create redirect response and copy all cookies from supabaseResponse
    const redirectResponse = NextResponse.redirect(url)
    // Copy all cookies that were set during session refresh
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value)
    })
    return redirectResponse
  }

  // Check if route requires authentication
  // Protected routes: action pages (create, edit, delete) and account pages
  // These routes require authentication and will redirect to login if not authenticated
  const requiresAuthRoute =
    request.nextUrl.pathname.startsWith('/account') ||
    request.nextUrl.pathname.startsWith('/notes/create') ||
    request.nextUrl.pathname.startsWith('/portfolio/create')

  // Public routes: viewing pages that don't require authentication
  // These include login, signup, main, auth callback, and viewing pages
  const isPublicRoute =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup') ||
    request.nextUrl.pathname.startsWith('/main') ||
    request.nextUrl.pathname.startsWith('/auth') ||
    // Portfolio viewing pages are public (but /portfolio/create requires auth)
    (request.nextUrl.pathname.startsWith('/portfolio') && !request.nextUrl.pathname.startsWith('/portfolio/create')) ||
    // Note viewing pages are public (but /notes/create requires auth)
    (request.nextUrl.pathname.startsWith('/notes') && !request.nextUrl.pathname.startsWith('/notes/create'))

  // Only redirect to login if user is not authenticated and route requires auth
  // Public routes can be viewed without authentication
  if (!user && requiresAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Create redirect response and copy all cookies from supabaseResponse
    // This ensures session refresh cookies are preserved
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value)
    })
    return redirectResponse
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely.

  return supabaseResponse
}

