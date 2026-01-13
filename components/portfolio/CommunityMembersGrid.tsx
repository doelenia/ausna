'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserAvatar } from '@/components/ui'
import { Content, UIText } from '@/components/ui'
import Link from 'next/link'
import { Crown, Shield } from 'lucide-react'

interface CommunityMember {
  id: string
  portfolioId: string | null
  name: string | null
  avatar: string | null
  username: string | null
  isCreator: boolean
  isManager: boolean
  role: string | null
  description?: string | null
}

interface CommunityMembersGridProps {
  portfolioId: string
  creatorId: string
  managers: string[]
  members: string[]
  memberRoles?: { [userId: string]: string }
  currentUserId?: string
}

export function CommunityMembersGrid({
  portfolioId,
  creatorId,
  managers,
  members,
  memberRoles = {},
  currentUserId,
}: CommunityMembersGridProps) {
  const [allMembers, setAllMembers] = useState<CommunityMember[]>([])
  const [displayedMembers, setDisplayedMembers] = useState<CommunityMember[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const supabase = createClient()
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const INITIAL_LOAD = 20

  // Combine all member IDs: creator, managers, members
  const allMemberIds = useRef<string[]>([])
  
  useEffect(() => {
    const uniqueIds = new Set<string>()
    uniqueIds.add(creatorId)
    managers.forEach(id => uniqueIds.add(id))
    members.forEach(id => uniqueIds.add(id))
    allMemberIds.current = Array.from(uniqueIds)
  }, [creatorId, managers, members])

  // Fetch member details
  useEffect(() => {
    const fetchMembers = async () => {
      if (allMemberIds.current.length === 0) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        // Fetch human portfolios for all members
        const { data: memberPortfolios } = await supabase
          .from('portfolios')
          .select('id, user_id, metadata')
          .eq('type', 'human')
          .in('user_id', allMemberIds.current)

        const memberMap = new Map<string, any>()
        if (memberPortfolios) {
          memberPortfolios.forEach((p: any) => {
            memberMap.set(p.user_id, p)
          })
        }

        // Build member list with roles
        const membersList: CommunityMember[] = allMemberIds.current.map((memberId) => {
          const portfolio = memberMap.get(memberId)
          const isCreator = memberId === creatorId
          const isManager = managers.includes(memberId)
          // Get custom role from community portfolio's memberRoles
          const customRole = memberRoles[memberId] || null
          
          if (portfolio) {
            const metadata = portfolio.metadata as any
            const basic = metadata?.basic || {}
            return {
              id: memberId,
              portfolioId: portfolio.id || null,
              name: basic.name || metadata?.username || null,
              avatar: basic.avatar || metadata?.avatar_url || null,
              username: metadata?.username || null,
              isCreator,
              isManager,
              role: customRole,
              description: basic.description || null,
            }
          }
          
          return {
            id: memberId,
            portfolioId: null,
            name: null,
            avatar: null,
            username: null,
            isCreator,
            isManager,
            role: customRole,
            description: null,
          }
        })

        // Sort: creator first, then managers, then members, current user first in each group
        membersList.sort((a, b) => {
          // Current user first
          if (currentUserId) {
            if (a.id === currentUserId && b.id !== currentUserId) return -1
            if (b.id === currentUserId && a.id !== currentUserId) return 1
          }
          
          // Creator first
          if (a.isCreator && !b.isCreator) return -1
          if (b.isCreator && !a.isCreator) return 1
          
          // Managers before members
          if (a.isManager && !b.isManager) return -1
          if (b.isManager && !a.isManager) return 1
          
          return 0
        })

        setAllMembers(membersList)
        setDisplayedMembers(membersList.slice(0, INITIAL_LOAD))
        setHasMore(membersList.length > INITIAL_LOAD)
      } catch (error) {
        console.error('Failed to fetch members:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMembers()
  }, [portfolioId, creatorId, managers, members, supabase, currentUserId])

  // Intersection observer for infinite scroll
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return

    setLoadingMore(true)
    const currentCount = displayedMembers.length
    const nextCount = Math.min(currentCount + 20, allMembers.length)
    
    setTimeout(() => {
      setDisplayedMembers(allMembers.slice(0, nextCount))
      setHasMore(nextCount < allMembers.length)
      setLoadingMore(false)
    }, 100)
  }, [displayedMembers.length, allMembers, loadingMore, hasMore])

  useEffect(() => {
    if (!loadMoreRef.current) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    observerRef.current.observe(loadMoreRef.current)

    return () => {
      if (observerRef.current && loadMoreRef.current) {
        observerRef.current.unobserve(loadMoreRef.current)
      }
    }
  }, [hasMore, loadingMore, loadMore])

  // Get role text (custom role takes priority, then creator/manager/member)
  const getRoleText = (member: CommunityMember): string | null => {
    // Custom assigned role takes priority
    if (member.role) {
      return member.role
    }
    // Fallback to default roles
    if (member.isCreator) {
      return 'Creator'
    }
    if (member.isManager) {
      return 'Manager'
    }
    return 'Member'
  }

  // Get description text
  const getDescriptionText = (member: CommunityMember): string | null => {
    return member.description || null
  }

  if (loading) {
    return (
      <div className="py-8">
        <UIText className="text-gray-500">Loading members...</UIText>
      </div>
    )
  }

  if (allMembers.length === 0) {
    return (
      <div className="py-8">
        <UIText className="text-gray-500">No members yet</UIText>
      </div>
    )
  }

  return (
    <div className="mt-4">
      {/* Responsive grid - adjusts columns based on container width, wider tiles for more description */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {displayedMembers.map((member) => (
          <Link
            key={member.id}
            href={`/portfolio/human/${member.id}`}
            className="flex flex-col items-center rounded-2xl px-4 pt-4 pb-5 transition-colors hover:bg-gray-100"
          >
            <div className="flex flex-col items-center gap-3 w-full">
              {/* Avatar with role icons */}
              <div className="relative">
                <UserAvatar
                  userId={member.id}
                  name={member.name}
                  avatar={member.avatar}
                  size={96}
                  showLink={false}
                />
                {/* Creator icon (yellow king) */}
                {member.isCreator && (
                  <div className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-1 flex items-center justify-center">
                    <Crown className="w-4 h-4 text-white" strokeWidth={2.5} fill="currentColor" />
                  </div>
                )}
                {/* Manager icon (purple shield) - only if not creator */}
                {member.isManager && !member.isCreator && (
                  <div className="absolute -top-1 -right-1 bg-purple-500 rounded-full p-1 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-white" strokeWidth={2.5} fill="currentColor" />
                  </div>
                )}
              </div>
              
              {/* Text content */}
              <div className="flex flex-col items-center gap-1.5 w-full">
                {/* First line: Name */}
                <Content
                  className="text-center w-full line-clamp-2"
                  title={member.name || 'Unknown'}
                >
                  {member.name || 'Unknown'}
                </Content>
                
                {/* Second line: Role in gray tag */}
                {getRoleText(member) && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">
                    {getRoleText(member)}
                  </span>
                )}
                
                {/* Third line: Description */}
                {getDescriptionText(member) && (
                  <UIText className="text-center w-full line-clamp-2 text-gray-500 text-xs">
                    {getDescriptionText(member)}
                  </UIText>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
      
      {/* Load more trigger */}
      {hasMore && (
        <div ref={loadMoreRef} className="h-4 mt-4">
          {loadingMore && (
            <UIText className="text-center text-gray-500">Loading more...</UIText>
          )}
        </div>
      )}
    </div>
  )
}

