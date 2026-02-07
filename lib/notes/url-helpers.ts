import { UrlReference } from '@/types/note'

/**
 * Extract hostname from URL
 * This is a client-safe version that works in both server and client contexts
 */
export function getHostnameFromUrl(url: string): string {
  try {
    // Normalize URL - add protocol if missing
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`
    const urlObj = new URL(normalizedUrl)
    return urlObj.hostname.replace('www.', '')
  } catch {
    // If URL parsing fails, try to extract hostname manually
    const cleaned = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
    return cleaned || url
  }
}

/**
 * Get favicon URL for a hostname using Google's favicon service
 * This is a reliable fallback that works in both server and client contexts
 */
export function getFaviconUrl(hostname: string): string {
  return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`
}

/**
 * Get display host name and icon for a URL reference
 * Always returns both hostName and hostIcon, with fallbacks if missing
 */
export function getUrlDisplayInfo(urlRef: UrlReference): { hostName: string; hostIcon: string } {
  // Extract hostname from URL if hostName is missing
  const hostName = urlRef.hostName || getHostnameFromUrl(urlRef.url)
  
  // Get favicon URL if hostIcon is missing
  const hostIcon = urlRef.hostIcon || getFaviconUrl(hostName)
  
  return { hostName, hostIcon }
}




