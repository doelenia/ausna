import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getHumanPortfolio } from '@/lib/portfolio/human'
import { redirect } from 'next/navigation'
import type { Portfolio } from '@/types/portfolio'
import { CreateNoteForm } from '@/components/notes/CreateNoteForm'
import { Folder } from 'lucide-react'
import { UIText } from '@/components/ui'

interface CreateResourcePageProps {
  searchParams: {
    portfolio?: string
  }
}

export default async function CreateResourcePage({ searchParams }: CreateResourcePageProps) {
  const { user } = await requireAuth()
  const supabase = await createClient()

  const humanPortfolio = await getHumanPortfolio(user.id)
  if (!humanPortfolio) redirect('/')

  let sourcePortfolio: Portfolio | null = null
  if (searchParams.portfolio) {
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', searchParams.portfolio)
      .in('type', ['projects', 'activities', 'community'])
      .single()

    if (!error && data) sourcePortfolio = data as Portfolio
  }

  if (searchParams.portfolio && !sourcePortfolio) {
    redirect('/space')
  }

  if (sourcePortfolio) {
    const { canCreateResourceInPortfolio } = await import('@/lib/notes/helpers')
    const canCreate = await canCreateResourceInPortfolio(sourcePortfolio.id, user.id)
    if (!canCreate) redirect('/space')
  }

  const portfolios: Portfolio[] = sourcePortfolio ? [sourcePortfolio] : []
  const defaultPortfolioIds: string[] = sourcePortfolio ? [sourcePortfolio.id] : []

  return (
    <div className="bg-white shadow rounded-lg p-6">
      {/* Top hint for this page */}
      <div className="flex items-center gap-2 mb-6">
        <Folder className="w-5 h-5 text-gray-600" strokeWidth={1.5} aria-hidden />
        <UIText as="span">Resource</UIText>
      </div>
      <CreateNoteForm
        portfolios={portfolios}
        defaultPortfolioIds={defaultPortfolioIds}
        humanPortfolioId={humanPortfolio.id}
        ownerPortfolio={humanPortfolio}
        currentUserId={user.id}
        redirectUrl="/main"
        isResource
      />
    </div>
  )
}

