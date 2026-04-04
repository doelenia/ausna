import { redirect } from 'next/navigation'
import { getServerSessionUser } from '@/lib/auth/getServerSessionUser'
import { Content } from '@/components/ui'
import { getExploreActivities } from './actions'
import { ExploreView } from '@/components/explore/ExploreView'
import { checkAdmin } from '@/lib/auth/requireAdmin'
import { buildLoginHref } from '@/lib/auth/login-redirect'

export default async function ExplorePage() {
  const user = await getServerSessionUser()

  if (!user) {
    redirect(buildLoginHref({ returnTo: '/explore' }))
  }

  const [activitiesResult, adminUser] = await Promise.all([
    getExploreActivities(user.id),
    checkAdmin(),
  ])

  if (!activitiesResult.success) {
    return (
      <div className="px-4 py-8">
        <Content className="text-gray-600">
          {activitiesResult.error ?? 'Failed to load activities. Please try again.'}
        </Content>
      </div>
    )
  }

  return (
    <ExploreView
      activities={activitiesResult.activities ?? []}
      userId={user.id}
      isAdmin={!!adminUser}
      dailyMatch={undefined}
    />
  )
}
