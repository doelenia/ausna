import { getServerSessionUser } from '@/lib/auth/getServerSessionUser'
import { FeedView } from '@/components/main/FeedView'

export default async function MainPage({
  searchParams,
}: {
  searchParams?: { showOpenCalls?: string | string[] }
}) {
  const user = await getServerSessionUser()

  const raw = searchParams?.showOpenCalls
  const showOpenCalls =
    raw === '1' || (Array.isArray(raw) && raw.includes('1'))

  return (
    <FeedView currentUserId={user?.id} initialOpenCallsPopup={showOpenCalls} />
  )
}

