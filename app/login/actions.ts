'use server'

import { createServiceClient } from '@/lib/supabase/service'

export type CheckEmailStatusResult =
  | { status: 'existing_user' }
  | { status: 'new_or_pseudo' }

type AdminUserSummary = { id: string; email: string | null }

async function findAuthUserByEmailNormalized(
  serviceClient: ReturnType<typeof createServiceClient>,
  normalizedEmail: string
): Promise<AdminUserSummary | null> {
  const perPage = 100
  let page = 1

  // Paginate through auth users until we either find a matching email or exhaust results.
  // Supabase auth.admin.listUsers only supports page/perPage, so we must filter client-side.
  // Limit to a reasonable number of pages to avoid unbounded scans.
  while (true) {
    const { data: listResult, error: listError } = await serviceClient.auth.admin.listUsers({
      page,
      perPage,
    } as any)

    const users = (listResult as any)?.users as
      | { id?: string; email?: string | null }[]
      | undefined
    const hasUsers = Array.isArray(users) && users.length > 0

    if (listError) {
      console.error('Error listing auth users for email lookup:', listError)
      return null
    }

    if (!hasUsers) {
      break
    }

    const match = users.find((u) => {
      const email = (u.email ?? '').trim().toLowerCase()
      return email === normalizedEmail
    })

    if (match && match.id) {
      return { id: match.id, email: match.email ?? null }
    }

    if (users.length < perPage || page >= 10) {
      break
    }

    page += 1
  }

  return null
}

export async function checkEmailStatus(email: string): Promise<CheckEmailStatusResult> {
  const normalizedEmail = email.trim().toLowerCase()

  if (!normalizedEmail) {
    return { status: 'new_or_pseudo' }
  }

  const serviceClient = createServiceClient()

  // Check if an auth user already exists for this email by scanning auth users
  // and matching on email. listUsers() does not support an email filter.
  const authUser = await findAuthUserByEmailNormalized(serviceClient, normalizedEmail)

  if (!authUser) {
    return { status: 'new_or_pseudo' }
  }

  // Auth user exists for this email – only treat as existing_user if they have at least one
  // non-pseudo human portfolio (verified account). Pseudo or no human portfolio → sign up flow.
  const userId = authUser.id
  if (!userId) {
    return { status: 'new_or_pseudo' }
  }

  const { data: humanPortfolios, error: portfolioError } = await serviceClient
    .from('portfolios')
    .select('id, is_pseudo, metadata')
    .eq('type', 'human')
    .limit(200)

  const isPseudoValues = Array.isArray(humanPortfolios)
    ? (humanPortfolios as { is_pseudo?: boolean; metadata?: any }[]).map((p) => p.is_pseudo)
    : []

  // Determine non-pseudo status based on human portfolio where metadata.email matches this email.
  const hasNonPseudoHuman =
    Array.isArray(humanPortfolios) &&
    (humanPortfolios as { is_pseudo?: boolean; metadata?: any }[]).some((p) => {
      if (p.is_pseudo) return false
      const metadata = (p.metadata || {}) as any
      const emailMeta = (metadata.email as string | undefined)?.toLowerCase() || ''
      return emailMeta === normalizedEmail
    })

  if (portfolioError) {
    console.error('Error checking human portfolio for login:', portfolioError)
    return { status: 'new_or_pseudo' }
  }

  const status: CheckEmailStatusResult['status'] = hasNonPseudoHuman ? 'existing_user' : 'new_or_pseudo'

  return { status }
}

