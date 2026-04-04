import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Deduplicates auth.getUser() within a single RSC render (layout + page, etc.).
 */
export const getServerSessionUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})
