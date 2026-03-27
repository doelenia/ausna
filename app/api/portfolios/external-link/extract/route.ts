import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@/lib/openai/client'
import type { ActivityLocationValue } from '@/lib/location'

export interface ExtractExternalLinkResult {
  title?: string
  time?: { start: string; end?: string }
  location?: string
  locationStructured?: ActivityLocationValue
  description?: string
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (trimmed.match(/^https?:\/\//i)) return trimmed
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  return `https://${trimmed}`
}

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
  const line1 = line1FromLocation || (typeof source.line1 === 'string' ? source.line1.trim() : undefined)
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

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const url = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 })

    const normalizedUrl = normalizeUrl(url)

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-search-preview',
      messages: [
        {
          role: 'system',
          content: `You are an expert at extracting event information from URLs.
Extract title, time(start/end ISO), location, locationStructured(city/region/state/country/countryCode), description.
Return ONLY a valid JSON object with optional fields.`,
        },
        {
          role: 'user',
          content: `Extract event information from this URL and return valid JSON only:\n\n${normalizedUrl}`,
        },
      ],
      max_completion_tokens: 1000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) return NextResponse.json({ error: 'No response from extraction' }, { status: 500 })

    let jsonText = content.trim()
    const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
    if (jsonMatch) jsonText = jsonMatch[1]

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
    return NextResponse.json(
      { error: error.message || 'Failed to extract event information' },
      { status: 500 }
    )
  }
}

