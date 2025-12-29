import { createClient } from '@/lib/supabase/server'
import { ClientAccountPage } from './client-wrapper'
import { ensureHumanPortfolio } from '@/lib/portfolio/human'

interface AccountPageProps {
  params: {
    id: string
  }
}

export default async function AccountPage({ params }: AccountPageProps) {
  const supabase = await createClient()
  
  // Try to get user and human portfolio server-side, but don't redirect if not found
  // Let the client component handle auth checking
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let humanPortfolio = null
  if (user && user.id === params.id) {
    try {
      // Ensure the user has a human portfolio (creates one if missing)
      humanPortfolio = await ensureHumanPortfolio(user.id)
    } catch (error) {
      console.error('Error fetching human portfolio:', error)
    }
  }

  return <ClientAccountPage userId={params.id} initialHumanPortfolio={humanPortfolio} />
}

