import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'

/**
 * PATCH /api/collections/[collectionId]
 * Update a collection (rename)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { collectionId: string } }
) {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()
    const { collectionId } = params
    const body = await request.json()
    const { name } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'name is required' },
        { status: 400 }
      )
    }

    // Get collection and verify permission
    const { data: collection, error: collectionError } = await supabase
      .from('collections')
      .select('*, portfolios(*)')
      .eq('id', collectionId)
      .single()

    if (collectionError || !collection) {
      return NextResponse.json(
        { success: false, error: 'Collection not found' },
        { status: 404 }
      )
    }

    const portfolio = (collection as any).portfolios
    if (!portfolio) {
      return NextResponse.json(
        { success: false, error: 'Portfolio not found' },
        { status: 404 }
      )
    }

    // Check if user has permission (owner or member)
    const isOwner = portfolio.user_id === user.id
    const metadata = portfolio.metadata as any
    const isManager = Array.isArray(metadata?.managers) && metadata.managers.includes(user.id)
    const isMember = Array.isArray(metadata?.members) && metadata.members.includes(user.id)

    if (!isOwner && !isManager && !isMember) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to update this collection' },
        { status: 403 }
      )
    }

    // Update collection name
    const { data: updatedCollection, error: updateError } = await supabase
      .from('collections')
      .update({ name: name.trim() })
      .eq('id', collectionId)
      .select()
      .single()

    if (updateError) {
      // Check if it's a unique constraint violation
      if (updateError.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A collection with this name already exists' },
          { status: 400 }
        )
      }
      console.error('Error updating collection:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update collection' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      collection: updatedCollection,
    })
  } catch (error: any) {
    console.error('Error in PATCH /api/collections/[collectionId]:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/collections/[collectionId]
 * Delete a collection
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { collectionId: string } }
) {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()
    const { collectionId } = params

    // Get collection and verify permission
    const { data: collection, error: collectionError } = await supabase
      .from('collections')
      .select('*, portfolios(*)')
      .eq('id', collectionId)
      .single()

    if (collectionError || !collection) {
      return NextResponse.json(
        { success: false, error: 'Collection not found' },
        { status: 404 }
      )
    }

    const portfolio = (collection as any).portfolios
    if (!portfolio) {
      return NextResponse.json(
        { success: false, error: 'Portfolio not found' },
        { status: 404 }
      )
    }

    // Check if user has permission (owner or member)
    const isOwner = portfolio.user_id === user.id
    const metadata = portfolio.metadata as any
    const isManager = Array.isArray(metadata?.managers) && metadata.managers.includes(user.id)
    const isMember = Array.isArray(metadata?.members) && metadata.members.includes(user.id)

    if (!isOwner && !isManager && !isMember) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to delete this collection' },
        { status: 403 }
      )
    }

    // Delete collection (cascade will handle note_collections)
    const { error: deleteError } = await supabase
      .from('collections')
      .delete()
      .eq('id', collectionId)

    if (deleteError) {
      console.error('Error deleting collection:', deleteError)
      return NextResponse.json(
        { success: false, error: 'Failed to delete collection' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
    })
  } catch (error: any) {
    console.error('Error in DELETE /api/collections/[collectionId]:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

