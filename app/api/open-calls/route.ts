import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { Note } from '@/types/note'
import { enrichNotesWithAuthorProfiles } from '@/app/main/actions'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { getFeedOpenCallsForUserId } from '@/lib/open-calls/feedOpenCallsForUser'

type OpenCallsContext = 'feed' | 'human' | 'space'

/**
 * GET /api/open-calls
 * Query params:
 *   - context: 'feed' | 'human' | 'space' (legacy: portfolio → space)
 *   - portfolioId: required when context is 'human' or 'space'
 *   - limit: number (default 10)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawContext = searchParams.get('context')
    const normalized =
      rawContext === 'portfolio' ? 'space' : rawContext
    const context = normalized as OpenCallsContext | null
    const portfolioId = searchParams.get('portfolioId')
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    if (!context || !['feed', 'human', 'space'].includes(context)) {
      return NextResponse.json(
        { error: 'Invalid context. Must be "feed", "human", or "space"' },
        { status: 400 }
      )
    }

    if ((context === 'human' || context === 'space') && !portfolioId) {
      return NextResponse.json(
        { error: 'portfolioId is required for human and space context' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const now = new Date().toISOString()

    let openCalls: any[] = []

    if (context === 'feed') {
      if (user) {
        const result = await getFeedOpenCallsForUserId(supabase, user.id, {
          limit,
          unviewedOnly: false,
          poolFetchMultiplier: 5,
        })
        if (result.error) {
          console.error('[API open-calls] Query error:', result.error)
          return NextResponse.json(
            { error: result.error || 'Failed to fetch open calls' },
            { status: 500 }
          )
        }
        return NextResponse.json({
          openCalls: result.openCalls,
          hasMore: result.hasMore,
        })
      }

      // Logged-out: broad pool, no social visibility filter
      const { data: notes, error } = await supabase
        .from('notes')
        .select('*')
        .eq('type', 'open_call')
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .order('created_at', { ascending: false })
        .limit(limit * 5)

      if (error) {
        console.error('[API open-calls] Query error:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to fetch open calls' },
          { status: 500 }
        )
      }

      let candidateNotes: any[] = notes || []
      const nonExpired = candidateNotes.filter((note: any) => {
        const meta = note.metadata as any
        const endDate = meta?.end_date
        if (!endDate) return true
        return endDate > now
      })

      nonExpired.sort((a: any, b: any) => {
        const metaA = a.metadata as any
        const metaB = b.metadata as any
        const endA = metaA?.end_date ? new Date(metaA.end_date).getTime() : Infinity
        const endB = metaB?.end_date ? new Date(metaB.end_date).getTime() : Infinity
        return endA - endB
      })

      openCalls = nonExpired.slice(0, limit)
    } else if (context === 'human') {
      // Human: open calls created or collaborated by this person
      const { data: portfolio, error: portfolioError } = await supabase
        .from('portfolios')
        .select('user_id')
        .eq('id', portfolioId)
        .eq('type', 'human')
        .single()

      if (portfolioError || !portfolio) {
        return NextResponse.json(
          { error: 'Human portfolio not found' },
          { status: 404 }
        )
      }

      const userId = portfolio.user_id
      const poolSize = Math.max(limit * 3, 60)

      const [ownerRes, collabRes] = await Promise.all([
        supabase
          .from('notes')
          .select('*')
          .eq('type', 'open_call')
          .is('deleted_at', null)
          .is('mentioned_note_id', null)
          .eq('owner_account_id', userId)
          .order('created_at', { ascending: false })
          .limit(poolSize),
        supabase
          .from('notes')
          .select('*')
          .eq('type', 'open_call')
          .is('deleted_at', null)
          .is('mentioned_note_id', null)
          .contains('collaborator_account_ids', [userId])
          .order('created_at', { ascending: false })
          .limit(poolSize),
      ])

      const byId = new Map<string, any>()
      ;(ownerRes.data || []).forEach((n: any) => byId.set(n.id, n))
      ;(collabRes.data || []).forEach((n: any) => byId.set(n.id, n))
      const merged = Array.from(byId.values()).filter((note: any) => {
        const meta = note.metadata as any
        const endDate = meta?.end_date
        if (!endDate) return true
        return endDate > now
      })

      merged.sort((a: any, b: any) => {
        const metaA = a.metadata as any
        const metaB = b.metadata as any
        const viewedA =
          user?.id && Array.isArray(metaA?.viewed_by) && metaA.viewed_by.includes(user.id)
        const viewedB =
          user?.id && Array.isArray(metaB?.viewed_by) && metaB.viewed_by.includes(user.id)

        if (viewedA !== viewedB) {
          // Not viewed first
          return viewedA ? 1 : -1
        }

        const endA = metaA?.end_date ? new Date(metaA.end_date).getTime() : Infinity
        const endB = metaB?.end_date ? new Date(metaB.end_date).getTime() : Infinity
        // Earlier end date first; "forever" last
        return endA - endB
      })

      openCalls = merged.slice(0, limit)
    } else {
      // Portfolio (project/activity/community): assigned to this portfolio
      const { data: notes, error } = await supabase
        .from('notes')
        .select('*')
        .eq('type', 'open_call')
        .is('deleted_at', null)
        .is('mentioned_note_id', null)
        .contains('assigned_portfolios', [portfolioId])
        .order('created_at', { ascending: false })
        .limit(limit * 2)

      if (error) {
        console.error('[API open-calls] Query error:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to fetch open calls' },
          { status: 500 }
        )
      }

      const nonExpired = (notes || []).filter((note: any) => {
        const meta = note.metadata as any
        const endDate = meta?.end_date
        if (!endDate) return true
        return endDate > now
      })

      nonExpired.sort((a: any, b: any) => {
        const metaA = a.metadata as any
        const metaB = b.metadata as any
        const viewedA =
          user?.id && Array.isArray(metaA?.viewed_by) && metaA.viewed_by.includes(user.id)
        const viewedB =
          user?.id && Array.isArray(metaB?.viewed_by) && metaB.viewed_by.includes(user.id)

        if (viewedA !== viewedB) {
          // Not viewed first
          return viewedA ? 1 : -1
        }

        const endA = metaA?.end_date ? new Date(metaA.end_date).getTime() : Infinity
        const endB = metaB?.end_date ? new Date(metaB.end_date).getTime() : Infinity
        // Earlier end date first; "forever" last
        return endA - endB
      })


      openCalls = nonExpired.slice(0, limit)
    }

    const normalizedNotes: Note[] = openCalls.map((note: any) => ({
      ...note,
      references: Array.isArray(note.references) ? note.references : [],
    }))

    const enrichedNotes = await enrichNotesWithAuthorProfiles(
      normalizedNotes,
      supabase,
      user?.id
    )

    // Add first project name for preview badge (first non-human assigned portfolio)
    const portfolioIds = new Set<string>()
    enrichedNotes.forEach((n: any) => {
      if (Array.isArray(n.assigned_portfolios)) {
        n.assigned_portfolios.forEach((id: string) => portfolioIds.add(id))
      }
    })
    const portfolioIdList = Array.from(portfolioIds)
    let portfolioMap = new Map<string, string>()
    if (portfolioIdList.length > 0) {
      const { data: portfolios } = await supabase
        .from('portfolios')
        .select('id, type, metadata')
        .in('id', portfolioIdList)
      ;(portfolios || []).forEach((p: any) => {
        if (p.type !== 'human') {
          const basic = getPortfolioBasic(p)
          portfolioMap.set(p.id, basic.name)
        }
      })
    }
    const notesWithProjectName = enrichedNotes.map((n: any) => {
      const firstProjectId = Array.isArray(n.assigned_portfolios)
        ? n.assigned_portfolios.find((id: string) => portfolioMap.has(id))
        : undefined
      return {
        ...n,
        first_project_name: firstProjectId ? portfolioMap.get(firstProjectId) : undefined,
      }
    })

    return NextResponse.json({
      openCalls: notesWithProjectName,
      hasMore: openCalls.length >= limit,
    })
  } catch (error: any) {
    console.error('[API open-calls] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
