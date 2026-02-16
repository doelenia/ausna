import { Json } from './supabase'

/**
 * Image reference in a note
 */
export interface ImageReference {
  type: 'image'
  url: string
}

/**
 * URL reference in a note with metadata
 */
export interface UrlReference {
  type: 'url'
  url: string
  hostIcon?: string
  hostName?: string
  title?: string
  headerImage?: string
  description?: string
}

/**
 * Union type for note references
 */
export type NoteReference = ImageReference | UrlReference

import { IndexingStatus } from './indexing'

/**
 * Note interface matching database structure
 */
export interface Note {
  id: string
  owner_account_id: string
  text: string
  references: NoteReference[]
  assigned_portfolios: string[]
  mentioned_note_id: string | null
  /**
   * Root note for this annotation thread.
   * - NULL for regular notes (non-annotations)
   * - For annotations and replies, points to the original note being annotated.
   */
  parent_note_id?: string | null
  /**
   * Marks a first-level annotation directly on the root note.
   * Replies to annotations should inherit false.
   */
  primary_annotation?: boolean
  /**
   * List of annotation IDs that belong to this note's thread.
   * Used to quickly know if a note has annotations without recursive queries.
   */
  annotations?: string[] | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  annotation_privacy?: 'authors' | 'friends' | 'everyone'
  // Indexing fields
  summary?: string | null
  compound_text?: string | null
  topics?: string[] // Array of topic IDs
  intentions?: string[] // Array of intention IDs
  indexing_status?: IndexingStatus
}

/**
 * Input for creating a new note
 */
export interface CreateNoteInput {
  text: string
  references?: NoteReference[]
  assigned_portfolios?: string[]
  mentioned_note_id?: string | null
}

/**
 * Input for updating a note
 */
export interface UpdateNoteInput {
  text?: string
  references?: NoteReference[]
  assigned_portfolios?: string[]
  mentioned_note_id?: string | null
}

/**
 * Note with populated referenced note
 */
export interface NoteWithMention extends Note {
  mentioned_note?: Note | null
}

/**
 * Note source information for feed display
 */
export type NoteSource = 
  | { type: 'friend' }
  | { type: 'community'; communityName: string; communityId: string }
  | { type: 'subscribed' }
  | null

/**
 * Note with source information (for feed display)
 */
export interface NoteWithSource extends Note {
  feedSource?: NoteSource
}
