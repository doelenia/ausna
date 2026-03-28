import { revalidatePath } from 'next/cache'

const HUMAN_EXTRAS = ['', '/friends', '/communities', '/pinned'] as const
const SPACE_EXTRAS = ['', '/members', '/pinned'] as const

/**
 * Revalidate Next.js cache for all URL shapes that might reference this portfolio
 * (id and optional slug; human and space prefixes; legacy /portfolio redirects).
 */
export function revalidatePortfolioPathsForIdAndSlug(portfolioId: string, slug?: string | null) {
  const segments = new Set<string>([portfolioId])
  if (slug && slug.trim()) segments.add(slug.trim())

  for (const seg of segments) {
    for (const extra of HUMAN_EXTRAS) {
      revalidatePath(`/human/${seg}${extra}`)
    }
    for (const extra of SPACE_EXTRAS) {
      revalidatePath(`/space/${seg}${extra}`)
    }
    revalidatePath(`/portfolio/${seg}`)
    revalidatePath(`/portfolio/${seg}/members`)
    revalidatePath(`/portfolio/${seg}/pinned`)
  }
}
