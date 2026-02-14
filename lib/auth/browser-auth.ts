/**
 * Single shared auth for the entire client app.
 * Only one getSession/getUser runs at a time so Safari (and others) don't
 * serialize 15+ concurrent auth calls and all time out.
 *
 * Use getSharedAuth() from TopNav, NoteCard, PortfolioView, etc. instead of
 * calling supabase.auth.getUser() directly.
 *
 * If auth is stuck (e.g. corrupted cookie/storage), a total timeout triggers
 * clearStuckAuthStorage() and "Session expired" so the user can sign in again.
 */

import { createClient } from '@/lib/supabase/client'

export type SharedAuthResult = { user: any } | null

/** Event dispatched when we gave up on stuck auth and cleared storage; UI should show "Session expired. Please sign in again." */
export const AUTH_SESSION_EXPIRED_EVENT = 'auth-session-expired'

// Must be longer than getUser (10s) + getSession (20s) so a slow-but-successful auth after login can complete
const TOTAL_AUTH_TIMEOUT_MS = 40000 // 40s

let cachedAuth: SharedAuthResult | undefined = undefined
let inFlightPromise: Promise<SharedAuthResult> | null = null
let authStateUnsubscribe: (() => void) | null = null

/** Parsed session-like object we can read from the auth cookie */
type CookieSession = { access_token?: string; refresh_token?: string; user?: any }

function getAuthCookieRaw(): string | null {
  if (typeof document === 'undefined') return null
  try {
    const cookies = document.cookie.split(';').map((c) => c.trim())
    const pairs = cookies.map((c) => {
      const eq = c.indexOf('=')
      const name = c.slice(0, eq).trim()
      let val = c.slice(eq + 1).trim()
      try {
        val = decodeURIComponent(val)
      } catch {
        /* keep raw */
      }
      return [name, val]
    }) as [string, string][]
    const authPairs = pairs.filter(([name]) => name.startsWith('sb-') && name.includes('auth-token'))
    if (authPairs.length === 0) return null
    const byName = new Map(authPairs)
    const baseKey = authPairs.find(([name]) => !/\.\d+$/.test(name))?.[0] ?? authPairs[0][0].replace(/\.\d+$/, '')
    let raw = byName.get(baseKey)
    if (raw == null) {
      const chunks: string[] = []
      for (let i = 0; ; i++) {
        const v = byName.get(`${baseKey}.${i}`)
        if (v == null) break
        chunks.push(v)
      }
      raw = chunks.length > 0 ? chunks.join('') : ''
    }
    return raw || null
  } catch {
    return null
  }
}

function getSessionFromAuthCookie(): CookieSession | null {
  const raw = getAuthCookieRaw()
  if (!raw) return null
  try {
    let decoded = raw
    if (raw.startsWith('base64-')) {
      try {
        const base64 = raw.slice(7).replace(/-/g, '+').replace(/_/g, '/')
        decoded = decodeURIComponent(escape(atob(base64)))
      } catch {
        return null
      }
    }
    const parsed = JSON.parse(decoded) as any
    if (parsed?.access_token) return parsed
    return null
  } catch {
    return null
  }
}

function getUserIdFromAuthCookie(): { id: string } | null {
  const parsed = getSessionFromAuthCookie()
  if (!parsed) return null
  if (parsed?.user?.id) return { id: parsed.user.id }
  if (parsed?.access_token) {
    try {
      const payload = parsed.access_token.split('.')[1]
      if (payload) {
        const payloadJson = JSON.parse(
          decodeURIComponent(escape(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))))
        )
        if (payloadJson?.sub) return { id: payloadJson.sub }
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

/** Returns cookie names that store Supabase auth so we can clear them when stuck. */
function getAuthCookieNames(): string[] {
  if (typeof document === 'undefined') return []
  const cookies = document.cookie.split(';').map((c) => c.trim())
  return cookies
    .map((c) => c.slice(0, c.indexOf('=')).trim())
    .filter((name) => name.startsWith('sb-') && name.includes('auth-token'))
}

/**
 * Clears auth cookies and any Supabase auth localStorage so the next load
 * starts fresh. Call when auth is stuck (total timeout) so the user can sign in again.
 */
export function clearStuckAuthStorage(): void {
  if (typeof document === 'undefined') return
  const expires = 'Thu, 01 Jan 1970 00:00:00 GMT'
  const path = '; path=/'
  for (const name of getAuthCookieNames()) {
    document.cookie = `${name}=${path}; expires=${expires}`
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.includes('supabase') && key.includes('auth'))) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k))
    }
  } catch {
    /* ignore */
  }
  cachedAuth = undefined
  inFlightPromise = null
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT))
  }
}

function runSingleAuthFlow(): Promise<SharedAuthResult> {
  const supabase = createClient()

  const promise = (async (): Promise<SharedAuthResult> => {
    try {
      const getUserPromise = supabase.auth.getUser()
      const timeout10 = new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('getUser timeout after 10s')), 10000)
      )
      const result = await Promise.race([getUserPromise, timeout10]) as any
      const user = result?.data?.user ?? null
      return user ? { user } : null
    } catch (e: any) {
      if (e?.message !== 'getUser timeout after 10s') throw e
    }

    try {
      const getSessionPromise = supabase.auth.getSession()
      const timeout20 = new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('getSession timeout after 20s')), 20000)
      )
      const { data: { session } } = await Promise.race([getSessionPromise, timeout20]) as any
      const user = session?.user ?? null
      return user ? { user } : null
    } catch (_sessionErr) {
      const cookieSession = getSessionFromAuthCookie()
      const cookieUser = getUserIdFromAuthCookie()

      if (cookieSession?.access_token && cookieSession?.refresh_token) {
        try {
          const { data: { session }, error } = await supabase.auth.setSession({
            access_token: cookieSession.access_token,
            refresh_token: cookieSession.refresh_token,
          })
          if (!error && session?.user) {
            return { user: session.user }
          }
        } catch {
          /* setSession failed, fall through to minimal user */
        }
      }

      if (cookieUser) {
        const result: SharedAuthResult = { user: cookieUser }
        cachedAuth = result
        inFlightPromise = null

        const isMinimal = Object.keys(cookieUser).length === 1 && 'id' in cookieUser
        if (isMinimal && typeof window !== 'undefined') {
          const recoveryTimeout = 45000
          const sessionPromise = supabase.auth.getSession()
          const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('recovery timeout')), recoveryTimeout))
          Promise.race([sessionPromise, timeout])
            .then((res: any) => {
              const session = res?.data?.session
              if (session?.user) {
                cachedAuth = { user: session.user }
                window.dispatchEvent(new CustomEvent('supabase-session-recovered'))
              }
            })
            .catch(() => {})
        }
        return result
      }
      return null
    }
  })()

  promise.finally(() => {
    inFlightPromise = null
  })

  return promise
}

function ensureAuthStateListener() {
  if (authStateUnsubscribe) return
  const supabase = createClient()
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
    if (event === 'SIGNED_OUT') {
      cachedAuth = null
      inFlightPromise = null
      return
    }
    if (session?.user) {
      cachedAuth = { user: session.user }
    }
  })
  authStateUnsubscribe = () => subscription.unsubscribe()
}

/**
 * Returns a promise that resolves with { user } or null. Only one auth flow
 * runs at a time for the whole app; all callers share the same promise/cache.
 * Call this instead of supabase.auth.getUser() in client components.
 *
 * If the flow doesn't complete within TOTAL_AUTH_TIMEOUT_MS, we clear auth
 * storage and reject so the UI can show "Session expired. Please sign in again."
 */
export function getSharedAuth(): Promise<SharedAuthResult> {
  if (typeof window === 'undefined') {
    return Promise.resolve(null)
  }
  ensureAuthStateListener()
  if (cachedAuth !== undefined) {
    return Promise.resolve(cachedAuth)
  }
  if (inFlightPromise) {
    return inFlightPromise
  }
  let totalTimeoutId: ReturnType<typeof setTimeout> | null = null
  const totalTimeoutPromise = new Promise<never>((_, reject) => {
    totalTimeoutId = setTimeout(() => {
      totalTimeoutId = null
      clearStuckAuthStorage()
      reject(new Error('Auth total timeout'))
    }, TOTAL_AUTH_TIMEOUT_MS)
  })
  const flowPromise = runSingleAuthFlow()
  inFlightPromise = Promise.race([flowPromise, totalTimeoutPromise])
  inFlightPromise
    .then((result) => {
      if (totalTimeoutId != null) {
        clearTimeout(totalTimeoutId)
        totalTimeoutId = null
      }
      cachedAuth = result ?? null
    })
    .catch(() => {
      if (totalTimeoutId != null) {
        clearTimeout(totalTimeoutId)
        totalTimeoutId = null
      }
      // Rejection (e.g. total timeout) is handled by callers; avoid unhandled rejection
    })
  return inFlightPromise
}

/**
 * Call after sign-out if you need to force the next getSharedAuth() to run a fresh auth flow.
 */
export function clearSharedAuthCache(): void {
  cachedAuth = undefined
  inFlightPromise = null
}
