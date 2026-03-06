/**
 * Auth admin helpers (service role). listUsers() does not support email filter;
 * we paginate and filter client-side to find a user by email.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function findAuthUserIdByEmail(
  serviceClient: SupabaseClient,
  normalizedEmail: string
): Promise<string | null> {
  const perPage = 100
  let page = 1

  while (true) {
    const { data: listResult, error: listError } =
      await serviceClient.auth.admin.listUsers({ page, perPage } as any)

    if (listError) {
      console.error('Error listing auth users for email lookup:', listError)
      return null
    }

    const users = (listResult as any)?.users as
      | { id?: string; email?: string | null }[]
      | undefined
    const hasUsers = Array.isArray(users) && users.length > 0

    if (!hasUsers) break

    const match = users.find((u) => {
      const email = (u.email ?? '').trim().toLowerCase()
      return email === normalizedEmail
    })

    if (match?.id) return match.id

    if (users.length < perPage || page >= 10) break
    page += 1
  }

  return null
}
