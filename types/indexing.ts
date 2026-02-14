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
  note_id: string | null // Nullable for property-based knowledge
  knowledge_text: string
  knowledge_vector: number[] | null
  is_asks: boolean
  assigned_human: string[] // Array of human portfolio IDs
  assigned_projects: string[] // Array of project portfolio IDs
  topics: string[] // Array of topic IDs
  source_info: {
    source_type: 'note' | 'human_description' | 'project_description' | 'project_property'
    source_id: string
    property_name?: 'goals' | 'timelines' | 'asks' // Only for project_property
  } | null
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
 * Extraction result from ChatGPT
 */
export interface ExtractionResult {
  summary?: string
  atomicKnowledge?: string[]
  asks?: string[] // Asks extracted (same format as atomic knowledge but flagged as asks)
  topics?: Array<{ name: string; description: string }>
}

/**
 * User interest tracking entry
 */
export interface UserInterest {
  id: string
  user_id: string
  topic_id: string
  aggregate_score: number
  memory_score: number
  created_at: string
  updated_at: string
}

