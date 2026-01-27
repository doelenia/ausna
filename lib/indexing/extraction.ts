import { openai } from '@/lib/openai/client'
import { ExtractionResult } from '@/types/indexing'

/**
 * Extract summary, atomic knowledge, topics, and asks from compound text
 */
export async function extractFromCompoundText(compoundText: string): Promise<ExtractionResult> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-search-preview',
      messages: [
        {
          role: 'system',
          content: `You are an expert at extracting structured information from text.

WEB SEARCH INSTRUCTIONS:
- Use web search when the content contains URLs, website references, or links
- Use web search for topics that require current information (e.g., latest technologies, recent events, current standards)
- Use web search to get full context about specific companies, products, tools, or services mentioned
- Use web search to verify and enrich topic descriptions with accurate, current information
- After using web search, extract atomic knowledge and topics based on both the original content AND the web search results

Extract the following:
1. A one-sentence summary (can include annotated note content for context)
2. Atomic knowledge points (high-to-low level, each in one sentence, no compounded knowledge) - EXCLUDE content from [Annotated Note: ...] sections as it's already indexed
3. Topics (general and specific, each under 3 words, with one-sentence descriptions) - EXCLUDE content from [Annotated Note: ...] sections as it's already indexed. IMPORTANT: Use commonly used terminology and standard definitions. Prefer widely recognized terms over niche or custom terminology. For example, use "Graphic Design" instead of "Visual Communication Design", "Web Development" instead of "Frontend Engineering", "Machine Learning" instead of "Neural Network Training". Use terms that most people in the field would recognize and use.
4. Asks (detect any clear intention to find, seek, need, or look for resources, people, help, services, tools, information, or opportunities. Include both explicit and implicit asks. Examples: "looking for graphic designer", "need help with X", "seeking collaborators", "want to find Y". Each ask should be a single sentence describing what is being sought) - EXCLUDE content from [Annotated Note: ...] sections as it's already indexed

IMPORTANT: When extracting atomic knowledge, topics, and asks, ONLY extract from the current note's content (the note text, image descriptions, and URL references). DO NOT extract from any [Annotated Note: ...] sections, as that content has already been indexed separately. The annotated note is only provided for context when generating the summary.

CRITICAL: You MUST respond with ONLY a valid JSON object, no other text. The JSON must have these exact fields:
- summary: string (one sentence, can reference annotated note for context)
- atomicKnowledge: string[] (array of atomic knowledge sentences, ONLY from current note, exclude annotated note)
- topics: Array<{name: string, description: string}> (name under 3 words using commonly used terminology, description one sentence using standard definitions, ONLY from current note, exclude annotated note)
- asks: string[] (array of ask sentences, each describing what is being sought. Include any ask to find, seek, need, or look for something, even if phrased indirectly. ONLY from current note, exclude annotated note)`,
        },
        {
          role: 'user',
          content: `Extract information from this text. Remember to exclude [Annotated Note: ...] sections when extracting atomic knowledge, topics, and asks. Respond with ONLY a valid JSON object:\n\n${compoundText}`,
        },
      ],
      max_completion_tokens: 2000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from AI')
    }

    // Extract JSON from response (handle markdown code blocks if present)
    let jsonText = content.trim()
    // Remove markdown code blocks if present
    const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }
    
    const result = JSON.parse(jsonText) as ExtractionResult

    // Validate and clean results
    return {
      summary: result.summary?.trim() || undefined,
      atomicKnowledge: Array.isArray(result.atomicKnowledge)
        ? result.atomicKnowledge.filter((k) => k && k.trim().length > 0)
        : undefined,
      topics: Array.isArray(result.topics)
        ? result.topics.filter((t) => t.name && t.description && t.name.trim().length > 0 && t.description.trim().length > 0)
        : undefined,
      asks: Array.isArray(result.asks)
        ? result.asks.filter((a) => a && a.trim().length > 0)
        : undefined,
    }
  } catch (error) {
    console.error('Failed to extract from compound text:', error)
    throw error
  }
}

/**
 * Extract summary, atomic knowledge, topics, and asks from property text with context
 * This is used for processing portfolio properties (descriptions, goals, timelines, asks)
 */
export async function extractFromPropertyText(
  propertyText: string,
  context: {
    propertyType: 'human_description' | 'project_description' | 'project_property'
    propertyName?: 'goals' | 'timelines' | 'asks'
    projectDescription?: string
    humanDescription?: string
    projectName?: string
    humanName?: string
  }
): Promise<ExtractionResult> {
  try {
    // Build context string
    const contextParts: string[] = []
    
    if (context.propertyType === 'project_description' || context.propertyType === 'project_property') {
      if (context.projectName) {
        contextParts.push(`Project: ${context.projectName}`)
      }
      if (context.projectDescription) {
        contextParts.push(`Project Description: ${context.projectDescription}`)
      }
      if (context.humanDescription) {
        contextParts.push(`Project Owner's Description: ${context.humanDescription}`)
      }
    } else if (context.propertyType === 'human_description') {
      if (context.humanName) {
        contextParts.push(`Person: ${context.humanName}`)
      }
    }

    const contextString = contextParts.length > 0 ? `\n\n[Context - For Reference Only]:\n${contextParts.join('\n')}` : ''

    // Build property-specific instructions
    let propertyInstructions = ''
    let propertyLabel = ''
    
    if (context.propertyType === 'human_description') {
      propertyLabel = 'Human Portfolio Description'
    } else if (context.propertyType === 'project_description') {
      propertyLabel = 'Project Portfolio Description'
    } else if (context.propertyType === 'project_property') {
      if (context.propertyName === 'goals') {
        propertyLabel = 'Project Goals'
        propertyInstructions = '\n\nIMPORTANT: Project goals are highly valuable for extracting asks. Pay special attention to extracting asks from this content.'
      } else if (context.propertyName === 'timelines') {
        propertyLabel = 'Project Timelines'
      } else if (context.propertyName === 'asks') {
        propertyLabel = 'Project Asks'
        propertyInstructions = '\n\nIMPORTANT: Project asks are highly valuable for extracting asks. Pay special attention to extracting asks from this content.'
      }
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-search-preview',
      messages: [
        {
          role: 'system',
          content: `You are an expert at extracting structured information from text.

WEB SEARCH INSTRUCTIONS:
- Use web search when the content contains URLs, website references, or links
- Use web search for topics that require current information (e.g., latest technologies, recent events, current standards)
- Use web search to get full context about specific companies, products, tools, or services mentioned
- Use web search to verify and enrich topic descriptions with accurate, current information
- After using web search, extract atomic knowledge and topics based on both the original content AND the web search results

CRITICAL EXTRACTION RULES:
- ONLY extract information from the TARGET PROPERTY text (clearly marked below)
- DO NOT extract atomic knowledge, topics, or asks from the [Context - For Reference Only] section
- The context is provided ONLY to help you understand the context and generate a better summary
- When extracting atomic knowledge, topics, and asks, extract ONLY from the target property text itself
- The summary can reference context for better understanding, but all extracted knowledge must come from the target property

Extract the following from the TARGET PROPERTY ONLY:
1. A one-sentence summary (can reference context for understanding, but knowledge must come from target property)
2. Atomic knowledge points (high-to-low level, each in one sentence, no compounded knowledge) - ONLY from target property
3. Topics (general and specific, each under 3 words, with one-sentence descriptions) - ONLY from target property. IMPORTANT: Use commonly used terminology and standard definitions. Prefer widely recognized terms over niche or custom terminology. For example, use "Graphic Design" instead of "Visual Communication Design", "Web Development" instead of "Frontend Engineering", "Machine Learning" instead of "Neural Network Training". Use terms that most people in the field would recognize and use.
4. Asks (detect any clear intention to find, seek, need, or look for resources, people, help, services, tools, information, or opportunities. Include both explicit and implicit asks. Examples: "looking for graphic designer", "need help with X", "seeking collaborators", "want to find Y". Each ask should be a single sentence describing what is being sought) - ONLY from target property${propertyInstructions}

CRITICAL: You MUST respond with ONLY a valid JSON object, no other text. The JSON must have these exact fields:
- summary: string (one sentence, can reference context for understanding)
- atomicKnowledge: string[] (array of atomic knowledge sentences, ONLY from target property)
- topics: Array<{name: string, description: string}> (name under 3 words using commonly used terminology, description one sentence using standard definitions, ONLY from target property)
- asks: string[] (array of ask sentences, each describing what is being sought. Include any ask to find, seek, need, or look for something, even if phrased indirectly. ONLY from target property)`,
        },
        {
          role: 'user',
          content: `Extract information from the following ${propertyLabel}. Remember: ONLY extract from the ${propertyLabel} text below, NOT from the context. Respond with ONLY a valid JSON object.${contextString}\n\n[TARGET PROPERTY - ${propertyLabel}]:\n${propertyText}`,
        },
      ],
      max_completion_tokens: 2000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from AI')
    }

    // Extract JSON from response (handle markdown code blocks if present)
    let jsonText = content.trim()
    // Remove markdown code blocks if present
    const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }
    
    const result = JSON.parse(jsonText) as ExtractionResult

    // Validate and clean results
    return {
      summary: result.summary?.trim() || undefined,
      atomicKnowledge: Array.isArray(result.atomicKnowledge)
        ? result.atomicKnowledge.filter((k) => k && k.trim().length > 0)
        : undefined,
      topics: Array.isArray(result.topics)
        ? result.topics.filter((t) => t.name && t.description && t.name.trim().length > 0 && t.description.trim().length > 0)
        : undefined,
      asks: Array.isArray(result.asks)
        ? result.asks.filter((a) => a && a.trim().length > 0)
        : undefined,
    }
  } catch (error) {
    console.error('Failed to extract from property text:', error)
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

