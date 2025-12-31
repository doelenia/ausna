import { openai } from '@/lib/openai/client'
import { ExtractionResult } from '@/types/indexing'

/**
 * Extract summary, atomic knowledge, topics, and intentions from compound text
 */
export async function extractFromCompoundText(compoundText: string): Promise<ExtractionResult> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at extracting structured information from text. 
Extract the following:
1. A one-sentence summary (can include annotated note content for context)
2. Atomic knowledge points (high-to-low level, each in one sentence, no compounded knowledge) - EXCLUDE content from [Annotated Note: ...] sections as it's already indexed
3. Topics (general and specific, each under 3 words, with one-sentence descriptions) - EXCLUDE content from [Annotated Note: ...] sections as it's already indexed. IMPORTANT: Use commonly used terminology and standard definitions. Prefer widely recognized terms over niche or custom terminology. For example, use "Graphic Design" instead of "Visual Communication Design", "Web Development" instead of "Frontend Engineering", "Machine Learning" instead of "Neural Network Training". Use terms that most people in the field would recognize and use.
4. Intentions (detect any clear intention to find, seek, need, or look for resources, people, help, services, tools, information, or opportunities. Include both explicit and implicit intentions. Examples: "looking for graphic designer", "need help with X", "seeking collaborators", "want to find Y". Name under 3 words, description one sentence) - EXCLUDE content from [Annotated Note: ...] sections as it's already indexed

IMPORTANT: When extracting atomic knowledge, topics, and intentions, ONLY extract from the current note's content (the note text, image descriptions, and URL references). DO NOT extract from any [Annotated Note: ...] sections, as that content has already been indexed separately. The annotated note is only provided for context when generating the summary.

Return a JSON object with these fields:
- summary: string (one sentence, can reference annotated note for context)
- atomicKnowledge: string[] (array of atomic knowledge sentences, ONLY from current note, exclude annotated note)
- topics: Array<{name: string, description: string}> (name under 3 words using commonly used terminology, description one sentence using standard definitions, ONLY from current note, exclude annotated note)
- intentions: Array<{name: string, description: string}> (name under 3 words, description one sentence. Include any intention to find, seek, need, or look for something, even if phrased indirectly. ONLY from current note, exclude annotated note)`,
        },
        {
          role: 'user',
          content: `Extract information from this text. Remember to exclude [Annotated Note: ...] sections when extracting atomic knowledge, topics, and intentions:\n\n${compoundText}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 2000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from AI')
    }

    const result = JSON.parse(content) as ExtractionResult

    // Validate and clean results
    return {
      summary: result.summary?.trim() || undefined,
      atomicKnowledge: Array.isArray(result.atomicKnowledge)
        ? result.atomicKnowledge.filter((k) => k && k.trim().length > 0)
        : undefined,
      topics: Array.isArray(result.topics)
        ? result.topics.filter((t) => t.name && t.description && t.name.trim().length > 0 && t.description.trim().length > 0)
        : undefined,
      intentions: Array.isArray(result.intentions)
        ? result.intentions.filter((i) => i.name && i.description && i.name.trim().length > 0 && i.description.trim().length > 0)
        : undefined,
    }
  } catch (error) {
    console.error('Failed to extract from compound text:', error)
    throw error
  }
}

/**
 * Extract only summary from compound text (for faster processing if needed)
 */
export async function extractSummary(compoundText: string): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at summarizing text. Provide a concise one-sentence summary.',
        },
        {
          role: 'user',
          content: `Summarize this text in one sentence:\n\n${compoundText}`,
        },
      ],
      max_completion_tokens: 100,
    })

    const summary = completion.choices[0]?.message?.content?.trim()
    return summary || ''
  } catch (error) {
    console.error('Failed to extract summary:', error)
    throw error
  }
}

