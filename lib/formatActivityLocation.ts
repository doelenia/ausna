import type { ActivityLocationValue } from './location'
import { getOnlineLocationDisplayName } from './location'

export interface FormattedActivityLocation {
  line1: string | null
  line2: string | null
  googleMapsQuery: string | null
  /** When location is online with a URL, so the badge can open it in a new tab. */
  onlineUrl: string | null
}

export function formatActivityLocation(
  value: ActivityLocationValue | null | undefined
): FormattedActivityLocation {
  if (!value) {
    return { line1: null, line2: null, googleMapsQuery: null, onlineUrl: null }
  }

  if (value.online) {
    const onlineUrl = value.onlineUrl?.trim() || null
    const line1 = onlineUrl ? getOnlineLocationDisplayName(onlineUrl) : 'Online'
    return {
      line1,
      line2: null,
      googleMapsQuery: null,
      onlineUrl,
    }
  }

  const line1 = value.line1?.trim() || null
  const city = value.city?.trim() || ''
  const state = value.state?.trim() || ''
  const rawCountry = value.country?.trim() || ''
  const countryCode = value.countryCode?.trim().toUpperCase() || ''

  // Normalize country for display:
  // - Prefer a human-readable name if we know it
  // - Fall back to the raw country string, then the ISO code
  let displayCountry = rawCountry
  const normalizedCode = (countryCode || rawCountry).toUpperCase()

  switch (normalizedCode) {
    case 'US':
    case 'USA':
    case 'UNITED STATES':
      displayCountry = 'United States'
      break
    case 'JP':
    case 'JPN':
    case 'JAPAN':
      displayCountry = 'Japan'
      break
    default:
      if (!displayCountry && normalizedCode) {
        displayCountry = normalizedCode
      }
      break
  }

  const country = displayCountry

  let line2: string | null = null

  // Display rules:
  // - US: prefer "city, state" (e.g., "New York, NY")
  // - Non-US: prefer "city, country" (e.g., "Tokyo, Japan")
  // - Fallbacks when pieces are missing
  const isUS =
    normalizedCode === 'US' ||
    normalizedCode === 'USA' ||
    normalizedCode === 'UNITED STATES' ||
    rawCountry.toUpperCase() === 'UNITED STATES'

  if (city) {
    if (isUS) {
      line2 = state ? `${city}, ${state}` : city
    } else {
      line2 = country ? `${city}, ${country}` : city
    }
  } else if (state && country) {
    line2 = `${state}, ${country}`
  } else if (state) {
    line2 = state
  } else if (country) {
    line2 = country
  }

  const composite = [line1, city, state, country].filter(Boolean).join(', ') || null
  const googleMapsQuery = composite

  return {
    line1,
    line2,
    googleMapsQuery,
    onlineUrl: null,
  }
}

