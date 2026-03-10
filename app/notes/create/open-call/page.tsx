import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getHumanPortfolio } from '@/lib/portfolio/human'
import { Portfolio } from '@/types/portfolio'
import { CreateNoteForm } from '@/components/notes/CreateNoteForm'
import { redirect } from 'next/navigation'

interface CreateOpenCallPageProps {
  searchParams: {
    portfolio?: string
  }
}

export default async function CreateOpenCallPage({ searchParams }: CreateOpenCallPageProps) {
  const { user } = await requireAuth()
  const supabase = await createClient()

  const humanPortfolio = await getHumanPortfolio(user.id)
  if (!humanPortfolio) {
    redirect('/')
  }

  let sourcePortfolio: Portfolio | null = null
  if (searchParams.portfolio) {
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', searchParams.portfolio)
      .in('type', ['projects', 'activities', 'community'])
      .single()

    if (!error && data) {
      sourcePortfolio = data as Portfolio
    }
  }

  if (searchParams.portfolio && !sourcePortfolio) {
    redirect('/portfolio')
  }

  if (sourcePortfolio) {
    const { isPortfolioMember } = await import('@/lib/notes/helpers')
    const isMember = await isPortfolioMember(sourcePortfolio.id, user.id)
    if (!isMember) {
      redirect('/portfolio')
    }
  }

  const portfolios: Portfolio[] = sourcePortfolio ? [sourcePortfolio] : []
  const defaultPortfolioIds: string[] = sourcePortfolio ? [sourcePortfolio.id] : []

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <CreateNoteForm
        portfolios={portfolios}
        defaultPortfolioIds={defaultPortfolioIds}
        humanPortfolioId={humanPortfolio.id}
        ownerPortfolio={humanPortfolio}
        currentUserId={user.id}
        redirectUrl="/main"
        isOpenCall
      />
    </div>
  )
}
