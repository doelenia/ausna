import { permanentRedirect } from 'next/navigation'

/** @deprecated Use `/space` and `/human` indexes. */
export default function LegacyPortfolioIndexRedirect() {
  permanentRedirect('/space')
}
