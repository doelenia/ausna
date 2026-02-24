import type { ActivityLocationValue } from './location'

interface FormattedLocation {
  line1: string | null
  line2: string | null
  googleMapsQuery: string | null
}

export function formatActivityLocation(
  value: ActivityLocationValue | null | undefined
): FormattedLocation {
  if (!value) {
    return { line1: null, line2: null, googleMapsQuery: null }
  }

  const line1 = value.line1?.trim() || null
  const city = value.city?.trim() || ''
  const state = value.state?.trim() || ''
  const country = value.country?.trim() || ''

  let line2: string | null = null

  // Unified rules for all countries:
  // - If city exists (any resolution ≥ city): "city, region" (no country)
  // - Else if only region/country: "region, country" when both, or just region/country
  if (city) {
    line2 = state ? `${city}, ${state}` : city
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
  }
}

