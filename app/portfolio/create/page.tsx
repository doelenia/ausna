import { permanentRedirect } from 'next/navigation'

/** @deprecated Use `/space/create`. */
export default function LegacyCreatePortfolioRedirect() {
  permanentRedirect('/space/create')
}
