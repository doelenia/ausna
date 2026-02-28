import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { lookupCityLocationFromIp } from '@/lib/geoip'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Use publishable key (recommended) with fallback to legacy anon key for backward compatibility
  const apiKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const isSecure = request.nextUrl.protocol === 'https:'
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              path: options?.path ?? '/',
              sameSite: (options?.sameSite as 'lax' | 'strict' | 'none') ?? 'lax',
              secure: options?.secure ?? isSecure,
            })
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // Check if this is a public route that doesn't need auth
  // This allows us to skip getUser() for static assets and public pages
  const pathname = request.nextUrl.pathname
  const isStaticAsset = pathname.startsWith('/_next/') || 
                        pathname.startsWith('/api/') ||
                        /\.(svg|png|jpg|jpeg|gif|webp|ico)$/i.test(pathname)
  
  // For static assets, skip auth check entirely
  if (isStaticAsset) {
    return supabaseResponse
  }

  // IMPORTANT: Call getUser() immediately after creating the client
  // This will automatically refresh expired sessions and update cookies
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  // Redirect root path:
  // - logged-out users -> email-first login page
  // - logged-in users  -> main feed
  if (request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = user ? '/main' : '/login'
    // Create redirect response and copy all cookies from supabaseResponse
    const redirectResponse = NextResponse.redirect(url)
    // Copy all cookies that were set during session refresh
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value)
    })
    return redirectResponse
  }

  // Admin routes - require admin access
  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin')
  
  if (isAdminRoute) {
    const ADMIN_EMAILS = ['allen@doelenia.com', 'ceciliayiyan@gmail.com']
    
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      const redirectResponse = NextResponse.redirect(url)
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value)
      })
      return redirectResponse
    }

    // Check if user is admin
    const isAdmin = user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())
    const metadata = user.user_metadata || {}
    const hasAdminFlag = metadata.is_admin === true

    if (!isAdmin && !hasAdminFlag) {
      // Not admin, redirect to main
      const url = request.nextUrl.clone()
      url.pathname = '/main'
      const redirectResponse = NextResponse.redirect(url)
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value)
      })
      return redirectResponse
    }
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

  // Check if user is blocked (if authenticated)
  if (user) {
    const metadata = user.user_metadata || {}
    const isBlocked = metadata.is_blocked === true

    // Blocked users can only access login/signup pages
    if (isBlocked && !isPublicRoute && !isAdminRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('blocked', 'true')
      const redirectResponse = NextResponse.redirect(url)
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value)
      })
      return redirectResponse
    }
  }

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

  // For authenticated users, opportunistically update their human-portfolio
  // coarse city location (derived from IP) at most once per day. This runs
  // only for primary app pages, not static assets (already returned above).
  if (user) {
    try {
      await maybeUpdateHumanCityLocation(user.id, request, supabase)
    } catch (e) {
      // Never block the request on location update failures.
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to update human city location from IP:', e)
      }
    }
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

function getClientIp(request: NextRequest): string | null {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  if ((request as any).ip && typeof (request as any).ip === 'string') {
    return (request as any).ip as string
  }
  return null
}

async function maybeUpdateHumanCityLocation(
  userId: string,
  request: NextRequest,
  supabase: any
) {
  // Only run on primary navigational GET requests to avoid doing work on every API hit.
  if (request.method !== 'GET') return
  const pathname = request.nextUrl.pathname
  // #region agent log
  console.log('[geoip] maybeUpdateHumanCityLocation entry', {
    pathname,
    method: request.method,
  })
  // #endregion
  const isPrimaryPage =
    pathname === '/main' ||
    pathname === '/' ||
    pathname.startsWith('/portfolio') ||
    pathname.startsWith('/notes')
  if (!isPrimaryPage) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fab1a5e4-0675-4ead-a1dd-862094e22f59', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '63060f',
      },
      body: JSON.stringify({
        sessionId: '63060f',
        runId: 'pre-fix',
        hypothesisId: 'H4',
        location: 'lib/supabase/middleware.ts:221',
        message: 'maybeUpdateHumanCityLocation skipped for non-primary page',
        data: {
          pathname,
          method: request.method,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    return
  }

  const ip = getClientIp(request)
  if (!ip) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fab1a5e4-0675-4ead-a1dd-862094e22f59', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '63060f',
      },
      body: JSON.stringify({
        sessionId: '63060f',
        runId: 'pre-fix',
        hypothesisId: 'H2',
        location: 'lib/supabase/middleware.ts:224',
        message: 'maybeUpdateHumanCityLocation could not determine client IP',
        data: {
          hasXff: !!request.headers.get('x-forwarded-for'),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    return
  }

  // Fetch the user's human portfolio (if any)
  const { data: portfolio, error } = await supabase
    .from('portfolios')
    .select('id, type, metadata')
    .eq('user_id', userId)
    .eq('type', 'human')
    .maybeSingle()

  if (error || !portfolio) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fab1a5e4-0675-4ead-a1dd-862094e22f59', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '63060f',
      },
      body: JSON.stringify({
        sessionId: '63060f',
        runId: 'pre-fix',
        hypothesisId: 'H3',
        location: 'lib/supabase/middleware.ts:235',
        message: 'maybeUpdateHumanCityLocation could not load human portfolio',
        data: {
          hasError: !!error,
          errorCode: error?.code ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    return
  }

  const metadata = (portfolio.metadata as any) || {}
  const properties = (metadata.properties || {}) as Record<string, any>

  // Opt-out flag: when explicitly set to false, we never update or show the location.
  const autoEnabled = properties.auto_city_location_enabled !== false
  if (!autoEnabled) return

  const lastUpdatedRaw = properties.auto_city_location_last_updated_at as
    | string
    | undefined
  if (lastUpdatedRaw) {
    const last = new Date(lastUpdatedRaw)
    if (!Number.isNaN(last.getTime())) {
      const now = new Date()
      const diffMs = now.getTime() - last.getTime()
      const oneDayMs = 24 * 60 * 60 * 1000
      if (diffMs < oneDayMs) {
        // Updated less than a day ago – skip.
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/fab1a5e4-0675-4ead-a1dd-862094e22f59', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': '63060f',
          },
          body: JSON.stringify({
            sessionId: '63060f',
            runId: 'pre-fix',
            hypothesisId: 'H3',
            location: 'lib/supabase/middleware.ts:255',
            message: 'maybeUpdateHumanCityLocation skipped due to recent update',
            data: {
              lastUpdatedAt: lastUpdatedRaw,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
        return
      }
    }
  }

  const location = await lookupCityLocationFromIp(ip)
  // #region agent log
  console.log('[geoip] lookupCityLocationFromIp result inside middleware', {
    hasLocation: !!location,
  })
  // #endregion
  if (!location) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fab1a5e4-0675-4ead-a1dd-862094e22f59', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '63060f',
      },
      body: JSON.stringify({
        sessionId: '63060f',
        runId: 'pre-fix',
        hypothesisId: 'H1',
        location: 'lib/supabase/middleware.ts:262',
        message: 'lookupCityLocationFromIp returned null',
        data: {},
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    return
  }

  const nextProperties: Record<string, any> = {
    ...properties,
    auto_city_location: location,
    auto_city_location_enabled: true,
    auto_city_location_last_updated_at: new Date().toISOString(),
  }

  const updatedMetadata = {
    ...metadata,
    properties: nextProperties,
  }

  const { error: updateError } = await supabase
    .from('portfolios')
    .update({ metadata: updatedMetadata })
    .eq('id', portfolio.id)
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/fab1a5e4-0675-4ead-a1dd-862094e22f59', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '63060f',
    },
    body: JSON.stringify({
      sessionId: '63060f',
      runId: 'pre-fix',
      hypothesisId: 'H3',
      location: 'lib/supabase/middleware.ts:280',
      message: 'maybeUpdateHumanCityLocation attempted to update portfolio metadata',
      data: {
        hasUpdateError: !!updateError,
        updateErrorCode: updateError?.code ?? null,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
}


