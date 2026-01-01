import { requireAuth } from '@/lib/auth/requireAuth'
import { checkAdmin } from '@/lib/auth/requireAdmin'
import { isValidPortfolioType } from '@/lib/portfolio/routes'
import { notFound, redirect } from 'next/navigation'
import { CreatePortfolioForm } from '@/components/portfolio/CreatePortfolioForm'

interface CreatePortfolioPageProps {
  params: {
    type: string
  }
}

export default async function CreatePortfolioPage({
  params,
}: CreatePortfolioPageProps) {
  await requireAuth()
  
  // Validate type directly (create page doesn't need id)
  // Only allow creating projects or communities
  if (!params.type || !isValidPortfolioType(params.type)) {
    notFound()
  }
  
  const normalizedType = params.type.toLowerCase()
  if (normalizedType !== 'projects' && normalizedType !== 'community') {
    notFound()
  }
  
  const type = normalizedType as 'projects' | 'community'

  // Check if user is admin for community creation
  if (type === 'community') {
    const adminUser = await checkAdmin()
    if (!adminUser) {
      redirect('/main')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-3xl font-bold mb-6">
            Create {type === 'projects' ? 'Project' : 'Community'} Portfolio
          </h1>
          <CreatePortfolioForm type={type} />
        </div>
      </div>
    </div>
  )
}

