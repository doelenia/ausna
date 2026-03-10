'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Portfolio } from '@/types/portfolio'
import { PortfolioPreviewCard } from '@/components/portfolio/PortfolioPreviewCard'

type MessagePortfolioCardProps = {
  portfolioType: Portfolio['type']
  portfolioIdentifier: string
  isSent: boolean
}

export function MessagePortfolioCard({ portfolioType, portfolioIdentifier, isSent }: MessagePortfolioCardProps) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        setLoading(true)
        setNotFound(false)
        const supabase = createClient()
        // Try by id first
        const { data: byId } = await supabase
          .from('portfolios')
          .select('*')
          .eq('id', portfolioIdentifier)
          .eq('type', portfolioType)
          .maybeSingle()
        if (cancelled) return
        if (byId) {
          setPortfolio(byId as Portfolio)
          return
        }

        // Fallback to slug
        const { data: bySlug } = await supabase
          .from('portfolios')
          .select('*')
          .eq('slug', portfolioIdentifier)
          .eq('type', portfolioType)
          .maybeSingle()
        if (cancelled) return
        if (!bySlug) {
          setNotFound(true)
          setPortfolio(null)
          return
        }
        setPortfolio(bySlug as Portfolio)
      } catch {
        if (!cancelled) {
          setNotFound(true)
          setPortfolio(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [portfolioIdentifier, portfolioType])

  if (loading) {
    return (
      <div className={`max-w-xs lg:max-w-md p-3 rounded-lg ${isSent ? 'bg-blue-50' : 'bg-gray-100'}`}>
        <p className="text-sm text-gray-500">Loading portfolio...</p>
      </div>
    )
  }

  if (notFound || !portfolio) {
    return (
      <div className={`max-w-xs lg:max-w-md p-3 rounded-lg border border-gray-300 ${isSent ? 'bg-blue-50' : 'bg-gray-100'}`}>
        <p className="text-sm text-gray-500 italic">Portfolio is no longer available</p>
      </div>
    )
  }

  return (
    <div className="max-w-xs lg:max-w-md">
      <PortfolioPreviewCard portfolio={portfolio} isSent={isSent} />
    </div>
  )
}

