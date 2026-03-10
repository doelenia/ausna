import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { buildLoginHref, getReturnToFromReferer } from '@/lib/auth/login-redirect'

const ADMIN_EMAILS = ['allen@doelenia.com', 'ceciliayiyan@gmail.com']

/**
 * Require admin access - checks if user is authenticated and is an admin
 * Redirects to login if not authenticated or not admin
 */
export async function requireAdmin() {
  const supabase = await createClient()
  
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    const referer = (await headers()).get('referer')
    redirect(buildLoginHref({ returnTo: getReturnToFromReferer(referer) }))
  }

  // Check if user email is in admin list
  const isAdmin = user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())

  if (!isAdmin) {
    // Also check metadata flag as backup
    const metadata = user.user_metadata || {}
    const hasAdminFlag = metadata.is_admin === true

    if (!hasAdminFlag) {
      const referer = (await headers()).get('referer')
      redirect(buildLoginHref({ returnTo: getReturnToFromReferer(referer) }))
    }
  }

  return { user, supabase }
}

/**
 * Check if current user is admin (non-redirecting version)
 * Returns null if not admin, user object if admin
 */
export async function checkAdmin() {
  try {
    const supabase = await createClient()
    
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return null
    }

    // Check email whitelist
    const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase())
    
    if (isAdmin) {
      return user
    }

    // Check metadata flag
    const metadata = user.user_metadata || {}
    if (metadata.is_admin === true) {
      return user
    }

    return null
  } catch {
    return null
  }
}



