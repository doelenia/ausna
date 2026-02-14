import { openai } from '@/lib/openai/client'
import { createServiceClient } from '@/lib/supabase/service'
import { Topic } from '@/types/indexing'

/**
 * Generate embedding vector for text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    })

    return response.data[0].embedding
  } catch (error) {
    console.error('Failed to generate embedding:', error)
    throw error
  }
}

/**
 * Find similar topic by description or name (80% similarity threshold)
 * First checks for name matches, then falls back to description similarity
 */
export async function findSimilarTopic(
  name: string,
  description: string,
  descriptionVector: number[]
): Promise<Topic | null> {
  const supabase = createServiceClient()

  // First, check for exact or similar name match (case-insensitive)
  // Try exact match first (most common case)
  const { data: exactNameMatch } = await supabase
    .from('topics')
    .select('*')
    .ilike('name', name.trim())
    .limit(1)
    .maybeSingle()

  if (exactNameMatch) {
    return exactNameMatch as Topic
  }

  // Try fuzzy name matching with ILIKE pattern
  const { data: fuzzyNameMatch } = await supabase
    .from('topics')
    .select('*')
    .or(`name.ilike.%${name.trim()}%,name.ilike.${name.trim()}%`)
    .limit(1)
    .maybeSingle()

  if (fuzzyNameMatch) {
    return fuzzyNameMatch as Topic
  }

  // No name match found, check description similarity
  // Search by vector similarity (cosine distance)
  // 80% similarity = 0.2 cosine distance
  const { data: similarTopics, error } = await supabase.rpc('match_topics', {
    query_embedding: descriptionVector,
    match_threshold: 0.2, // 80% similarity (1 - 0.2 = 0.8)
    match_count: 5,
  })

  if (error) {
    // If RPC doesn't exist, return null (name matching already tried above)
    console.warn('RPC match_topics not available:', error)
    return null
  }

  // Check if any similar topic matches by description similarity
  if (similarTopics && similarTopics.length > 0) {
    // Return the most similar one
    return similarTopics[0] as Topic
  }

  return null
}


/**
 * Store note vectors
 */
export async function storeNoteVectors(
  noteId: string,
  summaryVector: number[] | null,
  compoundTextVector: number[] | null
): Promise<void> {
  const supabase = createServiceClient()

  // Convert arrays to PostgreSQL vector format string
  const summaryVectorStr = summaryVector ? `[${summaryVector.join(',')}]` : null
  const compoundTextVectorStr = compoundTextVector ? `[${compoundTextVector.join(',')}]` : null

  const { error } = await supabase
    .from('note_vectors')
    .upsert({
      note_id: noteId,
      summary_vector: summaryVectorStr,
      compound_text_vector: compoundTextVectorStr,
    })

  if (error) {
    throw new Error(`Failed to store note vectors: ${error.message}`)
  }
}

/**
 * Store atomic knowledge with optional metadata
 */
export async function storeAtomicKnowledge(
  knowledgeTexts: string[],
  options: {
    noteId?: string | null
    isAsks?: boolean[]
    assignedHuman?: string[]
    assignedProjects?: string[]
    topics?: string[] // Single array of topic IDs (same for all knowledge items from this source)
    sourceInfo?: {
      source_type: 'note' | 'human_description' | 'project_description' | 'project_property'
      source_id: string
      property_name?: 'goals' | 'timelines' | 'asks'
    } | null
  } = {}
): Promise<void> {
  const supabase = createServiceClient()

  // Generate embeddings for each knowledge point
  const knowledgeVectors = await Promise.all(
    knowledgeTexts.map((text) => generateEmbedding(text))
  )

  if (knowledgeTexts.length > 0) {
    // Convert vectors to text format for RPC function
    const vectorTexts = knowledgeVectors.map((vector) => `[${vector.join(',')}]`)
    
    // Convert source_info to JSONB string if provided
    const sourceInfoJson = options.sourceInfo ? JSON.stringify(options.sourceInfo) : null
    
    // Use RPC function to insert with vectors as text arrays
    const { error } = await supabase.rpc('store_atomic_knowledge', {
      p_note_id: options.noteId || null,
      p_knowledge_texts: knowledgeTexts,
      p_knowledge_vectors: vectorTexts,
      p_is_asks: options.isAsks || null,
      p_assigned_human: options.assignedHuman || null,
      p_assigned_projects: options.assignedProjects || null,
      p_topics: options.topics || null,
      p_source_info: sourceInfoJson,
    })

    if (error) {
      throw new Error(`Failed to store atomic knowledge: ${error.message}`)
    }
  }
}

/**
 * Create or update topic, handling similarity matching
 * noteId is optional (for property sources that don't have note_id)
 */
export async function createOrUpdateTopic(
  name: string,
  description: string,
  noteId?: string | null
): Promise<string> {
  const supabase = createServiceClient()

  // Generate embedding for description
  const descriptionVector = await generateEmbedding(description)

  // Use RPC function to create or update topic
  const { data, error } = await supabase.rpc('create_or_update_topic', {
    p_name: name,
    p_description: description,
    p_description_vector: descriptionVector,
    p_note_id: noteId || null,
  })

  if (error) {
    throw new Error(`Failed to create or update topic: ${error.message}`)
  }

  return data as string
}

/**
 * Extract additional topics from asks
 * Given a list of asks with their assigned topics, ask AI to suggest additional topics
 * that would help users find resources to fulfill these asks
 */
export async function extractAdditionalTopicsFromAsks(
  asksWithTopics: Array<{ ask: string; topics: Array<{ name: string; description: string }> }>
): Promise<Array<{ name: string; description: string }>> {
  try {
    // Build the prompt with asks and their topics
    const asksText = asksWithTopics
      .map((item, idx) => {
        const topicsText = item.topics.map((t) => `- ${t.name}: ${t.description}`).join('\n')
        return `Ask ${idx + 1}: ${item.ask}\nAssociated Topics:\n${topicsText}`
      })
      .join('\n\n')

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at identifying topics that would help users find resources to fulfill asks.

Given a list of asks and their associated topics, identify additional topics that would help users explore resources to fulfill these asks. These additional topics should represent areas of knowledge, skills, tools, services, or communities that could be relevant.

Return a JSON object with a field "additionalTopics" containing an array of topics. Each topic should have:
- name: string (under 3 words, using commonly used terminology)
- description: string (one sentence describing the topic)

IMPORTANT: Use commonly used terminology and standard definitions. Prefer widely recognized terms over niche or custom terminology.`,
        },
        {
          role: 'user',
          content: `Given these asks and their topics, what additional topics would help users find resources to fulfill these asks?\n\n${asksText}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 1000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from AI')
    }

    const result = JSON.parse(content) as { additionalTopics?: Array<{ name: string; description: string }> }

    // Validate and clean results
    if (Array.isArray(result.additionalTopics)) {
      return result.additionalTopics.filter(
        (t) => t.name && t.description && t.name.trim().length > 0 && t.description.trim().length > 0
      )
    }

    return []
  } catch (error) {
    console.error('Failed to extract additional topics from asks:', error)
    throw error
  }
}

