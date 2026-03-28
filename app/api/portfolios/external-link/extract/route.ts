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
          content: `You extract structured information from public web pages about projects, communities, programs, activities, or scheduled events (after using search to open the URL).

Decide if the page is primarily a **scheduled event**: a specific happening with explicit date/time (and often a venue or online session time)—e.g. a meetup, talk, show, workshop session, or ticketed occurrence.

Return ONLY a valid JSON object. Optional fields:
- title: clear name of the project, community, activity, or event.
- description: concise summary; omit boilerplate/navigation.

**If and only if** it is a scheduled event:
- time: { "start": ISO8601 string, "end"?: ISO8601 string } from the page when stated; otherwise omit time entirely.
- location: short human-readable place or address line when the event has a real-world or named online venue; omit if none.
- locationStructured: when location applies, object with optional city, region or state, country, countryCode (ISO 2-letter), line1 if needed; align with the location string.

**If it is NOT a scheduled event** (e.g. general project site, community homepage, program overview, club page, portfolio, or no specific session time)—you MUST omit \`time\`, \`location\`, and \`locationStructured\` completely. Do not guess or invent dates, times, or places.

Never fill time/location for non-event pages.`,
        },
        {
          role: 'user',
          content: `Extract information from this URL for someone creating a space (project, community, or activity). Return valid JSON only:\n\n${normalizedUrl}`,
        },
      ],
      max_completion_tokens: 1000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) return NextResponse.json({ error: 'No response from the model' }, { status: 500 })

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
      { error: error.message || 'Failed to extract information from that link' },
      { status: 500 }
    )
  }
}

