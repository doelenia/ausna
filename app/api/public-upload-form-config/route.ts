import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { PublicUploadFormConfig } from '@/types/public-upload-form'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('public_upload_form_config')
      .select('*')
      .limit(1)
      .single()

    if (error) {
      console.error('Error fetching form config:', error)
      return NextResponse.json(
        { error: 'Failed to fetch form config' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Form config not found' },
        { status: 404 }
      )
    }

    return NextResponse.json<PublicUploadFormConfig>(data)
  } catch (error: any) {
    console.error('Error in GET form config:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin()

    const body = await request.json()
    const { title, intro_paragraph, outro_paragraph, activities_section_paragraph, asks_section_paragraph, members_section_paragraph, question_configs } = body

    if (!title || !intro_paragraph || !outro_paragraph || !activities_section_paragraph || !asks_section_paragraph || !members_section_paragraph) {
      return NextResponse.json(
        { error: 'All paragraph fields are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Update the single config row (there should only be one row)
    // First, get the existing row ID
    const { data: existingConfig } = await supabase
      .from('public_upload_form_config')
      .select('id')
      .limit(1)
      .single()

    if (!existingConfig) {
      return NextResponse.json(
        { error: 'Form config not found' },
        { status: 404 }
      )
    }

    // Update the config row
    const { data, error } = await supabase
      .from('public_upload_form_config')
      .update({
        title,
        intro_paragraph,
        outro_paragraph,
        activities_section_paragraph,
        asks_section_paragraph,
        members_section_paragraph,
        question_configs: question_configs || [],
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('id', existingConfig.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating form config:', error)
      return NextResponse.json(
        { error: 'Failed to update form config' },
        { status: 500 }
      )
    }

    return NextResponse.json<PublicUploadFormConfig>(data)
  } catch (error: any) {
    if (error.message === 'Admin access required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Error in PUT form config:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

