import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeExternalLink } from '@/lib/portfolio/normalizeExternalLink'
import { DB_NON_HUMAN_TYPES } from '@/types/portfolio'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = request.nextUrl.searchParams.get('url')?.trim()
    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 })

    const normalizedLink = normalizeExternalLink(url)
    if (!normalizedLink) return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })

    const { data: portfolios, error } = await supabase
      .from('portfolios')
      .select('id, metadata, slug')
      .in('type', [...DB_NON_HUMAN_TYPES])

    if (error) return NextResponse.json({ error: 'Failed to search' }, { status: 500 })

    const existing = (portfolios || []).find((p: any) => {
      const props = p.metadata?.properties || {}
      if (props.external !== true) return false
      const storedLink = (props.external_link as string) || ''
      return storedLink && normalizeExternalLink(storedLink) === normalizedLink
    })

    if (!existing) return NextResponse.json({ existing: false })

    const basic = (existing.metadata as any)?.basic || {}
    return NextResponse.json({
      existing: true,
      portfolio: {
        id: existing.id,
        slug: existing.slug,
        name: basic.name || 'Portfolio',
        avatar: basic.avatar,
        emoji: basic.emoji,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

