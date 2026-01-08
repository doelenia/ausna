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
 */
export function getSiteUrl(): string {
  // In client-side code, check environment variable first
  if (typeof window !== 'undefined') {
    // NEXT_PUBLIC_ variables are available on the client
    const envUrl = process.env.NEXT_PUBLIC_SITE_URL
    if (envUrl) {
      return envUrl
    }
    // Fallback to current origin (for development)
    return window.location.origin
  }
  
  // Server-side code (should use process.env.NEXT_PUBLIC_SITE_URL directly)
  // This function is primarily for client-side use
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
}

/**
 * Get the callback URL for authentication redirects
 */
export function getAuthCallbackUrl(): string {
  return `${getSiteUrl()}/auth/callback`
}

