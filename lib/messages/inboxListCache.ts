/**
 * Short-lived client cache for GET /api/messages responses.
 * Populated by NavRouteWarmup (idle) and by MessagesPage after each successful fetch
 * so revisiting /messages can paint instantly while revalidation runs.
 */

export type MessagesInboxTab = 'active' | 'invitations'

type Entry = { conversations: unknown[]; at: number }

const store: Partial<Record<MessagesInboxTab, Entry>> = {}
const TTL_MS = 45_000

export function putInboxListCache(tab: MessagesInboxTab, conversations: unknown[]) {
  store[tab] = { conversations, at: Date.now() }
}

export function getInboxListCache(tab: MessagesInboxTab): unknown[] | null {
  const e = store[tab]
  if (!e || Date.now() - e.at > TTL_MS) return null
  return e.conversations
}
