import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@/lib/openai/client'
import type { ActivityLocationValue } from '@/lib/location'

export interface ExtractExternalLinkResult {
  title?: string
  time?: { start: string; end?: string }
  /** Legacy: single string. When locationStructured is present, prefer that. */
  location?: string
  /** Structured location: AI fills city, region (state/region), country when applicable. */
  locationStructured?: ActivityLocationValue
  description?: string
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (trimmed.match(/^https?:\/\//i)) return trimmed
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  return `https://${trimmed}`
}

/** Build ActivityLocationValue from AI locationStructured + optional line1 string. */
function buildLocationValue(
  raw: ActivityLocationValue | Record<string, unknown>,
  line1FromLocation?: string
): ActivityLocationValue {
  const source = raw as any
  const city = typeof source.city === 'string' ? source.city.trim() : undefined
  const region = typeof source.region === 'string' ? source.region.trim() : undefined
  const state = typeof source.state === 'string' ? source.state.trim() : undefined
  const country = typeof source.country === 'string' ? source.country.trim() : undefined
  const countryCode =
    typeof source.countryCode === 'string' ? source.countryCode.trim().toUpperCase() : undefined
  const line1 =
    line1FromLocation || (typeof source.line1 === 'string' ? source.line1.trim() : undefined)
  const out: ActivityLocationValue = {}
  if (line1) out.line1 = line1
  if (city) out.city = city
  if (region) out.state = region
  else if (state) out.state = state
  if (country) out.country = country
  if (countryCode) out.countryCode = countryCode
  return out
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const url = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    const normalizedUrl = normalizeUrl(url)

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-search-preview',
      messages: [
        {
          role: 'system',
          content: `You are an expert at extracting event information from URLs.

WEB SEARCH INSTRUCTIONS:
- Use web search to fetch and read the content of the provided URL
- Extract event details from the page (title, date/time, location, description)
- Use web search when the URL points to event pages, meetup pages, conference sites, etc.

Extract the following from the event URL:
1. title: The event name/title
2. time: Object with start (ISO 8601 datetime string) and optionally end (ISO 8601). Use the event's timezone if specified, otherwise assume a reasonable timezone.
3. location: Human-readable venue/address string (e.g. "Event Hall, 123 Main St" or "Convention Center")
4. locationStructured: Object with city, region (state or region name), and country when the event has a physical location. Use standard names (e.g. city: "San Francisco", region: "California", country: "United States"). Include countryCode as ISO 3166-1 alpha-2 when known (e.g. "US", "JP"). Omit locationStructured only for online-only events.
5. description: A short 1-2 sentence summary of the event

Return ONLY a valid JSON object with these exact fields (all optional - omit if not found):
- title: string
- time: { start: string, end?: string } (ISO 8601 strings)
- location: string (venue/address line)
- locationStructured: { city?: string, region?: string, state?: string, country?: string, countryCode?: string } (fill city, region/state, and country when applicable)
- description: string`,
        },
        {
          role: 'user',
          content: `Extract event information from this URL. Use web search to fetch the page content. Return ONLY valid JSON:\n\n${normalizedUrl}`,
        },
      ],
      max_completion_tokens: 1000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json(
        { error: 'No response from extraction' },
        { status: 500 }
      )
    }

    let jsonText = content.trim()
    const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }

    const parsed = JSON.parse(jsonText) as ExtractExternalLinkResult

    const locationStructured = parsed.locationStructured
      ? buildLocationValue(parsed.locationStructured, parsed.location?.trim())
      : undefined

    return NextResponse.json({
      title: parsed.title?.trim() || undefined,
      time: parsed.time || undefined,
      location: parsed.location?.trim() || undefined,
      locationStructured: locationStructured || undefined,
      description: parsed.description?.trim() || undefined,
    })
  } catch (error: any) {
    console.error('Extract external link error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to extract event information' },
      { status: 500 }
    )
  }
}
