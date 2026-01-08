import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'

/**
 * GET /api/collections?portfolio_id=xxx
 * Get all collections for a portfolio
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const portfolioId = searchParams.get('portfolio_id')

    if (!portfolioId) {
      return NextResponse.json(
        { success: false, error: 'portfolio_id is required' },
        { status: 400 }
      )
    }

    const { data: collections, error } = await supabase
      .from('collections')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching collections:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch collections' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      collections: collections || [],
    })
  } catch (error: any) {
    console.error('Error in GET /api/collections:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/collections
 * Create a new collection
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()
    const body = await request.json()
    const { portfolio_id, name } = body

    if (!portfolio_id || !name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'portfolio_id and name are required' },
        { status: 400 }
      )
    }

    // Verify portfolio exists and user has permission
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', portfolio_id)
      .single()

    if (portfolioError || !portfolio) {
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
        { success: false, error: 'You do not have permission to create collections in this portfolio' },
        { status: 403 }
      )
    }

    // Create collection
    const { data: collection, error: createError } = await supabase
      .from('collections')
      .insert({
        portfolio_id,
        name: name.trim(),
      })
      .select()
      .single()

    if (createError) {
      // Check if it's a unique constraint violation
      if (createError.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A collection with this name already exists' },
          { status: 400 }
        )
      }
      console.error('Error creating collection:', createError)
      return NextResponse.json(
        { success: false, error: 'Failed to create collection' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      collection,
    })
  } catch (error: any) {
    console.error('Error in POST /api/collections:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

