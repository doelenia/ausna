// Force dynamic rendering to ensure fresh auth state
export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { FeedView } from '@/components/main/FeedView'

export default async function MainPage({
  searchParams,
}: {
  searchParams?: { showOpenCalls?: string | string[] }
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const raw = searchParams?.showOpenCalls
  const showOpenCalls =
    raw === '1' || (Array.isArray(raw) && raw.includes('1'))

  return (
    <FeedView currentUserId={user?.id} initialOpenCallsPopup={showOpenCalls} />
  )
}

