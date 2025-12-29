import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ensureHumanPortfolio } from '@/lib/portfolio/human'

export async function UserAvatar() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Get user's human portfolio
  let humanPortfolio = null
  try {
    humanPortfolio = await ensureHumanPortfolio(user.id)
  } catch (error) {
    console.error('Error loading human portfolio:', error)
  }

  const metadata = humanPortfolio?.metadata as any
  const basic = metadata?.basic || {}
  const username = metadata?.username || basic.name
  const avatarUrl = basic?.avatar || metadata?.avatar_url
  const displayName = username || user.email?.split('@')[0] || 'User'
  const finalAvatarUrl = avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`

  // Link to human portfolio instead of account page
  const humanPortfolioUrl = humanPortfolio 
    ? `/portfolio/human/${humanPortfolio.id}`
    : `/portfolio/human/${user.id}`

  return (
    <Link
      href={humanPortfolioUrl}
      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
    >
      <img
        src={finalAvatarUrl}
        alt={displayName}
        className="h-8 w-8 rounded-full border-2 border-gray-300"
      />
      <span className="text-sm font-medium text-gray-700 hidden sm:inline">
        {username ? `@${username}` : displayName}
      </span>
    </Link>
  )
}

