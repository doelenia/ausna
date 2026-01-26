import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { CreateHumanPortfolioInput } from '@/app/admin/actions'
import { PublicUploadFormSubmission } from '@/types/public-upload-form'

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
      projects: submissionData.projects.map((project) => ({
        ...project,
        is_pseudo: true,
        members: project.members.map((member) => ({
          ...member,
          is_pseudo: true,
        })),
      })),
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('public_upload_forms')
      .insert({
        submission_data: enforcedData,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating submission:', error)
      return NextResponse.json(
        { error: 'Failed to submit form' },
        { status: 500 }
      )
    }

    return NextResponse.json<{ id: string }>({ id: data.id })
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

