import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function parseCommaList(input: string | null): string[] {
  if (!input) return []
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * GET /api/users/last-note-created-at?user_ids=u1,u2,u3
 *
 * Returns:
 * - lastNoteByUserId: { [userId]: ISOString | null }
 *
 * Notes considered:
 * - created_at desc (first match wins per user)
 * - deleted_at is null
 * - mentioned_note_id is null
 * - type != 'resource'
 * - owner_account_id in user_ids OR collaborator_account_ids overlaps user_ids
 *
 * RLS on notes applies.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userIds = parseCommaList(searchParams.get('user_ids')).slice(0, 50)

    if (userIds.length === 0) {
      return NextResponse.json({ lastNoteByUserId: {} })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', lastNoteByUserId: {} }, { status: 401 })
    }

    const [byOwnerRes, byCollabRes] = await Promise.all([
      supabase
        .from('notes')
        .select('created_at, owner_account_id')
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .neq('type', 'resource')
        .in('owner_account_id', userIds)
        .order('created_at', { ascending: false })
        .limit(2000),
      supabase
        .from('notes')
        .select('created_at, collaborator_account_ids')
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .neq('type', 'resource')
        .overlaps('collaborator_account_ids', userIds)
        .order('created_at', { ascending: false })
        .limit(2000),
    ])

    const lastById = new Map<string, string>()

    ;(byOwnerRes.data || []).forEach((n: any) => {
      const createdAt = typeof n?.created_at === 'string' ? n.created_at : null
      const ownerId = typeof n?.owner_account_id === 'string' ? n.owner_account_id : null
      if (!createdAt || !ownerId) return
      if (!userIds.includes(ownerId)) return
      if (!lastById.has(ownerId)) lastById.set(ownerId, createdAt)
    })

    ;(byCollabRes.data || []).forEach((n: any) => {
      const createdAt = typeof n?.created_at === 'string' ? n.created_at : null
      const collabs: unknown = n?.collaborator_account_ids
      if (!createdAt || !Array.isArray(collabs)) return
      collabs.forEach((uid: any) => {
        const userId = typeof uid === 'string' ? uid : null
        if (!userId) return
        if (!userIds.includes(userId)) return
        if (!lastById.has(userId)) lastById.set(userId, createdAt)
      })
    })

    const lastNoteByUserId: Record<string, string | null> = {}
    userIds.forEach((id) => {
      lastNoteByUserId[id] = lastById.get(id) ?? null
    })

    return NextResponse.json({ lastNoteByUserId })
  } catch (error: any) {
    console.error('[API /users/last-note-created-at] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred', lastNoteByUserId: {} },
      { status: 500 }
    )
  }
}

