import { openai } from '@/lib/openai/client'
import { createServiceClient } from '@/lib/supabase/service'
import { Topic, Intention } from '@/types/indexing'

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
 */
export async function findSimilarTopic(
  name: string,
  description: string,
  descriptionVector: number[]
): Promise<Topic | null> {
  const supabase = createServiceClient()

  // Search by vector similarity (cosine distance)
  // 80% similarity = 0.2 cosine distance
  const { data: similarTopics, error } = await supabase.rpc('match_topics', {
    query_embedding: descriptionVector,
    match_threshold: 0.2, // 80% similarity (1 - 0.2 = 0.8)
    match_count: 5,
  })

  if (error) {
    // If RPC doesn't exist, fall back to name matching
    console.warn('RPC match_topics not available, falling back to name matching:', error)
    const { data: nameMatch } = await supabase
      .from('topics')
      .select('*')
      .ilike('name', `%${name}%`)
      .limit(1)
      .single()

    return nameMatch as Topic | null
  }

  // Check if any similar topic matches by name or description similarity
  if (similarTopics && similarTopics.length > 0) {
    // Return the most similar one
    return similarTopics[0] as Topic
  }

  return null
}

/**
 * Find similar intention by description or name (70% similarity threshold)
 */
export async function findSimilarIntention(
  name: string,
  description: string,
  descriptionVector: number[]
): Promise<Intention | null> {
  const supabase = createServiceClient()

  // Search by vector similarity (cosine distance)
  // 70% similarity = 0.3 cosine distance
  const { data: similarIntentions, error } = await supabase.rpc('match_intentions', {
    query_embedding: descriptionVector,
    match_threshold: 0.3, // 70% similarity (1 - 0.3 = 0.7)
    match_count: 5,
  })

  if (error) {
    // If RPC doesn't exist, fall back to name matching
    console.warn('RPC match_intentions not available, falling back to name matching:', error)
    const { data: nameMatch } = await supabase
      .from('intentions')
      .select('*')
      .ilike('name', `%${name}%`)
      .limit(1)
      .single()

    return nameMatch as Intention | null
  }

  // Check if any similar intention matches
  if (similarIntentions && similarIntentions.length > 0) {
    // Return the most similar one
    return similarIntentions[0] as Intention
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
 * Store atomic knowledge
 */
export async function storeAtomicKnowledge(
  noteId: string,
  knowledgeTexts: string[]
): Promise<void> {
  const supabase = createServiceClient()

  // Generate embeddings for each knowledge point
  const knowledgeVectors = await Promise.all(
    knowledgeTexts.map((text) => generateEmbedding(text))
  )

  if (knowledgeTexts.length > 0) {
    // Convert vectors to text format for RPC function
    const vectorTexts = knowledgeVectors.map((vector) => `[${vector.join(',')}]`)
    
    // Use RPC function to insert with vectors as text arrays
    const { error } = await supabase.rpc('store_atomic_knowledge', {
      p_note_id: noteId,
      p_knowledge_texts: knowledgeTexts,
      p_knowledge_vectors: vectorTexts,
    })

    if (error) {
      throw new Error(`Failed to store atomic knowledge: ${error.message}`)
    }
  }
}

/**
 * Create or update topic, handling similarity matching
 */
export async function createOrUpdateTopic(
  name: string,
  description: string,
  noteId: string
): Promise<string> {
  const supabase = createServiceClient()

  // Generate embedding for description
  const descriptionVector = await generateEmbedding(description)

  // Use RPC function to create or update topic
  const { data, error } = await supabase.rpc('create_or_update_topic', {
    p_name: name,
    p_description: description,
    p_description_vector: descriptionVector,
    p_note_id: noteId,
  })

  if (error) {
    throw new Error(`Failed to create or update topic: ${error.message}`)
  }

  return data as string
}

/**
 * Create or update intention, handling similarity matching
 */
export async function createOrUpdateIntention(
  name: string,
  description: string,
  noteId: string
): Promise<string> {
  const supabase = createServiceClient()

  // Generate embedding for description
  const descriptionVector = await generateEmbedding(description)

  // Use RPC function to create or update intention
  const { data, error } = await supabase.rpc('create_or_update_intention', {
    p_name: name,
    p_description: description,
    p_description_vector: descriptionVector,
    p_note_id: noteId,
  })

  if (error) {
    throw new Error(`Failed to create or update intention: ${error.message}`)
  }

  return data as string
}

