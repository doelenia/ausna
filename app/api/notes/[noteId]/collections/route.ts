import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'

/**
 * GET /api/notes/[noteId]/collections
 * Get all collections a note is assigned to
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { noteId: string } }
) {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()
    const { noteId } = params

    const { data: noteCollections, error } = await supabase
      .from('note_collections')
      .select('collection_id, collections(*)')
      .eq('note_id', noteId)

    if (error) {
      console.error('Error fetching note collections:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch note collections' },
        { status: 500 }
      )
    }

    const collections = (noteCollections || []).map((nc: any) => nc.collections).filter(Boolean)

    return NextResponse.json({
      success: true,
      collections,
    })
  } catch (error: any) {
    console.error('Error in GET /api/notes/[noteId]/collections:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/notes/[noteId]/collections
 * Assign a note to collections
 * Body: { collection_ids: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { noteId: string } }
) {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()
    const { noteId } = params
    const body = await request.json()
    const { collection_ids } = body

    if (!Array.isArray(collection_ids)) {
      return NextResponse.json(
        { success: false, error: 'collection_ids must be an array' },
        { status: 400 }
      )
    }

    // Verify note exists and user owns it or is member of portfolio
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('*, assigned_portfolios')
      .eq('id', noteId)
      .single()

    if (noteError || !note) {
      return NextResponse.json(
        { success: false, error: 'Note not found' },
        { status: 404 }
      )
    }

    const isNoteOwner = note.owner_account_id === user.id

    // If user doesn't own the note, check if they're a member of any portfolio that has these collections
    if (!isNoteOwner && collection_ids.length > 0) {
      const { data: collections } = await supabase
        .from('collections')
        .select('portfolio_id, portfolios(*)')
        .in('id', collection_ids)

      if (collections && collections.length > 0) {
        const hasPermission = collections.some((c: any) => {
          const portfolio = c.portfolios
          if (!portfolio) return false
          const isOwner = portfolio.user_id === user.id
          const metadata = portfolio.metadata as any
          const isManager = Array.isArray(metadata?.managers) && metadata.managers.includes(user.id)
          const isMember = Array.isArray(metadata?.members) && metadata.members.includes(user.id)
          return isOwner || isManager || isMember
        })

        if (!hasPermission) {
          return NextResponse.json(
            { success: false, error: 'You do not have permission to assign this note to collections' },
            { status: 403 }
          )
        }
      }
    }

    // Remove existing assignments
    const { error: deleteError } = await supabase
      .from('note_collections')
      .delete()
      .eq('note_id', noteId)

    if (deleteError) {
      console.error('Error removing existing collections:', deleteError)
      return NextResponse.json(
        { success: false, error: 'Failed to update note collections' },
        { status: 500 }
      )
    }

    // Add new assignments
    if (collection_ids.length > 0) {
      const insertData = collection_ids.map((collectionId: string) => ({
        note_id: noteId,
        collection_id: collectionId,
      }))

      const { error: insertError } = await supabase
        .from('note_collections')
        .insert(insertData)

      if (insertError) {
        console.error('Error assigning collections:', insertError)
        return NextResponse.json(
          { success: false, error: 'Failed to assign note to collections' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
    })
  } catch (error: any) {
    console.error('Error in POST /api/notes/[noteId]/collections:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

