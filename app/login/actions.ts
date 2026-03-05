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

  const users = (listResult as any)?.users
  const hasExistingUser = Array.isArray(users) && users.length > 0
  const firstUser = hasExistingUser ? (users[0] as { id?: string; email?: string }) : null

  if (listError) {
    console.error('Error checking auth user by email:', listError)
    // Fail open to registration rather than blocking
    return { status: 'new_or_pseudo' }
  }

  if (!hasExistingUser) {
    return { status: 'new_or_pseudo' }
  }

  // listUsers() does not filter by email (only page/perPage); it returns the first page of users.
  // Verify the returned user actually has the requested email before treating as existing.
  const actualEmail = (firstUser?.email ?? '').trim().toLowerCase()
  if (actualEmail !== normalizedEmail) {
    return { status: 'new_or_pseudo' }
  }

  // Auth user exists for this email – only treat as existing_user if they have at least one
  // non-pseudo human portfolio (verified account). Pseudo or no human portfolio → sign up flow.
  const userId = (users[0] as { id: string })?.id
  if (!userId) {
    return { status: 'new_or_pseudo' }
  }

  const { data: humanPortfolios, error: portfolioError } = await serviceClient
    .from('portfolios')
    .select('id, is_pseudo')
    .eq('type', 'human')
    .eq('user_id', userId)

  const hasNonPseudoHuman =
    Array.isArray(humanPortfolios) &&
    humanPortfolios.some((p) => (p as { is_pseudo?: boolean }).is_pseudo === false)

  if (portfolioError) {
    console.error('Error checking human portfolio for login:', portfolioError)
    return { status: 'new_or_pseudo' }
  }

  return { status: hasNonPseudoHuman ? 'existing_user' : 'new_or_pseudo' }
}

