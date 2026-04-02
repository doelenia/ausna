import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type TargetType = 'friend' | 'joined_space' | 'subscribed_space'

function isTargetType(v: any): v is TargetType {
  return v === 'friend' || v === 'joined_space' || v === 'subscribed_space'
}

/**
 * POST /api/last-checked
 * Body: { target_type: 'friend'|'joined_space'|'subscribed_space', target_id: string(uuid) }
 *
 * Upserts last_checked_at to now for the current user + target.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const target_type = body?.target_type
    const target_id = typeof body?.target_id === 'string' ? body.target_id.trim() : ''

    if (!isTargetType(target_type) || !target_id) {
      return NextResponse.json({ error: 'target_type and target_id are required' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()

    const { error } = await supabase.from('user_last_checked').upsert(
      {
        user_id: user.id,
        target_type,
        target_id,
        last_checked_at: nowIso,
        updated_at: nowIso,
      },
      {
        onConflict: 'user_id,target_type,target_id',
      }
    )

    if (error) {
      console.error('[API /last-checked] Upsert error:', error)
      return NextResponse.json({ error: 'Failed to update last-checked' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[API /last-checked] Unexpected error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

