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
    portfolio && !isHumanPortfolio(portfolio) ? getPortfolioBasic(portfolio) : null

  const name = basic?.name || 'Space'
  const description = basic?.description || ''
  const avatar = basic?.avatar
  const emoji = (portfolio as any)?.metadata?.basic?.emoji as string | undefined

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          background: '#F9FAFB',
          padding: 72,
          gap: 56,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: 360,
            height: 360,
            borderRadius: 72,
            background: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow:
              '0 20px 25px -5px rgba(0,0,0,0.10), 0 10px 10px -5px rgba(0,0,0,0.04)',
            border: '1px solid #E5E7EB',
            overflow: 'hidden',
          }}
        >
          {avatar ? (
            <img
              src={avatar}
              alt={name}
              width={360}
              height={360}
              style={{ width: 360, height: 360, objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                fontSize: 200,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {emoji || '🪐'}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: '#111827',
              letterSpacing: -1.5,
              lineHeight: 1.05,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 500,
              color: '#374151',
              lineHeight: 1.3,
              display: 'block',
              overflow: 'hidden',
              maxHeight: 34 * 5 * 1.3,
            }}
          >
            {description}
          </div>
        </div>
      </div>
    ),
    size
  )
}

