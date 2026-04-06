import { redirect } from 'next/navigation'
import { getServerSessionUser } from '@/lib/auth/getServerSessionUser'
import { buildLoginHref } from '@/lib/auth/login-redirect'
import { SpacesDirectoryView } from '@/components/spaces/SpacesDirectoryView'

export default async function SpacesPage() {
  const user = await getServerSessionUser()

  if (!user) {
    redirect(buildLoginHref({ returnTo: '/spaces' }))
  }

  return <SpacesDirectoryView currentUserId={user.id} />
}
