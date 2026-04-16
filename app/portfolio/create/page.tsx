import { permanentRedirect } from 'next/navigation'

/** @deprecated Use the Create Space popup (redirect to `/spaces`). */
export default function LegacyCreatePortfolioRedirect() {
  permanentRedirect('/spaces')
}
