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

type TargetType = 'friend' | 'joined_space' | 'subscribed_space'

/**
 * GET /api/unread-counts?space_ids=a,b,c&friend_ids=u1,u2
 *
 * Returns:
 * - spaces: { [portfolioId]: number }
 * - friends: { [friendUserId]: number }
 *
 * Notes counted:
 * - created_at > last_checked_at (per target)
 * - deleted_at is null
 * - mentioned_note_id is null
 * - type != 'resource'
 *
 * For friends: authored by friend OR friend is a collaborator.
 * For spaces: assigned to that portfolio id.
 *
 * RLS on notes applies (visibility/portfolio rules).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const spaceIds = parseCommaList(searchParams.get('space_ids'))
    const friendIds = parseCommaList(searchParams.get('friend_ids'))

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ spaces: {}, friends: {} })
    }

    const uniqueSpaceIds = Array.from(new Set(spaceIds))
    const uniqueFriendIds = Array.from(new Set(friendIds))

    const targets: Array<{ target_type: TargetType; target_id: string }> = []
    uniqueSpaceIds.forEach((id) => {
      targets.push({ target_type: 'joined_space', target_id: id })
      targets.push({ target_type: 'subscribed_space', target_id: id })
    })
    uniqueFriendIds.forEach((id) => {
      targets.push({ target_type: 'friend', target_id: id })
    })

    const checkpointsByKey = new Map<string, string>()
    if (targets.length > 0) {
      // We fetch checkpoints per type to avoid large OR strings.
      const [friendsCk, joinedCk, subCk] = await Promise.all([
        uniqueFriendIds.length > 0
          ? supabase
              .from('user_last_checked')
              .select('target_id,last_checked_at')
              .eq('user_id', user.id)
              .eq('target_type', 'friend')
              .in('target_id', uniqueFriendIds)
          : Promise.resolve({ data: [] as any[] }),
        uniqueSpaceIds.length > 0
          ? supabase
              .from('user_last_checked')
              .select('target_id,last_checked_at')
              .eq('user_id', user.id)
              .eq('target_type', 'joined_space')
              .in('target_id', uniqueSpaceIds)
          : Promise.resolve({ data: [] as any[] }),
        uniqueSpaceIds.length > 0
          ? supabase
              .from('user_last_checked')
              .select('target_id,last_checked_at')
              .eq('user_id', user.id)
              .eq('target_type', 'subscribed_space')
              .in('target_id', uniqueSpaceIds)
          : Promise.resolve({ data: [] as any[] }),
      ])

      ;(friendsCk.data || []).forEach((r: any) => {
        if (r?.target_id && r?.last_checked_at) checkpointsByKey.set(`friend:${r.target_id}`, r.last_checked_at)
      })
      ;(joinedCk.data || []).forEach((r: any) => {
        if (r?.target_id && r?.last_checked_at) checkpointsByKey.set(`joined_space:${r.target_id}`, r.last_checked_at)
      })
      ;(subCk.data || []).forEach((r: any) => {
        if (r?.target_id && r?.last_checked_at) checkpointsByKey.set(`subscribed_space:${r.target_id}`, r.last_checked_at)
      })
    }

    // Compute per-target cutoff; if we have no checkpoint, treat as "now" (0 unread baseline).
    const nowIso = new Date().toISOString()
    const spaceCutoffById = new Map<string, string>()
    uniqueSpaceIds.forEach((id) => {
      const joined = checkpointsByKey.get(`joined_space:${id}`)
      const sub = checkpointsByKey.get(`subscribed_space:${id}`)
      // If user is both joined+subscribed, we want unread since the most recent check across either.
      // (This matches the idea of "last time checked this space" regardless of relationship.)
      const cutoff = [joined, sub].filter(Boolean).sort().slice(-1)[0] || nowIso
      spaceCutoffById.set(id, cutoff)
    })

    const friendCutoffById = new Map<string, string>()
    uniqueFriendIds.forEach((id) => {
      friendCutoffById.set(id, checkpointsByKey.get(`friend:${id}`) || nowIso)
    })

    const spaces: Record<string, number> = {}
    const friends: Record<string, number> = {}
    uniqueSpaceIds.forEach((id) => (spaces[id] = 0))
    uniqueFriendIds.forEach((id) => (friends[id] = 0))

    // Fetch space notes in a limited window and count client-side (similar to /portfolios/last-note-created-at).
    if (uniqueSpaceIds.length > 0) {
      const minCutoff = Array.from(spaceCutoffById.values()).sort()[0] || nowIso

      const { data: notes } = await supabase
        .from('notes')
        .select('created_at, assigned_portfolios')
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .neq('type', 'resource')
        .gte('created_at', minCutoff)
        .overlaps('assigned_portfolios', uniqueSpaceIds)
        .order('created_at', { ascending: false })
        .limit(2000)

      ;(notes || []).forEach((n: any) => {
        const createdAt = typeof n?.created_at === 'string' ? n.created_at : null
        const assigned: unknown = n?.assigned_portfolios
        if (!createdAt || !Array.isArray(assigned)) return
        assigned.forEach((pid: any) => {
          if (typeof pid !== 'string') return
          if (!spaceCutoffById.has(pid)) return
          const cutoff = spaceCutoffById.get(pid) || nowIso
          if (createdAt > cutoff) {
            spaces[pid] = (spaces[pid] || 0) + 1
          }
        })
      })
    }

    if (uniqueFriendIds.length > 0) {
      const minCutoff = Array.from(friendCutoffById.values()).sort()[0] || nowIso

      const [byOwnerRes, byCollabRes] = await Promise.all([
        supabase
          .from('notes')
          .select('id, created_at, owner_account_id')
          .is('deleted_at', null)
          .is('mentioned_note_id', null)
          .neq('type', 'resource')
          .gte('created_at', minCutoff)
          .in('owner_account_id', uniqueFriendIds)
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase
          .from('notes')
          .select('id, created_at, collaborator_account_ids')
          .is('deleted_at', null)
          .is('mentioned_note_id', null)
          .neq('type', 'resource')
          .gte('created_at', minCutoff)
          .overlaps('collaborator_account_ids', uniqueFriendIds)
          .order('created_at', { ascending: false })
          .limit(2000),
      ])

      const seenNoteIds = new Set<string>()

      ;(byOwnerRes.data || []).forEach((n: any) => {
        const id = typeof n?.id === 'string' ? n.id : null
        const createdAt = typeof n?.created_at === 'string' ? n.created_at : null
        const ownerId = typeof n?.owner_account_id === 'string' ? n.owner_account_id : null
        if (!id || !createdAt || !ownerId) return
        seenNoteIds.add(id)
        const cutoff = friendCutoffById.get(ownerId) || nowIso
        if (createdAt > cutoff) {
          friends[ownerId] = (friends[ownerId] || 0) + 1
        }
      })

      ;(byCollabRes.data || []).forEach((n: any) => {
        const id = typeof n?.id === 'string' ? n.id : null
        const createdAt = typeof n?.created_at === 'string' ? n.created_at : null
        const collabs: unknown = n?.collaborator_account_ids
        if (!id || !createdAt || !Array.isArray(collabs)) return
        if (seenNoteIds.has(id)) {
          // Note already counted for its owner; still can count toward collaborators too.
          // (We do NOT early-return.)
        }
        collabs.forEach((uid: any) => {
          const friendId = typeof uid === 'string' ? uid : null
          if (!friendId) return
          if (!friendCutoffById.has(friendId)) return
          const cutoff = friendCutoffById.get(friendId) || nowIso
          if (createdAt > cutoff) {
            friends[friendId] = (friends[friendId] || 0) + 1
          }
        })
      })
    }

    return NextResponse.json({ spaces, friends })
  } catch (error: any) {
    console.error('[API /unread-counts] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error', spaces: {}, friends: {} },
      { status: 500 }
    )
  }
}

