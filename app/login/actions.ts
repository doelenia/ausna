'use server'

import { createServiceClient } from '@/lib/supabase/service'

export type CheckEmailStatusResult =
  | { status: 'existing_user' }
  | { status: 'new_or_pseudo' }

export async function checkEmailStatus(email: string): Promise<CheckEmailStatusResult> {
  const normalizedEmail = email.trim().toLowerCase()

  if (!normalizedEmail) {
    return { status: 'new_or_pseudo' }
  }

  const serviceClient = createServiceClient()

  // Check if an auth user already exists for this email
  const { data: listResult, error: listError } = await serviceClient.auth.admin.listUsers({
    email: normalizedEmail,
    perPage: 1,
  } as any)

  if (listError) {
    console.error('Error checking auth user by email:', listError)
    // Fail open to registration rather than blocking
    return { status: 'new_or_pseudo' }
  }

  const users = (listResult as any)?.users
  const hasExistingUser = Array.isArray(users) && users.length > 0

  if (hasExistingUser) {
    return { status: 'existing_user' }
  }

  // No existing auth user – treat as new or pseudo
  return { status: 'new_or_pseudo' }
}

