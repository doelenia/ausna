export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Content } from '@/components/ui'
import { getExploreActivities } from './actions'
import { ExploreView } from '@/components/explore/ExploreView'

export default async function ExplorePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const result = await getExploreActivities(user.id)

  if (!result.success) {
    return (
      <div className="px-4 py-8">
        <Content className="text-gray-600">
          {result.error ?? 'Failed to load activities. Please try again.'}
        </Content>
      </div>
    )
  }

  return <ExploreView activities={result.activities ?? []} />
}
