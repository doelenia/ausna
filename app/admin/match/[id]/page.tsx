import { requireAdmin } from '@/lib/auth/requireAdmin'
import { MatchConsole } from '@/components/admin/MatchConsole'
import { getMatchData } from '@/app/admin/actions'
import { notFound } from 'next/navigation'

interface MatchPageProps {
  params: {
    id: string
  }
}

export default async function MatchPage({ params }: MatchPageProps) {
  try {
    await requireAdmin()
    
    const { id } = params
    if (!id) {
      notFound()
    }

    const result = await getMatchData(id)

    if (!result.success || !result.user) {
      console.error('Match data fetch failed:', result.error)
      notFound()
    }

    return (
      <MatchConsole
        user={result.user}
        humanPortfolio={result.humanPortfolio}
        projects={result.projects || []}
        notes={result.notes || []}
      />
    )
  } catch (error) {
    console.error('Match page error:', error)
    notFound()
  }
}

