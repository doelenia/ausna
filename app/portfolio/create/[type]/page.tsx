import { requireAuth } from '@/lib/auth/requireAuth'
import { redirect } from 'next/navigation'

interface CreatePortfolioPageProps {
  params: {
    type: string
  }
}

export default async function CreatePortfolioPage({
}: CreatePortfolioPageProps) {
  await requireAuth()

  // Compatibility redirect: creation is now unified at /portfolio/create
  redirect('/portfolio/create')
}

