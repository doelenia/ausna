import { CreateHumanPortfolioInput } from '@/app/admin/actions'

/**
 * Question configuration for form customization
 */
export interface QuestionConfig {
  field_key: string
  label: string
  description: string
  placeholder?: string
  type?: 'string' | 'single-select' | 'multi-select'
  options?: string[]
  allowOther?: boolean
}

/**
 * Form configuration stored in database
 */
export interface PublicUploadFormConfig {
  id: string
  title: string
  intro_paragraph: string
  outro_paragraph: string
  activities_section_paragraph: string
  asks_section_paragraph: string
  members_section_paragraph: string
  question_configs: QuestionConfig[]
  updated_at: string
  updated_by: string | null
}

/**
 * Form submission stored in database
 */
export interface PublicUploadFormSubmission {
  id: string
  submission_data: CreateHumanPortfolioInput
  status: 'pending' | 'approved' | 'rejected'
  submitted_at: string
  approved_at: string | null
  approved_by: string | null
  processed_at: string | null
  notes: string | null
}

/**
 * Response from email check API
 */
export interface EmailCheckResponse {
  exists: boolean
  name?: string
}

