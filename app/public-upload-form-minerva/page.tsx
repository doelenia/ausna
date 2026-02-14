import { PublicUploadForm } from '@/components/public-upload/PublicUploadForm'
import { PublicUploadFormConfig } from '@/types/public-upload-form'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function getFormConfig(): Promise<PublicUploadFormConfig> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('public_upload_form_config')
      .select('*')
      .limit(1)
      .single()

    if (error || !data) {
      throw new Error('Failed to fetch form config')
    }

    return data as PublicUploadFormConfig
  } catch (error) {
    console.error('Error fetching form config:', error)
    // Return default config if fetch fails
    return {
      id: '',
      title: 'Portfolio Submission Form',
      intro_paragraph: 'Please fill out this form to submit your portfolio information. All fields marked with * are required.',
      outro_paragraph: 'Thank you for your submission. We will review it and contact you soon.',
      activities_section_paragraph: 'Add activities owned by this portfolio',
      asks_section_paragraph: 'List what you are asking for or need help with',
      members_section_paragraph: 'Add members who are part of this activity',
      question_configs: [],
      updated_at: new Date().toISOString(),
      updated_by: null,
    }
  }
}

export default async function PublicUploadFormPage() {
  const config = await getFormConfig()

  return (
    <div className="bg-white md:bg-transparent md:max-w-4xl md:mx-auto md:p-6">
      <PublicUploadForm config={config} />
    </div>
  )
}

