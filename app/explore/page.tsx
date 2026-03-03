export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Content } from '@/components/ui'
import { getExploreActivities, getStoredDailyExploreMatch } from './actions'
import { ExploreView } from '@/components/explore/ExploreView'
import { checkAdmin } from '@/lib/auth/requireAdmin'

export default async function ExplorePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [activitiesResult, dailyMatchResult, adminUser] = await Promise.all([
    getExploreActivities(user.id),
    getStoredDailyExploreMatch(user.id),
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
      dailyMatch={
        dailyMatchResult.success && dailyMatchResult.activities.length > 0
          ? {
              introText: dailyMatchResult.introText,
              activities: dailyMatchResult.activities,
              ranAt: dailyMatchResult.ranAt,
              patternPath: dailyMatchResult.patternPath ?? null,
            }
          : undefined
      }
    />
  )
}
