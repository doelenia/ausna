import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Portfolio } from '@/types/portfolio'

/**
 * Calculate similarity score between query and text
 * Simple string matching - higher score for exact matches and prefix matches
 */
function calculateSimilarity(query: string, text: string | null | undefined): number {
  if (!text) return 0
  
  const queryLower = query.toLowerCase().trim()
  const textLower = text.toLowerCase().trim()
  
  if (textLower === queryLower) return 100 // Exact match
  if (textLower.startsWith(queryLower)) return 80 // Prefix match
  if (textLower.includes(queryLower)) return 50 // Contains match
  
  // Check word-by-word matching
  const queryWords = queryLower.split(/\s+/)
  const textWords = textLower.split(/\s+/)
  let wordMatches = 0
  for (const qWord of queryWords) {
    if (textWords.some(tWord => tWord.startsWith(qWord) || tWord === qWord)) {
      wordMatches++
    }
  }
  if (wordMatches > 0) {
    return 30 + (wordMatches / queryWords.length) * 20
  }
  
  return 0
}

/**
 * GET /api/portfolios/search?q=query - Search portfolios by name/username
 * Public endpoint - no authentication required
 * 
 * Query params:
 *   - q: search query (optional - if not provided, returns initial results)
 *   - limit: number of results (default: 50)
 * 
 * Pseudo Portfolio Behavior:
 * - Portfolios with is_pseudo = true are automatically excluded from results for non-admin users
 * - This filtering happens at the database level via RLS policies
 * - Admin users will see all portfolios including pseudo ones
 * - No explicit filtering is needed in this code as RLS handles it automatically
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim() || ''
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    
    // Try to get current user (optional - for initial results)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    
    let portfolios: any[] = []
    
    if (!query) {
      // Initial results: show user-specific if logged in, otherwise recent/popular
      if (user) {
        // Get user's friends
        const { data: friendsData } = await supabase
          .from('friends')
          .select('user_id, friend_id')
          .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
          .eq('status', 'accepted')
        
        const friendIds = new Set<string>()
        if (friendsData) {
          friendsData.forEach((f: any) => {
            if (f.user_id === user.id) friendIds.add(f.friend_id)
            if (f.friend_id === user.id) friendIds.add(f.user_id)
          })
        }
        
        // Get human portfolios of friends
        // Note: RLS automatically excludes pseudo portfolios for non-admin users
        let friendPortfolios: any[] = []
        if (friendIds.size > 0) {
          const { data } = await supabase
            .from('portfolios')
            .select('*')
            .eq('type', 'human')
            .in('user_id', Array.from(friendIds))
            .limit(20)
          friendPortfolios = data || []
        }
        
        // Get projects/communities user is a member of
        // Note: RLS automatically excludes pseudo portfolios for non-admin users
        const { data: allPortfolios } = await supabase
          .from('portfolios')
          .select('*')
          .in('type', ['projects', 'community'])
          .limit(100)
        
        const userPortfolios = (allPortfolios || []).filter((p: any) => {
          const metadata = p.metadata as any
          const members = metadata?.members || []
          return Array.isArray(members) && members.includes(user.id)
        })
        
        portfolios = [
          ...(friendPortfolios || []),
          ...userPortfolios.slice(0, 20),
        ]
      } else {
        // For visitors: show recent portfolios
        // Note: RLS automatically excludes pseudo portfolios for non-admin users
        const { data: recentPortfolios } = await supabase
          .from('portfolios')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit)
        
        portfolios = recentPortfolios || []
      }
    } else {
      // Search mode: search by name and username
      const searchTerm = query.toLowerCase()
      
      // Fetch all portfolios and filter in JavaScript
      // This is necessary because Supabase doesn't support ilike on JSONB paths directly
      // Note: RLS policies automatically exclude pseudo portfolios (is_pseudo = true) for non-admin users
      // Admin users will see all portfolios including pseudo ones
      const { data: allPortfolios, error } = await supabase
        .from('portfolios')
        .select('*')
        .limit(limit * 3) // Fetch more to have buffer for filtering
      
      if (error) {
        console.error('Error searching portfolios:', error)
        return NextResponse.json(
          { error: 'Failed to search portfolios' },
          { status: 500 }
        )
      }
      
      // Filter and rank results by similarity
      portfolios = (allPortfolios || [])
        .filter((p: any) => {
          const metadata = p.metadata as any
          const basic = metadata?.basic || {}
          const name = (basic.name || '').toLowerCase()
          const description = (basic.description || '').toLowerCase()
          const username = ((metadata?.username || '') as string).toLowerCase()
          
          return (
            name.includes(searchTerm) ||
            description.includes(searchTerm) ||
            username.includes(searchTerm)
          )
        })
        .map((p: any) => {
          const metadata = p.metadata as any
          const basic = metadata?.basic || {}
          const name = basic.name || ''
          const username = metadata?.username || ''
          
          // Calculate similarity scores
          const nameScore = calculateSimilarity(query, name)
          const usernameScore = calculateSimilarity(query, username)
          
          // Use the higher score, with slight preference for name matches
          const score = Math.max(nameScore, usernameScore * 0.9)
          
          return { ...p, _searchScore: score }
        })
        .filter((p: any) => p._searchScore > 0) // Only include results with some match
        .sort((a: any, b: any) => b._searchScore - a._searchScore) // Sort by score descending
        .slice(0, limit) // Limit results
        .map((p: any) => {
          // Remove _searchScore before returning
          const { _searchScore, ...portfolio } = p
          return portfolio
        })
    }
    
    // Format results
    const results = portfolios.map((p: any) => {
      const metadata = p.metadata as any
      const basic = metadata?.basic || {}
      
      return {
        id: p.id,
        type: p.type,
        name: basic.name || '',
        description: basic.description || '',
        avatar: basic.avatar || null,
        emoji: basic.emoji || null,
        username: metadata?.username || null,
        projectType: metadata?.project_type_specific || null,
        user_id: p.user_id,
        created_at: p.created_at,
      }
    })
    
    return NextResponse.json({ results })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

