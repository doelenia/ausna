/**
 * Indexing status for notes
 */
export type IndexingStatus = 'pending' | 'processing' | 'completed' | 'failed'

/**
 * Note vector embeddings
 */
export interface NoteVector {
  id: string
  note_id: string
  summary_vector: number[] | null
  compound_text_vector: number[] | null
  created_at: string
  updated_at: string
}

/**
 * Atomic knowledge point
 */
export interface AtomicKnowledge {
  id: string
  note_id: string
  knowledge_text: string
  knowledge_vector: number[] | null
  created_at: string
}

/**
 * Topic extracted from notes
 */
export interface Topic {
  id: string
  name: string
  description: string
  description_vector: number[] | null
  mention_count: number
  mentions: string[] // Array of note IDs
  created_at: string
  updated_at: string
}

/**
 * Intention detected in notes
 */
export interface Intention {
  id: string
  name: string
  description: string
  description_vector: number[] | null
  mention_count: number
  mentions: string[] // Array of note IDs
  created_at: string
  updated_at: string
}

/**
 * Extraction result from ChatGPT
 */
export interface ExtractionResult {
  summary?: string
  atomicKnowledge?: string[]
  topics?: Array<{ name: string; description: string }>
  intentions?: Array<{ name: string; description: string }>
}

