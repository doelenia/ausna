import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Portfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/utils'

type NoteType = 'post' | 'annotation' | 'reaction'

const VALID_REACTION_TYPES = ['like'] as const
type ReactionKind = (typeof VALID_REACTION_TYPES)[number]

interface ReactionsSummary {
  success: boolean
  likers: string[]
  hasReacted: boolean
  totalCount: number
}

async function getReactionsSummary(
  noteId: string,
  kind: ReactionKind,
  currentUserId: string | null,
  limit: number
): Promise<ReactionsSummary> {
  const supabase = await createClient()

  // Fetch top N recent reactions for this note
  const { data: reactions, error } = await supabase
    .from('notes')
    .select('id, owner_account_id, created_at, type, text, deleted_at, mentioned_note_id')
    .eq('type', 'reaction' as NoteType)
    .eq('text', kind)
    .eq('mentioned_note_id', noteId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[Reactions] Failed to fetch reactions:', error)
    return {
      success: false,
      likers: [],
      hasReacted: false,
      totalCount: 0,
    }
  }

  const topReactions = reactions || []
  const likers = topReactions.map((r) => String(r.owner_account_id))

  // Determine if current user has an active reaction (even if not in top N)
  let hasReacted = false
  if (currentUserId) {
    const { data: existing, error: existingError } = await supabase
      .from('notes')
      .select('id')
      .eq('type', 'reaction' as NoteType)
      .eq('text', kind)
      .eq('mentioned_note_id', noteId)
      .eq('owner_account_id', currentUserId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!existingError && existing) {
      hasReacted = true
    }
  }

  // Total count for this reaction kind
  const { count, error: countError } = await supabase
    .from('notes')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'reaction' as NoteType)
    .eq('text', kind)
    .eq('mentioned_note_id', noteId)
    .is('deleted_at', null)

  if (countError) {
    console.error('[Reactions] Failed to count reactions:', countError)
  }

  return {
    success: true,
    likers,
    hasReacted,
    totalCount: count || 0,
  }
}

/**
 * GET /api/notes/[noteId]/reactions
 *
 * Default mode returns a small summary for pills:
 *  - type: 'like' (default)
 *  - limit: number (default: 5)
 *
 * When `view=list` is provided, returns a paginated list of reactions for
 * the reactions popup:
 *  - type: 'like' (default)
 *  - limit: number (default: 10)
 *  - offset: number (default: 0)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { noteId: string } }
) {
  try {
    const { noteId } = params
    if (!noteId) {
      return NextResponse.json({ error: 'Note ID is required' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const kindRaw = searchParams.get('type') || 'like'
    const view = searchParams.get('view') || 'summary'
    const limitRaw = searchParams.get('limit')
    const offsetRaw = searchParams.get('offset') || '0'

    if (!VALID_REACTION_TYPES.includes(kindRaw as ReactionKind)) {
      return NextResponse.json(
        { error: 'Invalid reaction type' },
        { status: 400 }
      )
    }
    const kind = kindRaw as ReactionKind

    const supabase = await createClient()

    // Detailed list for reactions popup
    if (view === 'list') {
      const limit = Math.min(Math.max(parseInt(limitRaw || '10', 10) || 10, 1), 50)
      const offset = Math.max(parseInt(offsetRaw, 10) || 0, 0)

      const { data, error, count } = await supabase
        .from('notes')
        .select('id, owner_account_id, created_at', { count: 'exact' })
        .eq('type', 'reaction' as NoteType)
        .eq('text', kind)
        .eq('mentioned_note_id', noteId)
        .is('deleted_at', null)
        // Oldest first for popup
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1)

      if (error) {
        console.error('[Reactions] Failed to fetch reactions list:', error)
        return NextResponse.json(
          { error: 'Failed to fetch reactions list' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        reactions: (data || []).map((r) => ({
          id: r.id,
          userId: r.owner_account_id,
          createdAt: r.created_at,
        })),
        totalCount: count || 0,
      })
    }
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const limit = Math.min(Math.max(parseInt(limitRaw || '5', 10) || 5, 1), 20)
    const summary = await getReactionsSummary(noteId, kind, user?.id ?? null, limit)
    if (!summary.success) {
      return NextResponse.json(
        { error: 'Failed to fetch reactions' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      likers: summary.likers,
      hasReacted: summary.hasReacted,
      totalCount: summary.totalCount,
    })
  } catch (error: any) {
    console.error('[Reactions] GET error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/notes/[noteId]/reactions
 * Toggle a reaction for the current user.
 * Body (JSON):
 *  - type: 'like' (default)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { noteId: string } }
) {
  try {
    const { noteId } = params
    if (!noteId) {
      return NextResponse.json({ error: 'Note ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    let kind: ReactionKind = 'like'
    try {
      const body = await request.json().catch(() => ({}))
      const typeRaw = body?.type as string | undefined
      if (typeRaw && VALID_REACTION_TYPES.includes(typeRaw as ReactionKind)) {
        kind = typeRaw as ReactionKind
      }
    } catch {
      // Ignore body parse errors; default to 'like'
    }

    // Ensure the target note exists and is not deleted
    const { data: targetNote, error: noteError } = await supabase
      .from('notes')
      .select('id, assigned_portfolios, parent_note_id, mentioned_note_id, annotation_privacy, owner_account_id, deleted_at')
      .eq('id', noteId)
      .maybeSingle()

    if (noteError || !targetNote || targetNote.deleted_at) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      )
    }

    // Toggle behavior: if reaction exists, soft delete it; otherwise create it
    const { data: existing, error: existingError } = await supabase
      .from('notes')
      .select('id')
      .eq('type', 'reaction' as NoteType)
      .eq('text', kind)
      .eq('mentioned_note_id', noteId)
      .eq('owner_account_id', user.id)
      .is('deleted_at', null)
      .maybeSingle()

    if (existingError) {
      // Treat network/Cloudflare/Supabase errors as "no existing reaction" so the user can still react.
      console.error('[Reactions] Failed to check existing reaction (continuing as if none exists):', existingError)
    }

    let createdReaction = !existing

    if (existing) {
      // Soft delete existing reaction
      const { error: deleteError } = await supabase
        .from('notes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', existing.id)

      if (deleteError) {
        console.error('[Reactions] Failed to delete reaction:', deleteError)
        return NextResponse.json(
          { error: 'Failed to remove reaction' },
          { status: 500 }
        )
      }

      createdReaction = false
    } else {
      // Create new reaction note
      const assignedPortfolios = Array.isArray(targetNote.assigned_portfolios)
        ? (targetNote.assigned_portfolios as string[])
        : []

      const parentNoteId =
        (targetNote as any).parent_note_id || targetNote.id

      const insertData = {
        type: 'reaction' as NoteType,
        owner_account_id: user.id,
        text: kind,
        references: [],
        assigned_portfolios: assignedPortfolios,
        mentioned_note_id: noteId,
        parent_note_id: parentNoteId,
        annotations: [],
        deleted_at: null,
        primary_annotation: false,
        // Reuse root note's annotation privacy if present; default to 'everyone'
        annotation_privacy:
          (targetNote as any).annotation_privacy || 'everyone',
      }

      const { error: insertError } = await supabase
        .from('notes')
        .insert(insertData)

      if (insertError) {
        console.error('[Reactions] Failed to insert reaction:', insertError)
        return NextResponse.json(
          { error: 'Failed to add reaction' },
          { status: 500 }
        )
      }

      createdReaction = true
    }

    // If a new like reaction was created, notify the liked note's author
    if (createdReaction) {
      const receiverId: string | null = targetNote.owner_account_id
      if (receiverId && receiverId !== user.id) {
        try {
          // Resolve sender display name from their human portfolio
          let senderName = `User ${String(user.id).slice(0, 8)}`
          const { data: senderPortfolio } = await supabase
            .from('portfolios')
            .select('*')
            .eq('type', 'human')
            .eq('user_id', user.id)
            .maybeSingle()

          if (senderPortfolio) {
            const basic = getPortfolioBasic(senderPortfolio as Portfolio)
            if (basic?.name) {
              senderName = basic.name
            }
          }

          await supabase.from('messages').insert({
            sender_id: user.id,
            receiver_id: receiverId,
            text: '',
            note_id: noteId,
            annotation_id: null,
            message_type: 'comment_preview',
          })

          // Move conversation to active for both sides (similar to annotation notifications)
          await supabase
            .from('conversation_completions')
            .delete()
            .eq('user_id', user.id)
            .eq('partner_id', receiverId)

          const { data: friendship } = await supabase
            .from('friends')
            .select('id')
            .or(`and(user_id.eq.${user.id},friend_id.eq.${receiverId}),and(user_id.eq.${receiverId},friend_id.eq.${user.id})`)
            .eq('status', 'accepted')
            .maybeSingle()

          if (friendship) {
            await supabase
              .from('conversation_completions')
              .delete()
              .eq('user_id', receiverId)
              .eq('partner_id', user.id)
          }
        } catch (notifyError) {
          // Do not fail the reaction if notification creation fails
          console.error('[Reactions] Failed to send like notification:', notifyError)
        }
      }
    }

    // Return updated summary (top 5)
    const summary = await getReactionsSummary(noteId, kind, user.id, 5)
    if (!summary.success) {
      return NextResponse.json(
        { error: 'Reaction updated but failed to fetch summary' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      likers: summary.likers,
      hasReacted: summary.hasReacted,
      totalCount: summary.totalCount,
    })
  } catch (error: any) {
    console.error('[Reactions] POST error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

