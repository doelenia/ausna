import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { isValidPortfolioType } from '@/lib/portfolio/routes'
import { isPortfolioOwner } from '@/lib/portfolio/helpers'
import { redirect, notFound } from 'next/navigation'
import { CreatePortfolioForm } from '@/components/portfolio/CreatePortfolioForm'

interface CreatePortfolioPageProps {
  params: {
    type: string
  }
  searchParams: {
    from?: string
  }
}

export default async function CreatePortfolioPage({
  params,
  searchParams,
}: CreatePortfolioPageProps) {
  const { user } = await requireAuth()
  
  // Validate type directly (create page doesn't need id)
  // Only allow creating projects or discussions
  if (!params.type || !isValidPortfolioType(params.type)) {
    notFound()
  }
  
  const normalizedType = params.type.toLowerCase()
  if (normalizedType !== 'projects' && normalizedType !== 'discussion') {
    notFound()
  }
  
  const type = normalizedType as 'projects' | 'discussion'

  const supabase = await createClient()
  let fromPortfolio = null

  // If from query param exists, validate ownership
  if (searchParams.from) {
    const isOwner = await isPortfolioOwner(searchParams.from, user.id)
    if (!isOwner) {
      redirect('/portfolio')
    }

    // Fetch the portfolio to pass to form
    const { data } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', searchParams.from)
      .maybeSingle()

    if (data) {
      fromPortfolio = data
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-3xl font-bold mb-6">
            Create {type === 'projects' ? 'Project' : 'Discussion'} Portfolio
          </h1>
          <CreatePortfolioForm type={type} fromPortfolioId={searchParams.from} />
        </div>
      </div>
    </div>
  )
}

