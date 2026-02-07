import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { CreateHumanPortfolioInput } from '@/app/admin/actions'
import { PublicUploadFormSubmission } from '@/types/public-upload-form'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const submissionData = body as CreateHumanPortfolioInput

    // Validate required fields
    if (!submissionData.name || !submissionData.email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(submissionData.email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Ensure pseudo status is enforced
    const enforcedData: CreateHumanPortfolioInput = {
      ...submissionData,
      is_pseudo: true,
      joined_community: submissionData.joined_community || '9f4fc0af-8997-494e-945c-d2831eaf258a',
      projects: submissionData.projects?.map((project) => ({
        ...project,
        is_pseudo: true,
        members: (project.members || []).map((member) => ({
          ...member,
          is_pseudo: true,
        })),
      })),
    }

    // Use createServerClient but with empty cookies to ensure anonymous access
    // createSupabaseClient doesn't properly set the role context for RLS
    // We need to use createServerClient which properly handles the anon key
    const cookieStore = await cookies()
    
    // Use publishable/anon key
    const apiKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    // Create a server client that doesn't use any cookies
    // This ensures it works as an anonymous client
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      apiKey,
      {
        cookies: {
          getAll() {
            // Return empty array to ensure no session cookies are used
            // This forces anonymous access with the anon role
            return []
          },
          setAll() {
            // Don't set any cookies for anonymous requests
            // This prevents any session from being created
          },
        },
      }
    )

    // Use a database function to insert, which bypasses RLS
    // This is safe because we validate input in the API route
    // The function has SECURITY DEFINER and is granted to anon role
    const { data: insertedId, error: functionError } = await supabase.rpc('insert_public_upload_form', {
      p_submission_data: enforcedData,
      p_status: 'pending',
    })

    // If function call succeeds, return the ID directly
    if (!functionError && insertedId) {
      return NextResponse.json<{ id: string }>({ id: insertedId })
    }

    // If function call fails, try direct insert as fallback

    // Try direct insert
    const { data: insertedData, error: insertError } = await supabase
      .from('public_upload_forms')
      .insert({
        submission_data: enforcedData,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Error creating submission:', insertError)
      return NextResponse.json(
        { error: 'Failed to submit form' },
        { status: 500 }
      )
    }

    return NextResponse.json<{ id: string }>({ id: insertedData.id })
  } catch (error: any) {
    console.error('Error in POST submission:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const supabase = await createClient()

    let query = supabase.from('public_upload_forms').select('*').order('submitted_at', { ascending: false })

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching submissions:', error)
      return NextResponse.json(
        { error: 'Failed to fetch submissions' },
        { status: 500 }
      )
    }

    // Return empty array if no data (this is normal, not an error)
    return NextResponse.json<PublicUploadFormSubmission[]>(data ?? [])
  } catch (error: any) {
    if (error.message === 'Admin access required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Error in GET submissions:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

