/**
 * Get the site URL for redirects and email confirmations
 * 
 * This function prioritizes NEXT_PUBLIC_SITE_URL environment variable,
 * which should be set to your production domain in production environments.
 * Falls back to window.location.origin for client-side code.
 * 
 * IMPORTANT: Make sure to set NEXT_PUBLIC_SITE_URL in your environment variables
 * for production deployments. Also configure the Site URL in Supabase Dashboard:
 * Authentication > URL Configuration > Site URL
 * 
 * CRITICAL FOR PRODUCTION: 
 * - Set NEXT_PUBLIC_SITE_URL in your deployment environment (e.g., Vercel)
 * - Ensure the Site URL in Supabase Dashboard matches your production domain
 * - Add your production reset-password URL to Supabase allowed redirect URLs
 */
export function getSiteUrl(): string {
  // In client-side code, check environment variable first
  if (typeof window !== 'undefined') {
    // NEXT_PUBLIC_ variables are available on the client (embedded at build time)
    const envUrl = process.env.NEXT_PUBLIC_SITE_URL
    
    if (envUrl) {
      // Ensure the URL doesn't have a trailing slash
      return envUrl.replace(/\/$/, '')
    }
    
    // Fallback to current origin
    // WARNING: In production, this should NOT be used - NEXT_PUBLIC_SITE_URL must be set
    const currentOrigin = window.location.origin
    
    // Warn in production if we're falling back to window.location.origin
    if (process.env.NODE_ENV === 'production' && !envUrl) {
      console.warn(
        '[getSiteUrl] WARNING: NEXT_PUBLIC_SITE_URL is not set in production. ' +
        'Using window.location.origin as fallback. This may cause issues with email redirects. ' +
        'Please set NEXT_PUBLIC_SITE_URL in your deployment environment variables.'
      )
    }
    
    return currentOrigin
  }
  
  // Server-side code (should use process.env.NEXT_PUBLIC_SITE_URL directly)
  // This function is primarily for client-side use
  const serverUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return serverUrl.replace(/\/$/, '')
}

/**
 * Get the callback URL for authentication redirects
 */
export function getAuthCallbackUrl(): string {
  return `${getSiteUrl()}/auth/callback`
}

