import { requireAuth } from '@/lib/auth/requireAuth'
import { checkAdmin } from '@/lib/auth/requireAdmin'
import { isValidPortfolioType } from '@/lib/portfolio/routes'
import { notFound, redirect } from 'next/navigation'
import { CreatePortfolioForm } from '@/components/portfolio/CreatePortfolioForm'
import { CreateActivityForm } from '@/components/portfolio/CreateActivityForm'
import { Title } from '@/components/ui'

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
  if (!params.type || !isValidPortfolioType(params.type)) {
    notFound()
  }
  
  const normalizedType = params.type.toLowerCase()
  if (normalizedType !== 'projects' && normalizedType !== 'community' && normalizedType !== 'activities') {
    notFound()
  }
  
  const type = normalizedType as 'projects' | 'community' | 'activities'

  // Check if user is admin for community creation
  if (type === 'community') {
    const adminUser = await checkAdmin()
    if (!adminUser) {
      redirect('/main')
    }
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <Title as="h1" className="mb-6">
        {type === 'projects' && 'Create Project Portfolio'}
        {type === 'community' && 'Create Community Portfolio'}
        {type === 'activities' && 'Create Activity'}
      </Title>
      {type === 'activities' ? (
        <CreateActivityForm />
      ) : (
        <CreatePortfolioForm type={type} />
      )}
    </div>
  )
}

