import { createClient } from '@/lib/supabase/server'

export type LegalDocumentType = 'terms' | 'privacy'

export interface LegalDocument {
  id: string
  type: LegalDocumentType
  version: number
  content: string
  effective_date: string
  created_at: string
  is_active: boolean
}

export interface UserLegalAgreement {
  id: string
  user_id: string
  document_type: LegalDocumentType
  document_version: number
  agreed_at: string
  ip_address: string | null
}

export async function getActiveLegalDocument(
  type: LegalDocumentType
): Promise<LegalDocument | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('legal_documents')
    .select('*')
    .eq('type', type)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Error fetching active legal document:', error)
    return null
  }

  return data as LegalDocument | null
}

export async function getUserAgreements(
  userId: string
): Promise<UserLegalAgreement[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('user_legal_agreements')
    .select('*')
    .eq('user_id', userId)
    .order('agreed_at', { ascending: false })

  if (error || !data) {
    console.error('Error fetching user legal agreements:', error)
    return []
  }

  return data as UserLegalAgreement[]
}

export async function createUserAgreement(options: {
  userId: string
  documentType: LegalDocumentType
  documentVersion: number
  ipAddress?: string
}): Promise<UserLegalAgreement | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('user_legal_agreements')
    .insert({
      user_id: options.userId,
      document_type: options.documentType,
      document_version: options.documentVersion,
      ip_address: options.ipAddress ?? null,
    })
    .select()
    .single()

  if (error || !data) {
    console.error('Error creating user legal agreement:', error)
    return null
  }

  return data as UserLegalAgreement
}

export async function hasUserAgreedToCurrent(
  userId: string,
  documentType: LegalDocumentType
): Promise<boolean> {
  const [activeDocument, agreements] = await Promise.all([
    getActiveLegalDocument(documentType),
    getUserAgreements(userId),
  ])

  if (!activeDocument) return false

  const latestAgreement = agreements.find(
    (agreement) =>
      agreement.document_type === documentType &&
      agreement.document_version === activeDocument.version
  )

  return !!latestAgreement
}


