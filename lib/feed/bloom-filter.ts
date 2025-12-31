import { BloomFilter } from 'bloom-filters'

/**
 * Default bloom filter configuration
 */
const DEFAULT_BLOOM_FILTER_SIZE = 10000
const DEFAULT_BLOOM_FILTER_ERROR_RATE = 0.01

/**
 * Serialized bloom filter data structure (from saveAsJSON)
 */
export type SerializedBloomFilter = any

/**
 * Create a new bloom filter with default settings
 */
export function createBloomFilter(): BloomFilter {
  return BloomFilter.create(DEFAULT_BLOOM_FILTER_SIZE, DEFAULT_BLOOM_FILTER_ERROR_RATE)
}

/**
 * Serialize a bloom filter to JSON format for storage
 */
export function serializeBloomFilter(bloomFilter: BloomFilter): SerializedBloomFilter {
  return bloomFilter.saveAsJSON()
}

/**
 * Deserialize a bloom filter from JSON format
 * Returns a new bloom filter if data is invalid or missing
 */
export function deserializeBloomFilter(
  data: SerializedBloomFilter | null | undefined
): BloomFilter {
  if (!data) {
    // Return a new bloom filter if data is invalid
    return createBloomFilter()
  }

  try {
    // Reconstruct bloom filter from serialized data using fromJSON
    const bloomFilter = BloomFilter.fromJSON(data)
    return bloomFilter
  } catch (error) {
    console.error('Error deserializing bloom filter:', error)
    // Return a new bloom filter if deserialization fails
    return createBloomFilter()
  }
}

/**
 * Check if a note ID has been seen (exists in bloom filter)
 */
export function isNoteSeen(bloomFilter: BloomFilter, noteId: string): boolean {
  return bloomFilter.has(noteId)
}

/**
 * Mark a note ID as seen in the bloom filter
 */
export function markNoteAsSeen(bloomFilter: BloomFilter, noteId: string): void {
  bloomFilter.add(noteId)
}

/**
 * Mark multiple note IDs as seen in the bloom filter
 */
export function markNotesAsSeen(bloomFilter: BloomFilter, noteIds: string[]): void {
  for (const noteId of noteIds) {
    bloomFilter.add(noteId)
  }
}

/**
 * Filter notes to prioritize unseen posts
 * Returns an object with unseen and seen arrays
 */
export function filterNotesBySeenStatus<T extends { id: string }>(
  notes: T[],
  bloomFilter: BloomFilter
): { unseen: T[]; seen: T[] } {
  const unseen: T[] = []
  const seen: T[] = []

  for (const note of notes) {
    if (isNoteSeen(bloomFilter, note.id)) {
      seen.push(note)
    } else {
      unseen.push(note)
    }
  }

  return { unseen, seen }
}

/**
 * Get notes prioritizing unseen, but filling with seen if needed
 * Returns up to `limit` notes, preferring unseen first
 */
export function getPrioritizedNotes<T extends { id: string }>(
  notes: T[],
  bloomFilter: BloomFilter,
  limit: number
): T[] {
  const { unseen, seen } = filterNotesBySeenStatus(notes, bloomFilter)

  // If we have enough unseen posts, return them
  if (unseen.length >= limit) {
    return unseen.slice(0, limit)
  }

  // Otherwise, return all unseen + enough seen to fill to limit
  const needed = limit - unseen.length
  return [...unseen, ...seen.slice(0, needed)]
}

