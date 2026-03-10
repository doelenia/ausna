'use client'

import { Portfolio } from '@/types/portfolio'
import { PortfolioPreviewCard } from '@/components/portfolio/PortfolioPreviewCard'

interface PortfolioInvitationCardProps {
  portfolio: Portfolio
  isSent?: boolean
}

export function PortfolioInvitationCard({ portfolio, isSent = false }: PortfolioInvitationCardProps) {
  return <PortfolioPreviewCard portfolio={portfolio} isSent={isSent} />
}

