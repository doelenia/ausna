import type { ActivityLocationValue } from './location'

/**
 * Look up a coarse city-level location from an IP address.
 *
 * This is intentionally conservative:
 * - Returns at most city/region/country.
 * - Returns null if the IP looks private/loopback or if the service is misconfigured.
 *
 * The concrete API is configured via environment variable GEOIP_API_URL and (optionally)
 * GEOIP_API_KEY. The endpoint is expected to return JSON with at least city/region/country
 * style fields; we map several common field names.
 */
export async function lookupCityLocationFromIp(
  ip: string | null
): Promise<ActivityLocationValue | null> {
  if (!ip) return null

  // Skip obvious local/private IPs
  const lower = ip.toLowerCase()
  if (
    lower === '::1' ||
    lower === '127.0.0.1' ||
    lower.startsWith('10.') ||
    lower.startsWith('192.168.') ||
    lower.startsWith('172.16.') ||
    lower.startsWith('172.17.') ||
    lower.startsWith('172.18.') ||
    lower.startsWith('172.19.') ||
    lower.startsWith('172.20.') ||
    lower.startsWith('172.21.') ||
    lower.startsWith('172.22.') ||
    lower.startsWith('172.23.') ||
    lower.startsWith('172.24.') ||
    lower.startsWith('172.25.') ||
    lower.startsWith('172.26.') ||
    lower.startsWith('172.27.') ||
    lower.startsWith('172.28.') ||
    lower.startsWith('172.29.') ||
    lower.startsWith('172.30.') ||
    lower.startsWith('172.31.')
  ) {
    return null
  }

  const baseUrl = process.env.GEOIP_API_URL
  if (!baseUrl) {
    // GeoIP not configured
    return null
  }

  const url = `${baseUrl.replace(/\/$/, '')}?ip=${encodeURIComponent(ip)}`

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    }
    if (process.env.GEOIP_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.GEOIP_API_KEY}`
    }

    const res = await fetch(url, { headers, cache: 'no-store' })
    if (!res.ok) {
      return null
    }

    const data: any = await res.json().catch(() => null)
    if (!data) return null

    const city =
      (data.city ||
        data.city_name ||
        data.town ||
        data.locality ||
        '') as string
    const region =
      (data.region ||
        data.region_name ||
        data.state ||
        data.province ||
        '') as string
    const country =
      (data.country ||
        data.country_name ||
        data.countryName ||
        '') as string
    const countryCode =
      (data.country_code ||
        data.countryCode ||
        data.country_iso ||
        '') as string
    const stateCode =
      (data.region_code ||
        data.state_code ||
        '') as string

    const cityTrimmed = city.trim()
    const regionTrimmed = region.trim()
    const countryTrimmed = country.trim()
    const countryCodeTrimmed = countryCode.trim()
    const stateCodeTrimmed = stateCode.trim()

    if (!cityTrimmed && !regionTrimmed && !countryTrimmed) {
      return null
    }

    const value: ActivityLocationValue = {}

    // For humans we treat the city as the main "line1" so the badge headline is the city.
    if (cityTrimmed) {
      value.line1 = cityTrimmed
      value.city = cityTrimmed
    }
    if (regionTrimmed) {
      value.state = regionTrimmed
    }
    if (countryTrimmed) {
      value.country = countryTrimmed
    }
    if (countryCodeTrimmed) {
      value.countryCode = countryCodeTrimmed
    }
    if (stateCodeTrimmed) {
      value.stateCode = stateCodeTrimmed
    }

    // Never mark IP-derived city as "exact private" – it's already coarse.
    return value
  } catch {
    return null
  }
}

