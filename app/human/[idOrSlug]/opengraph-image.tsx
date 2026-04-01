import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import { isHumanPortfolio } from '@/types/portfolio'

export const runtime = 'edge'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default async function Image({
  params,
}: {
  params: { idOrSlug: string }
}) {
  const supabase = await createClient()
  const portfolio = await loadPortfolioForPage(supabase, params.idOrSlug)

  const basic =
    portfolio && isHumanPortfolio(portfolio) ? getPortfolioBasic(portfolio) : null

  const name = basic?.name || 'Human'
  const avatar = basic?.avatar

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F9FAFB',
          position: 'relative',
        }}
      >
        {avatar ? (
          <img
            src={avatar}
            alt={name}
            width={630}
            height={630}
            style={{
              width: 630,
              height: 630,
              borderRadius: 315,
              objectFit: 'cover',
              border: '14px solid #FFFFFF',
              boxShadow:
                '0 20px 25px -5px rgba(0,0,0,0.10), 0 10px 10px -5px rgba(0,0,0,0.04)',
            }}
          />
        ) : (
          <div
            style={{
              width: 630,
              height: 630,
              borderRadius: 315,
              background: '#E5E7EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#111827',
              fontSize: 96,
              fontWeight: 700,
            }}
          >
            {(name || 'H').trim().slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
    ),
    size
  )
}

