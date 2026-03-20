'use server'

import { createServiceClient } from '@/lib/supabase/service'

export type CheckEmailStatusResult =
  | { status: 'existing_user' }
  | { status: 'new_user' }
  | { status: 'pseudo_activated'; message: string }

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
    return { status: 'new_user' }
  }

  const serviceClient = createServiceClient()

  // Check if an auth user already exists for this email by scanning auth users
  // and matching on email. listUsers() does not support an email filter.
  const authUser = await findAuthUserByEmailNormalized(serviceClient, normalizedEmail)

  if (!authUser) {
    return { status: 'new_user' }
  }

  // Auth user exists for this email.
  const userId = authUser.id
  if (!userId) {
    return { status: 'new_user' }
  }

  const { data: userHumanPortfolios, error: portfolioError } = await serviceClient
    .from('portfolios')
    .select('id, is_pseudo')
    .eq('type', 'human')
    .eq('user_id', userId)
    .limit(10)

  if (portfolioError) {
    console.error('Error checking human portfolio for login:', portfolioError)
    return { status: 'existing_user' }
  }

  const portfolios = (userHumanPortfolios ?? []) as Array<{ id: string; is_pseudo?: boolean | null }>
  const hasNonPseudoHuman = portfolios.some((p) => p.is_pseudo !== true)
  const pseudoHumanPortfolioIds = portfolios.filter((p) => p.is_pseudo === true).map((p) => p.id)

  if (hasNonPseudoHuman) {
    return { status: 'existing_user' }
  }

  if (pseudoHumanPortfolioIds.length > 0) {
    const { error: updatePseudoError } = await serviceClient
      .from('portfolios')
      .update({ is_pseudo: false })
      .in('id', pseudoHumanPortfolioIds)

    if (updatePseudoError) {
      console.error('Error converting pseudo portfolio to non-pseudo:', updatePseudoError)
      return { status: 'existing_user' }
    }

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
    const redirectTo = `${siteUrl}/reset-password`
    const { error: resetError } = await serviceClient.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    })

    if (resetError) {
      return { status: 'existing_user' }
    }

    return {
      status: 'pseudo_activated',
      message:
        'Your account already exists and is now activated. We sent a password reset email so you can set your password and sign in.',
    }
  }

  return { status: 'existing_user' }
}

