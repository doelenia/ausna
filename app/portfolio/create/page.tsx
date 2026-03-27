import { requireAuth } from '@/lib/auth/requireAuth'
import { Title } from '@/components/ui'
import { CreateActivityForm } from '@/components/portfolio/CreateActivityForm'

export default async function CreatePortfolioPage() {
  await requireAuth()

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <Title as="h1" className="mb-6">
        Create Portfolio
      </Title>
      <CreateActivityForm targetType="projects" mode="portfolio" />
    </div>
  )
}

