import { openai } from '@/lib/openai/client'

export interface DailyMatchIntroProjectSummary {
  name: string
  description?: string | null
}

export interface DailyMatchIntroActivitySummary {
  name: string
  accessibility: string
  interestTags: string[]
}

export interface DailyMatchIntroInput {
  profileDescription: string
  projects: DailyMatchIntroProjectSummary[]
  interestTags: string[]
  activities: DailyMatchIntroActivitySummary[]
}

export async function generateDailyMatchIntro(
  input: DailyMatchIntroInput
): Promise<string | null> {
  const { profileDescription, projects, interestTags, activities } = input

  try {
    const projectLines =
      projects.length > 0
        ? projects
            .map((p) => {
              const desc = (p.description || '').trim()
              return desc ? `- ${p.name}: ${desc}` : `- ${p.name}`
            })
            .join('\n')
        : '(none)'

    const interestLine =
      interestTags.length > 0 ? interestTags.join(', ') : '(none)'

    const activityLines =
      activities.length > 0
        ? activities
            .map((a) => {
              const tags = a.interestTags && a.interestTags.length > 0 ? a.interestTags.join(', ') : ''
              const parts = [a.name]
              if (a.accessibility) parts.push(a.accessibility)
              if (tags) parts.push(`tags: ${tags}`)
              return `- ${parts.join(' · ')}`
            })
            .join('\n')
        : '(none)'

    const userPrompt = `
You are writing a short morning introduction for a curated set of activities the user might enjoy today.

User profile:
${profileDescription || '(no profile description)'}

User projects:
${projectLines}

User key interests:
${interestLine}

Today's matched activities:
${activityLines}

Write a single short paragraph (ideally between 40 and 60 words) that:
- Feels like a gentle, morning delivery of a curated selection.
- Is elegant, lively, and thoughtful.
- Mentions that these are today's matches without listing every activity.
- Uses simple, human language (no bullet points, no markdown).
`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a careful, poetic concierge introducing a small set of curated activities. Respond with a single paragraph only, no markdown, between about 40 and 60 words.',
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      max_completion_tokens: 160,
    })

    const raw = completion.choices[0]?.message?.content
    if (!raw) return null

    const text = raw.trim().replace(/\s+/g, ' ')
    if (!text) return null

    return text
  } catch (err) {
    console.error('generateDailyMatchIntro error:', err)
    return null
  }
}

