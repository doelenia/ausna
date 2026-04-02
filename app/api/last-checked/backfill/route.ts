import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DB_NON_HUMAN_TYPES } from '@/types/portfolio'

export const dynamic = 'force-dynamic'

type LastCheckedTargetType = 'friend' | 'joined_space' | 'subscribed_space'

function otherFriendId(row: { user_id: string; friend_id: string }, me: string): string | null {
  if (row.user_id === me) return row.friend_id
  if (row.friend_id === me) return row.user_id
  return null
}

function userIsInPortfolio(userId: string, portfolioRow: any): boolean {
  if (!userId) return false
  if (portfolioRow?.user_id === userId) return true
  const meta = (portfolioRow?.metadata as any) || {}
  const members: string[] = Array.isArray(meta?.members) ? meta.members : []
  const managers: string[] = Array.isArray(meta?.managers) ? meta.managers : []
  return members.includes(userId) || managers.includes(userId)
}

/**
 * POST /api/last-checked/backfill
 *
 * Idempotently ensures the current user has last_checked rows for:
 * - friends (accepted)
 * - joined spaces (owner/manager/member)
 * - subscribed spaces
 *
 * All rows are set to "now" (backfill baseline).
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const nowIso = new Date().toISOString()

    const [{ data: friendsRows }, { data: subscriptionsRows }, { data: allSpacesRows }] =
      await Promise.all([
        supabase
          .from('friends')
          .select('user_id, friend_id, status')
          .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
          .eq('status', 'accepted'),
        supabase.from('subscriptions').select('portfolio_id').eq('user_id', user.id),
        supabase
          .from('portfolios')
          .select('id, user_id, metadata')
          .in('type', [...DB_NON_HUMAN_TYPES])
          .limit(2000),
      ])

    const friendIds = new Set<string>()
    ;(friendsRows || []).forEach((r: any) => {
      const other = otherFriendId({ user_id: String(r.user_id), friend_id: String(r.friend_id) }, user.id)
      if (other) friendIds.add(other)
    })

    const subscribedSpaceIds = new Set<string>()
    ;(subscriptionsRows || []).forEach((r: any) => {
      const pid = r?.portfolio_id ? String(r.portfolio_id) : ''
      if (pid) subscribedSpaceIds.add(pid)
    })

    const joinedSpaceIds = new Set<string>()
    ;(allSpacesRows || []).forEach((p: any) => {
      if (userIsInPortfolio(user.id, p)) {
        const id = p?.id ? String(p.id) : ''
        if (id) joinedSpaceIds.add(id)
      }
    })

    const rows: Array<{
      user_id: string
      target_type: LastCheckedTargetType
      target_id: string
      last_checked_at: string
      updated_at: string
    }> = []

    friendIds.forEach((id) =>
      rows.push({
        user_id: user.id,
        target_type: 'friend',
        target_id: id,
        last_checked_at: nowIso,
        updated_at: nowIso,
      })
    )

    joinedSpaceIds.forEach((id) =>
      rows.push({
        user_id: user.id,
        target_type: 'joined_space',
        target_id: id,
        last_checked_at: nowIso,
        updated_at: nowIso,
      })
    )

    subscribedSpaceIds.forEach((id) =>
      rows.push({
        user_id: user.id,
        target_type: 'subscribed_space',
        target_id: id,
        last_checked_at: nowIso,
        updated_at: nowIso,
      })
    )

    if (rows.length === 0) {
      return NextResponse.json({ success: true, upserted: 0 })
    }

    const { error } = await supabase.from('user_last_checked').upsert(rows, {
      onConflict: 'user_id,target_type,target_id',
    })

    if (error) {
      console.error('[API /last-checked/backfill] Upsert error:', error)
      return NextResponse.json({ error: 'Failed to backfill last-checked' }, { status: 500 })
    }

    return NextResponse.json({ success: true, upserted: rows.length })
  } catch (error: any) {
    console.error('[API /last-checked/backfill] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

