// Force dynamic rendering to ensure fresh auth state
export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { FeedView } from '@/components/main/FeedView'

export default async function MainPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return <FeedView currentUserId={user?.id} />
}

