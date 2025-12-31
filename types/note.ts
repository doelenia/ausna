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
  created_at: string
  updated_at: string
  deleted_at: string | null
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

