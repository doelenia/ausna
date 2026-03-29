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
  /** Single emoji for avatar when favicon is not used; optional */
  suggestedEmoji?: string
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

function firstEmojiGrapheme(s: string | undefined): string | undefined {
  if (!s || typeof s !== 'string') return undefined
  const t = s.trim()
  if (!t) return undefined
  const chars = Array.from(t)
  for (const ch of chars) {
    if (/\p{Extended_Pictographic}/u.test(ch)) return ch
  }
  return chars[0]
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const urlRaw = typeof body?.url === 'string' ? body.url.trim() : ''
    const userDescription =
      typeof body?.userDescription === 'string' ? body.userDescription.trim() : ''

    if (!urlRaw && !userDescription) {
      return NextResponse.json(
        { error: 'Provide a page URL and/or a description' },
        { status: 400 }
      )
    }

    // Description-only: infer title, optional polish, emoji, and event fields from the text itself
    if (!urlRaw) {
      const todayUtc = new Date().toISOString().slice(0, 10)
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `The user is creating a "space" (project, community, activity, or similar) on a platform. They only provided a free-text description—it may be long and include meeting times, venues, or addresses.

Today's date (UTC) for resolving relative or yearless dates: ${todayUtc}.

Decide if the text is primarily about a **scheduled event**: a specific happening with explicit date and/or time (and often a venue or online session)—e.g. a meetup, talk, workshop session, or ticketed occurrence.

Return ONLY a valid JSON object with:
- title: short, clear name inferred from the text.
- description: If the user's text is already clear and informative, return it verbatim. Only revise if a small edit would make it more informative without changing meaning or tone; do not add marketing fluff.
- suggestedEmoji: exactly one Unicode emoji that fits the space (avatar when there is no website favicon).

**If and only if** the text describes a scheduled event with enough explicit timing (and optionally place) stated in the description:
- time: { "start": ISO8601 string, "end"?: ISO8601 string } using only dates/times given or clearly implied in the text. If the year is omitted, assume the next upcoming occurrence from today's perspective. Use UTC or a clear offset only if the text specifies one.
- location: short human-readable place, venue, or address line when stated; omit if none.
- locationStructured: when location applies, object with optional city, region or state, country, countryCode (ISO 2-letter), line1 if needed; align with the location string.

**If it is NOT** a scheduled event, or date/time is too vague to output reliable ISO8601—omit \`time\`, \`location\`, and \`locationStructured\` completely. Do not guess or invent dates, times, or places.`,
          },
          {
            role: 'user',
            content: userDescription,
          },
        ],
        max_completion_tokens: 1200,
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
        description: parsed.description?.trim() || undefined,
        time: parsed.time || undefined,
        location: parsed.location?.trim() || undefined,
        locationStructured: locationStructured || undefined,
        suggestedEmoji: firstEmojiGrapheme(parsed.suggestedEmoji),
      })
    }

    const normalizedUrl = normalizeUrl(urlRaw)

    const userDescBlock = userDescription
      ? `\n\nThe user also pasted this description (authoritative for the "description" field): only revise if you can make it strictly more informative without changing their intent or adding unrelated claims; otherwise return their text verbatim.\n\n**Important:** The user's text may contain event date, time, and venue that does not appear on the page. After reading the page, also scan the user's description for scheduled-event details. If either the page OR the user's text clearly states date/time (and optionally venue) for a scheduled event, fill \`time\`, \`location\`, and \`locationStructured\` from the best available source—prefer explicit facts from the user's text when the page is vague or missing those details. Do not invent dates or places not supported by the page or the user's text.\n\n---\n${userDescription}\n---`
      : ''

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-search-preview',
      messages: [
        {
          role: 'system',
          content: `You extract structured information from public web pages about projects, communities, programs, activities, or scheduled events (after using search to open the URL).

Decide if this is about a **scheduled event**: a specific happening with explicit date/time (and often a venue or online session)—from the **page** and/or from the **user's pasted description** in the user message when present.

Return ONLY a valid JSON object. Optional fields:
- title: clear name of the project, community, activity, or event.
- description: concise summary from the page unless the user supplied text in the request; then follow the authoritative rules in the user message. Omit boilerplate/navigation from the page when summarizing.
- suggestedEmoji: exactly one Unicode emoji that fits this space (for avatar when a site favicon is not available). Always include this field.

**If and only if** a scheduled event is clearly indicated (on the page and/or in the user's pasted description):
- time: { "start": ISO8601 string, "end"?: ISO8601 string } when date/time is stated clearly enough to build ISO8601; otherwise omit time entirely.
- location: short human-readable place or address line when stated; omit if none.
- locationStructured: when location applies, object with optional city, region or state, country, countryCode (ISO 2-letter), line1 if needed; align with the location string.

**If** neither the page nor the user's text supports a reliable scheduled event with explicit timing—omit \`time\`, \`location\`, and \`locationStructured\` completely. Do not guess or invent dates, times, or places.

When the user pasted a description with times or venue, you must consider that text for time and location fields, not only the web page.`,
        },
        {
          role: 'user',
          content: `Extract information from this URL for someone creating a space (project, community, or activity). Return valid JSON only:\n\n${normalizedUrl}${userDescBlock}`,
        },
      ],
      max_completion_tokens: 1200,
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
      suggestedEmoji: firstEmojiGrapheme(parsed.suggestedEmoji),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to extract information from that link' },
      { status: 500 }
    )
  }
}

