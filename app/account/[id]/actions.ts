'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { buildLoginHref } from '@/lib/auth/login-redirect'

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect(buildLoginHref({ returnTo: '/main' }))
}


