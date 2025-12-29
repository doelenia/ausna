'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { createClient } from '@/lib/supabase/client'
import { Portfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/utils'

interface HostInfo {
  id: string
  name: string
  avatar?: string
  type: 'human' | 'projects' | 'discussion'
}

interface HostsDisplayProps {
  hostIds: string[]
}

export function HostsDisplay({ hostIds }: HostsDisplayProps) {
  const [hosts, setHosts] = useState<HostInfo[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchHosts = async () => {
      if (hostIds.length === 0) {
        setLoading(false)
        return
      }

      try {
        // Fetch all host portfolios
        const { data: portfolios, error } = await supabase
          .from('portfolios')
          .select('id, type, metadata')
          .in('id', hostIds)

        if (error) {
          console.error('Error fetching hosts:', error)
          setLoading(false)
          return
        }

        // Map to host info with name and avatar
        const hostInfos: HostInfo[] = (portfolios || [])
          .map((p: any) => {
            const portfolio = p as Portfolio
            const basic = getPortfolioBasic(portfolio)
            return {
              id: portfolio.id,
              name: basic.name,
              avatar: basic.avatar,
              type: portfolio.type,
            }
          })
          .filter((h) => h.id) // Filter out any invalid entries

        setHosts(hostInfos)
      } catch (err) {
        console.error('Error fetching hosts:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchHosts()
  }, [hostIds, supabase])

  if (loading) {
    return (
      <div className="mb-6">
        <h2 className="text-lg font-medium text-gray-900 mb-3">Hosted By</h2>
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      </div>
    )
  }

  if (hosts.length === 0) {
    return null
  }

  return (
    <div className="mb-6">
      <h2 className="text-lg font-medium text-gray-900 mb-3">Hosted By</h2>
      <div className="flex flex-wrap gap-2">
        {hosts.map((host) => (
          <Link
            key={host.id}
            href={getPortfolioUrl(host.type, host.id)}
            className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm hover:bg-blue-200 transition-colors"
          >
            {host.avatar ? (
              <img
                src={host.avatar}
                alt={host.name}
                className="w-6 h-6 rounded-full object-cover"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-blue-300 flex items-center justify-center flex-shrink-0">
                <svg
                  className="h-4 w-4 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
            )}
            <span>{host.name}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

