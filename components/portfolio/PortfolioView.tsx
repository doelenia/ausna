'use client'

import { Portfolio, isProjectPortfolio, isCommunityPortfolio, isHumanPortfolio, isActivityPortfolio, ActivityCallToJoinConfig } from '@/types/portfolio'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import Link from 'next/link'
import { PortfolioEditor } from './PortfolioEditor'
import { NotesFeed } from './NotesFeed'
import { PortfolioActions } from './PortfolioActions'
import { StickerAvatar } from './StickerAvatar'
import { DescriptionViewerPopup } from './DescriptionPopups'
import { ImageViewerPopup } from './ImageViewerPopup'
import { CommunityMembersGrid } from './CommunityMembersGrid'
import { OpenCallStack } from '@/components/notes/OpenCallStack'
import { Topic } from '@/types/indexing'
import { useState, useEffect, useRef, useMemo } from 'react'
import { deletePortfolio, getSubPortfolios, applyToActivityCallToJoin, updateActivityCallToJoin, getPendingJoinRequestsCount, applyToCommunityJoin } from '@/app/portfolio/[type]/[id]/actions'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getSharedAuth } from '@/lib/auth/browser-auth'
import { Button, Title, Content, UIText, UserAvatar, Card } from '@/components/ui'
import { Apple, Balloon, ChevronRight, Lock, Megaphone, Timer, History } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import type { ActivityDateTimeValue } from '@/lib/datetime'
import type { ActivityLocationValue } from '@/lib/location'
import { formatActivityRange, getActivityIconParts } from '@/lib/formatActivityDateTime'
import { isActivityLive } from '@/lib/activityLive'
import { isCallToJoinWindowOpen } from '@/lib/callToJoin'
import { ActivityDateTimeBadge } from './ActivityDateTimeBadge'
import { ActivityLocationBadge } from './ActivityLocationBadge'
import { ActivityLinkBadge } from './ActivityLinkBadge'
import { FeedView } from '@/components/main/FeedView'
import { ExploreView } from '@/components/explore/ExploreView'
import type { ExploreActivity } from '@/app/explore/actions'

interface PortfolioViewProps {
  portfolio: Portfolio
  basic: {
    name: string
    description?: string
    avatar?: string
  }
  isOwner: boolean
  currentUserId?: string
  topInterests?: Array<{ topic: Topic; memory_score: number; aggregate_score: number }>
  isAdmin?: boolean
  /** When true, current user has applied and request is pending; show "under review" instead of description + Apply */
  hasPendingApplication?: boolean
  /** When true, current user has a pending community join request; show "under review" for community */
  hasPendingCommunityApplication?: boolean
}

export function PortfolioView({ portfolio, basic, isOwner: serverIsOwner, currentUserId, topInterests = [], isAdmin = false, hasPendingApplication = false, hasPendingCommunityApplication = false }: PortfolioViewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDescriptionPopup, setShowDescriptionPopup] = useState(false)
  const [showAvatarPopup, setShowAvatarPopup] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [isManager, setIsManager] = useState(false)
  const [isMember, setIsMember] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [projects, setProjects] = useState<Array<{ id: string; name: string; avatar?: string; emoji?: string; role?: string; projectType?: string | null; visibility?: 'public' | 'private' }>>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [memberAvatars, setMemberAvatars] = useState<Array<{ id: string; avatar?: string; name?: string }>>([])
  const [memberAvatarsLoading, setMemberAvatarsLoading] = useState(false)
  const [friends, setFriends] = useState<Array<{ id: string; avatar?: string; name?: string }>>([])
  const [friendsLoading, setFriendsLoading] = useState(false)
  const [totalMutualFriends, setTotalMutualFriends] = useState<number>(0)
  const [communities, setCommunities] = useState<Array<{ id: string; name?: string; avatar?: string; emoji?: string }>>([])
  const [communitiesLoading, setCommunitiesLoading] = useState(false)
  const [totalMutualCommunities, setTotalMutualCommunities] = useState<number>(0)
  const involvementScrollRef = useRef<HTMLDivElement | null>(null)
  const activitiesScrollRef = useRef<HTMLDivElement | null>(null)
  const [activities, setActivities] = useState<
    Array<{ id: string; name: string; avatar?: string; emoji?: string; hostProjectName?: string | null }>
  >([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)
  const [activityHostProjects, setActivityHostProjects] = useState<Array<{ id: string; name: string; avatar?: string; emoji?: string }>>([])
  const [activityHostCommunities, setActivityHostCommunities] = useState<Array<{ id: string; name: string; avatar?: string; emoji?: string }>>([])
  const [pendingJoinRequestsCount, setPendingJoinRequestsCount] = useState<number | null>(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  
  // Determine if user can create notes (for projects/communities, user must be owner or member)
  const canCreateNote =
    (isProjectPortfolio(portfolio) || isCommunityPortfolio(portfolio)) &&
    (isOwner || isMember)

  // Double-check ownership and authentication on client side
  // This ensures ownership is detected even if server-side check had issues
  // CRITICAL: Don't show buttons until auth is verified
  useEffect(() => {
    let isMounted = true
    
    const checkOwnership = async () => {
      try {
        // Use app-wide shared auth so only one auth call runs (fixes Safari serialization timeouts)
        const authTimeout = 15000 // 15s to allow shared auth flow to complete
        const authPromise = getSharedAuth()
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Auth check timeout')), authTimeout)
        )
        const auth = await Promise.race([authPromise, timeoutPromise])
        const user = auth?.user ?? null

        if (!isMounted) return
        
        if (!user) {
          setIsAuthenticated(false)
          setIsOwner(false)
          setAuthChecked(true)
          return
        }
        
        setIsAuthenticated(true)
        
        // Compare directly with portfolio.user_id
        const clientIsOwner = portfolio.user_id === user.id
        // Only trust server check if it matches client check, otherwise use client check
        setIsOwner(clientIsOwner && (serverIsOwner || clientIsOwner))
        
        // Check if user is a manager or member (for project/community/activity portfolios)
        if (isProjectPortfolio(portfolio) || isCommunityPortfolio(portfolio) || isActivityPortfolio(portfolio)) {
          const metadata = portfolio.metadata as any
          const managers = metadata?.managers || []
          const members = metadata?.members || []
          
          setIsManager(Array.isArray(managers) && managers.includes(user.id))
          setIsMember(Array.isArray(members) && members.includes(user.id))
        } else {
          setIsManager(false)
          setIsMember(false)
        }
      } catch (err) {
        if (!isMounted) return
        console.error('Error checking authentication:', err)
        setIsAuthenticated(false)
        setIsOwner(false)
        setIsManager(false)
        setIsMember(false)
      } finally {
        if (isMounted) {
          setAuthChecked(true)
        }
      }
    }

    checkOwnership()
    
    // Listen for auth state changes to update UI in real-time
    // This ensures buttons hide/show immediately when auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      if (event === 'SIGNED_OUT' || !session) {
        setIsAuthenticated(false)
        setIsOwner(false)
        setIsManager(false)
        setIsMember(false)
        setAuthChecked(true)
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Re-check ownership when user signs in or token is refreshed
        checkOwnership()
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [portfolio.user_id, serverIsOwner]) // Removed supabase dependency - it's now memoized and stable

  // Fetch projects for human portfolios (for all visitors)
  // Note: Projects should be visible to all visitors, not just authenticated users
  // Auth check is only needed for the "Create Project" button, not for fetching projects
  useEffect(() => {
    const fetchProjects = async () => {
      if (!isHumanPortfolio(portfolio)) {
        return
      }

      setProjectsLoading(true)
      try {
        const result = await getSubPortfolios(portfolio.id)
        if (result.success && result.projects) {
          // Fetch full portfolio data for all projects in a single query to get emoji
          const projectIds = result.projects.map(p => p.id)
          if (projectIds.length > 0) {
            const { data: fullProjects } = await supabase
              .from('portfolios')
              .select('id, metadata')
              .in('id', projectIds)
            
            const projectMap = new Map(
              (fullProjects || []).map((p: any) => {
                const metadata = p.metadata as any
                return [p.id, metadata?.basic?.emoji]
              })
            )

            const projectData = result.projects.map((p) => ({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              emoji: projectMap.get(p.id) as string | undefined,
              role: p.role,
              projectType: p.projectType,
              visibility: ((p as any).visibility === 'private' ? 'private' : 'public') as 'public' | 'private',
            }))
            setProjects(projectData)
          } else {
            setProjects([])
          }
        } else {
          // Log error if result was not successful
          if (result.error) {
            console.error('Failed to fetch projects:', result.error)
          }
          setProjects([])
        }
      } catch (error) {
        console.error('Failed to fetch projects:', error)
        setProjects([])
      } finally {
        setProjectsLoading(false)
      }
    }

    fetchProjects()
  }, [portfolio.id, portfolio.type, supabase])

  // Fetch activities for human, project, and community portfolios (for all visitors)
  useEffect(() => {
    const fetchActivities = async () => {
      if (!isHumanPortfolio(portfolio) && !isProjectPortfolio(portfolio) && !isCommunityPortfolio(portfolio)) {
        return
      }

      setActivitiesLoading(true)
      try {
        if (isHumanPortfolio(portfolio)) {
          // Activities where this human is a member/manager/owner
          const ownerId = portfolio.user_id
          const { data: allActivities } = await supabase
            .from('portfolios')
            .select('id, user_id, metadata, type')
            .eq('type', 'activities')
            .order('created_at', { ascending: false })

          if (!allActivities || allActivities.length === 0) {
            setActivities([])
            setActivitiesLoading(false)
            return
          }

          const userActivities = (allActivities as any[]).filter((p: any) => {
            const meta = p.metadata as any
            const managers: string[] = meta?.managers || []
            const members: string[] = meta?.members || []
            const isOwner = p.user_id === ownerId
            const isManager = Array.isArray(managers) && managers.includes(ownerId)
            const isMember = Array.isArray(members) && members.includes(ownerId)
            return isOwner || isManager || isMember
          })

          const mapped = userActivities.map((p: any) => {
            const meta = p.metadata as any
            const basic = meta?.basic || {}
            return {
              id: p.id as string,
              name: (basic.name as string) || 'Activity',
              avatar: basic.avatar as string | undefined,
              emoji: basic.emoji as string | undefined,
              hostProjectName: null,
            }
          })

          setActivities(mapped)
        } else if (isProjectPortfolio(portfolio)) {
          // Activities hosted by this project
          const { data: hosted } = await supabase
            .from('portfolios')
            .select('id, metadata, host_project_id')
            .eq('type', 'activities')
            .eq('host_project_id', portfolio.id)
            .order('created_at', { ascending: false })

          if (!hosted || hosted.length === 0) {
            setActivities([])
            setActivitiesLoading(false)
            return
          }

          const mapped = (hosted as any[]).map((p: any) => {
            const meta = p.metadata as any
            const basic = meta?.basic || {}
            return {
              id: p.id as string,
              name: (basic.name as string) || 'Activity',
              avatar: basic.avatar as string | undefined,
              emoji: basic.emoji as string | undefined,
              hostProjectName: basic.name as string | undefined,
            }
          })

          setActivities(mapped)
        } else if (isCommunityPortfolio(portfolio)) {
          // Activities hosted by this community
          const { data: allActivities } = await supabase
            .from('portfolios')
            .select('id, metadata, type')
            .eq('type', 'activities')
            .order('created_at', { ascending: false })
            .limit(200)

          if (!allActivities || allActivities.length === 0) {
            setActivities([])
            setActivitiesLoading(false)
            return
          }

          const communityActivities = (allActivities as any[]).filter((p: any) => {
            const meta = p.metadata as any
            const props = meta?.properties || {}
            const hostCommunityIds: string[] = Array.isArray(props?.host_community_ids)
              ? props.host_community_ids
              : []
            return hostCommunityIds.includes(portfolio.id)
          })

          const mapped = communityActivities.map((p: any) => {
            const meta = p.metadata as any
            const basic = meta?.basic || {}
            return {
              id: p.id as string,
              name: (basic.name as string) || 'Activity',
              avatar: basic.avatar as string | undefined,
              emoji: basic.emoji as string | undefined,
              hostProjectName: null,
            }
          })

          setActivities(mapped)
        }
      } catch (error) {
        console.error('Failed to fetch activities:', error)
        setActivities([])
      } finally {
        setActivitiesLoading(false)
      }
    }

    fetchActivities()
  }, [portfolio, supabase])

  // Fetch host project details for activity view (for host project pills)
  useEffect(() => {
    if (!isActivityPortfolio(portfolio)) {
      setActivityHostProjects([])
      return
    }
    const props = (portfolio.metadata as any)?.properties
    const ids = (props?.host_project_ids as string[] | undefined) || ((portfolio as any).host_project_id ? [(portfolio as any).host_project_id] : [])
    if (ids.length === 0) {
      setActivityHostProjects([])
      return
    }
    let cancelled = false
    const load = async () => {
      const { data: projects } = await supabase
        .from('portfolios')
        .select('id, metadata')
        .eq('type', 'projects')
        .in('id', ids)
      if (cancelled || !projects?.length) {
        if (!cancelled) setActivityHostProjects([])
        return
      }
      const list = projects.map((p: any) => {
        const basic = (p.metadata as any)?.basic || {}
        return {
          id: p.id,
          name: (basic.name as string) || 'Project',
          avatar: basic.avatar as string | undefined,
          emoji: basic.emoji as string | undefined,
        }
      })
      if (!cancelled) setActivityHostProjects(list)
    }
    load()
    return () => { cancelled = true }
  }, [portfolio, supabase])

  // Fetch host community details for activity view (for host community pills)
  useEffect(() => {
    if (!isActivityPortfolio(portfolio)) {
      setActivityHostCommunities([])
      return
    }
    const props = (portfolio.metadata as any)?.properties
    const ids = (props?.host_community_ids as string[] | undefined) || []
    if (ids.length === 0) {
      setActivityHostCommunities([])
      return
    }
    let cancelled = false
    const load = async () => {
      const { data: communities } = await supabase
        .from('portfolios')
        .select('id, metadata')
        .eq('type', 'community')
        .in('id', ids)
      if (cancelled || !communities?.length) {
        if (!cancelled) setActivityHostCommunities([])
        return
      }
      const list = communities.map((c: any) => {
        const basic = (c.metadata as any)?.basic || {}
        return {
          id: c.id,
          name: (basic.name as string) || 'Community',
          avatar: basic.avatar as string | undefined,
          emoji: basic.emoji as string | undefined,
        }
      })
      if (!cancelled) setActivityHostCommunities(list)
    }
    load()
    return () => { cancelled = true }
  }, [portfolio, supabase])

  // Pending join requests count for activity owner/manager (call-to-join card badge)
  useEffect(() => {
    if (!isActivityPortfolio(portfolio) || (!isOwner && !isManager)) {
      setPendingJoinRequestsCount(null)
      return
    }
    let cancelled = false
    getPendingJoinRequestsCount(portfolio.id).then((res) => {
      if (!cancelled && res.success && res.count !== undefined) {
        setPendingJoinRequestsCount(res.count)
      }
    })
    return () => { cancelled = true }
  }, [portfolio, isOwner, isManager])

  // Fetch member avatars for projects, activities, and communities
  useEffect(() => {
    const fetchMemberAvatars = async () => {
      if (!isProjectPortfolio(portfolio) && !isActivityPortfolio(portfolio) && !isCommunityPortfolio(portfolio)) {
        return
      }

      setMemberAvatarsLoading(true)
      try {
        const metadata = portfolio.metadata as any
        const allMemberIds = [
          portfolio.user_id, // Creator
          ...(metadata?.managers || []),
          ...(metadata?.members || []),
        ]
        
        // Remove duplicates
        const uniqueMemberIds = Array.from(new Set(allMemberIds))
        
        if (uniqueMemberIds.length === 0) {
          setMemberAvatars([])
          setMemberAvatarsLoading(false)
          return
        }

        // Fetch human portfolios for all members
        const { data: memberPortfolios } = await supabase
          .from('portfolios')
          .select('user_id, metadata')
          .eq('type', 'human')
          .in('user_id', uniqueMemberIds)

        const avatars = (memberPortfolios || []).map((p: any) => {
          const memberMetadata = p.metadata as any
          const memberBasic = memberMetadata?.basic || {}
          return {
            id: p.user_id,
            avatar: memberBasic.avatar || memberMetadata?.avatar_url || null,
            name: memberBasic.name || memberMetadata?.username || null,
          }
        })

        setMemberAvatars(avatars)
      } catch (error) {
        console.error('Failed to fetch member avatars:', error)
        setMemberAvatars([])
      } finally {
        setMemberAvatarsLoading(false)
      }
    }

    fetchMemberAvatars()
  }, [portfolio, supabase])

  // Fetch friends for human portfolios
  // For visitors: show mutual friends, for owner: show all friends
  useEffect(() => {
    const fetchFriends = async () => {
      if (!isHumanPortfolio(portfolio)) {
        return
      }

      // Wait for auth check to complete
      if (!authChecked) {
        return
      }

      setFriendsLoading(true)
      try {
        const isVisitor = currentUserId && currentUserId !== portfolio.user_id

        if (isVisitor) {
          // Fetch mutual friends for visitors
          // Get current user's friends
          const { data: currentUserFriendships } = await supabase
            .from('friends')
            .select('user_id, friend_id, status')
            .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
            .eq('status', 'accepted')

          if (!currentUserFriendships || currentUserFriendships.length === 0) {
            setFriends([])
            setTotalMutualFriends(0)
            setFriendsLoading(false)
            return
          }

          const currentUserFriendIds = new Set(
            currentUserFriendships.map((f: any) => 
              f.user_id === currentUserId ? f.friend_id : f.user_id
            )
          )

          // Get portfolio owner's friends
          const { data: ownerFriendships } = await supabase
            .from('friends')
            .select('user_id, friend_id, status')
            .or(`user_id.eq.${portfolio.user_id},friend_id.eq.${portfolio.user_id}`)
            .eq('status', 'accepted')

          if (!ownerFriendships || ownerFriendships.length === 0) {
            setFriends([])
            setTotalMutualFriends(0)
            setFriendsLoading(false)
            return
          }

          const ownerFriendIds = ownerFriendships.map((f: any) => 
            f.user_id === portfolio.user_id ? f.friend_id : f.user_id
          )

          // Find mutual friends
          const mutualFriendIds = ownerFriendIds.filter((id: string) => 
            currentUserFriendIds.has(id)
          )

          setTotalMutualFriends(mutualFriendIds.length)

          if (mutualFriendIds.length === 0) {
            setFriends([])
            setFriendsLoading(false)
            return
          }

          // Fetch mutual friend portfolios (limit to 5 for display)
          const displayIds = mutualFriendIds.slice(0, 5)
          const { data: friendPortfolios } = await supabase
            .from('portfolios')
            .select('user_id, metadata')
            .eq('type', 'human')
            .in('user_id', displayIds)

          const friendData = (friendPortfolios || []).map((p: any) => {
            const friendMetadata = p.metadata as any
            const friendBasic = friendMetadata?.basic || {}
            return {
              id: p.user_id,
              avatar: friendBasic.avatar || friendMetadata?.avatar_url || null,
              name: friendBasic.name || friendMetadata?.username || null,
            }
          })

          setFriends(friendData)
        } else {
          // For owner: show all friends
          // First, get total count of all friendships (no limit)
          const { data: allFriendships } = await supabase
            .from('friends')
            .select('user_id, friend_id, status')
            .or(`user_id.eq.${portfolio.user_id},friend_id.eq.${portfolio.user_id}`)
            .eq('status', 'accepted')

          if (!allFriendships || allFriendships.length === 0) {
            setFriends([])
            setTotalMutualFriends(0)
            setFriendsLoading(false)
            return
          }

          // Set total friends count
          const totalFriends = allFriendships.length
          setTotalMutualFriends(totalFriends)

          // Extract friend IDs (limit to 5 for display)
          const allFriendIds = allFriendships.map((f: any) => 
            f.user_id === portfolio.user_id ? f.friend_id : f.user_id
          )
          const displayFriendIds = allFriendIds.slice(0, 5)

          // Fetch friend portfolios for display (only first 5)
          const { data: friendPortfolios } = await supabase
            .from('portfolios')
            .select('user_id, metadata')
            .eq('type', 'human')
            .in('user_id', displayFriendIds)

          const friendData = (friendPortfolios || []).map((p: any) => {
            const friendMetadata = p.metadata as any
            const friendBasic = friendMetadata?.basic || {}
            return {
              id: p.user_id,
              avatar: friendBasic.avatar || friendMetadata?.avatar_url || null,
              name: friendBasic.name || friendMetadata?.username || null,
            }
          })

          setFriends(friendData)
        }
      } catch (error) {
        console.error('Failed to fetch friends:', error)
        setFriends([])
        setTotalMutualFriends(0)
      } finally {
        setFriendsLoading(false)
      }
    }

    fetchFriends()
  }, [portfolio, supabase, currentUserId, authChecked])

  // Fetch communities for human portfolios
  // For visitors: show mutual communities, for owner: show all joined communities
  useEffect(() => {
    const fetchCommunities = async () => {
      if (!isHumanPortfolio(portfolio)) {
        return
      }

      if (!authChecked) {
        return
      }

      setCommunitiesLoading(true)
      try {
        const isVisitor = currentUserId && currentUserId !== portfolio.user_id

        // Fetch recent communities
        const { data: allCommunities } = await supabase
          .from('portfolios')
          .select('id, metadata')
          .eq('type', 'community')
          .order('created_at', { ascending: false })
          .limit(200)

        if (!allCommunities || allCommunities.length === 0) {
          setCommunities([])
          setTotalMutualCommunities(0)
          return
        }

        const ownerId = portfolio.user_id
        const viewerId = isVisitor ? currentUserId! : ownerId

        const joinedCommunities = (allCommunities as any[]).filter((p: any) => {
          const metadata = p.metadata as any
          const managers: string[] = metadata?.managers || []
          const members: string[] = metadata?.members || []
          const allMemberIds = new Set<string>([
            ...managers,
            ...members,
          ])

          // Ensure owner is a member/manager
          if (!allMemberIds.has(ownerId)) {
            return false
          }

          // For visitors, community must also include the viewer
          if (isVisitor) {
            return allMemberIds.has(viewerId)
          }

          // For owner view, any community they are in is included
          return true
        })

        if (joinedCommunities.length === 0) {
          setCommunities([])
          setTotalMutualCommunities(0)
          return
        }

        const communityData = joinedCommunities.map((p: any) => {
          const metadata = p.metadata as any
          const basic = metadata?.basic || {}
          return {
            id: p.id as string,
            name: basic.name as string | undefined,
            avatar: basic.avatar as string | undefined,
            emoji: basic.emoji as string | undefined,
          }
        })

        setCommunities(communityData)
        setTotalMutualCommunities(communityData.length)
      } catch (error) {
        console.error('Failed to fetch communities:', error)
        setCommunities([])
        setTotalMutualCommunities(0)
      } finally {
        setCommunitiesLoading(false)
      }
    }

    fetchCommunities()
  }, [portfolio, supabase, currentUserId, authChecked])

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this portfolio? This action cannot be undone.')) {
      return
    }

    setIsDeleting(true)
    const result = await deletePortfolio(portfolio.id)

    if (result.success) {
      router.push('/portfolio')
      router.refresh()
    } else {
      alert(result.error || 'Failed to delete portfolio')
      setIsDeleting(false)
    }
  }

  const [openActivityOnEdit, setOpenActivityOnEdit] = useState(false)
  const [openLocationOnEdit, setOpenLocationOnEdit] = useState(false)
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false)
  const [applyPromptAnswer, setApplyPromptAnswer] = useState('')
  const [applySelectedRoleId, setApplySelectedRoleId] = useState<string | undefined>(undefined)
  const [isApplying, setIsApplying] = useState(false)
  const [applyFeedback, setApplyFeedback] = useState<string | null>(null)
  const [isLoginRequiredModalOpen, setIsLoginRequiredModalOpen] = useState(false)
  const [isEditingCallToJoin, setIsEditingCallToJoin] = useState(false)
  const [editCallToJoinDraft, setEditCallToJoinDraft] = useState<ActivityCallToJoinConfig | null>(null)
  const [isCommunityJoinModalOpen, setIsCommunityJoinModalOpen] = useState(false)
  const [communityJoinPromptAnswer, setCommunityJoinPromptAnswer] = useState('')
  const [isSubmittingCommunityJoin, setIsSubmittingCommunityJoin] = useState(false)
  const [communityJoinFeedback, setCommunityJoinFeedback] = useState<string | null>(null)
  const [isCommunityLoginRequiredOpen, setIsCommunityLoginRequiredOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'feed' | 'activities'>('overview')
  const [joinableActivities, setJoinableActivities] = useState<ExploreActivity[]>([])
  const [joinableActivitiesLoading, setJoinableActivitiesLoading] = useState(false)
  const [joinableActivitiesError, setJoinableActivitiesError] = useState<string | null>(null)

  // Activities tab (joinable) data fetch — reuse Explore activities UI
  useEffect(() => {
    if (activeTab !== 'activities') return

    if (!currentUserId) {
      setJoinableActivities([])
      setJoinableActivitiesLoading(false)
      setJoinableActivitiesError(null)
      return
    }

    let cancelled = false
    const load = async () => {
      setJoinableActivitiesLoading(true)
      setJoinableActivitiesError(null)
      try {
        const res = await fetch(`/api/portfolios/${portfolio.id}/joinable-activities`)
        const data = res.ok ? await res.json() : null
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load activities')
        }
        if (cancelled) return
        setJoinableActivities(Array.isArray(data?.activities) ? data.activities : [])
      } catch (e: any) {
        if (cancelled) return
        setJoinableActivities([])
        setJoinableActivitiesError(e?.message || 'Failed to load activities')
      } finally {
        if (!cancelled) setJoinableActivitiesLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [activeTab, currentUserId, portfolio.id])

  if (isEditing) {
    return (
      <PortfolioEditor
        portfolio={portfolio}
        onCancel={() => setIsEditing(false)}
        onSave={async () => {
          setIsEditing(false)
          // Force a full page reload to ensure fresh data is loaded
          // This ensures the server action completes and cache is cleared
          const portfolioUrl = isHumanPortfolio(portfolio) 
            ? `/portfolio/human/${portfolio.user_id}`
            : getPortfolioUrl(portfolio.type, portfolio.id)
          // Use window.location to force a full page reload with fresh data
          window.location.href = portfolioUrl
        }}
        initialShowActivityPicker={openActivityOnEdit}
        initialShowLocationPicker={openLocationOnEdit}
      />
    )
  }

  const metadata = portfolio.metadata as any
  const members = metadata?.members || []
  const managers = metadata?.managers || []
  const projectStatus = metadata?.status as string | undefined
  const activityProperties: Record<string, any> | undefined = (metadata as any)?.properties
  const activityCallToJoin: ActivityCallToJoinConfig | null =
    activityProperties?.call_to_join || null
  const isExternalActivity = activityProperties?.external === true
  const externalLink = (activityProperties?.external_link as string) || ''
  const activityHostProjectIds: string[] =
    (activityProperties?.host_project_ids as string[] | undefined) ||
    ((portfolio as any).host_project_id ? [(portfolio as any).host_project_id] : [])

  const humanProperties: Record<string, any> | undefined = isHumanPortfolio(portfolio)
    ? ((metadata as any)?.properties as Record<string, any> | undefined)
    : undefined
  const humanAutoCityLocationEnabled =
    humanProperties?.auto_city_location_enabled !== false
  const humanAutoCityLocation: ActivityLocationValue | undefined =
    (humanProperties?.auto_city_location as ActivityLocationValue | undefined) || undefined

  // Determine tab label based on portfolio type
  const tabLabel = isHumanPortfolio(portfolio) ? 'Projects' : 'Navigations'

  return (
    <>
    {basic.avatar && (
      <ImageViewerPopup
        open={showAvatarPopup}
        src={basic.avatar}
        alt={basic.name}
        onClose={() => setShowAvatarPopup(false)}
      />
    )}
    {basic.description && (
      <DescriptionViewerPopup
        open={showDescriptionPopup}
        description={basic.description}
        onClose={() => setShowDescriptionPopup(false)}
      />
    )}
    <div className="bg-transparent rounded-lg p-6">
          {/* Header with avatar, name, description, and buttons */}
          <div className="mb-6 mt-12">
            {/* Avatar */}
            <div className="mb-4 flex justify-start">
              {basic.avatar ? (
                isHumanPortfolio(portfolio) ? (
                  <StickerAvatar
                    src={basic.avatar}
                    alt={basic.name}
                    type={portfolio.type}
                    size={96}
                    href={`/portfolio/human/${portfolio.user_id}`}
                    className="flex-shrink-0"
                  />
                ) : (
                  <StickerAvatar
                    src={basic.avatar}
                    alt={basic.name}
                    type={portfolio.type}
                    size={96}
                    onClick={() => setShowAvatarPopup(true)}
                    className="flex-shrink-0 transition-transform hover:rotate-3"
                  />
                )
              ) : isHumanPortfolio(portfolio) ? (
                <Link
                  href={`/portfolio/human/${portfolio.user_id}`}
                  className="flex-shrink-0 h-24 w-24 rounded-full bg-gray-200 flex items-center justify-center border-2 border-gray-300 hover:border-blue-500 transition-colors cursor-pointer"
                >
                  <svg
                    className="h-12 w-12 text-gray-400"
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
                </Link>
              ) : (
                <StickerAvatar
                  alt={basic.name}
                  type={portfolio.type}
                  size={96}
                  emoji={(metadata as any)?.basic?.emoji || '🎨'}
                  name={basic.name}
                  href={getPortfolioUrl(portfolio.type, portfolio.id)}
                  className="flex-shrink-0"
                />
              )}
            </div>

            {/* Name, LIVE pill, Visibility, and Project/Activity Type */}
            <div className="flex items-baseline gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Title as="h1">{basic.name}</Title>
              </div>
              {(isProjectPortfolio(portfolio) || isCommunityPortfolio(portfolio) || isActivityPortfolio(portfolio)) && (() => {
                const metadata = portfolio.metadata as any
                const projectTypeSpecific = metadata?.project_type_specific
                if (projectTypeSpecific) {
                  return (
                    <UIText className="text-gray-600">
                      {projectTypeSpecific}
                    </UIText>
                  )
                }
                return null
              })()}
              {(isProjectPortfolio(portfolio) || isActivityPortfolio(portfolio)) && (() => {
                const metadataAny = portfolio.metadata as any
                const props = metadataAny?.properties
                const activity = props?.activity_datetime as ActivityDateTimeValue | undefined
                const hasActivity = !!activity && !!activity.start
                const status = metadataAny?.status as string | undefined || null

                // When there is no scheduled datetime, fall back to manual status
                if (!hasActivity) {
                  if (status === 'live') {
                    return (
                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <UIText as="span" className="text-[11px] text-black leading-none">
                          LIVE
                        </UIText>
                      </div>
                    )
                  }
                  if (status === 'archived') {
                    return (
                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100">
                        <UIText as="span" className="text-[11px] text-black leading-none">
                          Activity ended
                        </UIText>
                      </div>
                    )
                  }
                  return null
                }

                const live = isActivityLive(activity, status)
                if (live) {
                  return (
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <UIText as="span" className="text-[11px] text-black leading-none">
                        LIVE
                      </UIText>
                    </div>
                  )
                }

                const now = new Date()
                const start = activity?.start ? new Date(activity.start) : null
                const end = activity?.end ? new Date(activity.end) : null
                const validStart = start && !Number.isNaN(start.getTime()) ? start : null
                const validEnd = end && !Number.isNaN(end.getTime()) ? end : null

                let label: string | null = null
                let isUpcoming = false
                let target: Date | null = null

                if (status === 'archived') {
                  label = 'Activity ended'
                } else if (validStart) {
                  // Determine upcoming vs past using start/end
                  if (now < validStart) {
                    isUpcoming = true
                    target = validStart
                  } else {
                    const pastTarget = validEnd || validStart
                    if (now > pastTarget) {
                      target = pastTarget
                    }
                  }
                }

                if (!label && target) {
                  if (isUpcoming) {
                    const relative = formatDistanceToNowStrict(target, { addSuffix: true })
                    label = relative
                  } else {
                    label = 'Activity ended'
                  }
                }

                if (!label) return null

                return (
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100">
                    {isUpcoming ? (
                      <Timer className="w-3 h-3 text-blue-600 flex-shrink-0" aria-hidden />
                    ) : (
                      <History className="w-3 h-3 text-gray-500 flex-shrink-0" aria-hidden />
                    )}
                    <UIText
                      as="span"
                      className={`text-[11px] leading-none ${
                        isUpcoming ? 'text-blue-600' : 'text-gray-700'
                      }`}
                    >
                      {label}
                    </UIText>
                  </div>
                )
              })()}
              {isProjectPortfolio(portfolio) && serverIsOwner && (portfolio as any).visibility === 'private' && (
                <Lock className="w-4 h-4 text-gray-500 flex-shrink-0" aria-label="Private" />
              )}
            </div>

            {/* Description */}
            {basic.description && (
              <button
                type="button"
                onClick={() => setShowDescriptionPopup(true)}
                className="w-full text-left rounded-lg px-2 py-1 -mx-2 -my-1 hover:bg-gray-100 focus-visible:bg-gray-100 transition-colors"
                aria-label="Open full description"
              >
                <Content className="mb-4 whitespace-pre-wrap line-clamp-5 cursor-pointer">
                  {basic.description}
                </Content>
              </button>
            )}

            {/* Activity datetime & location badges (activities) */}
            {isActivityPortfolio(portfolio) && (() => {
              const props = (portfolio.metadata as any)?.properties
              const activity = props?.activity_datetime as ActivityDateTimeValue | undefined
              const location = props?.location as ActivityLocationValue | undefined
              const link = (props?.external_link as string) || ''

              const hasActivity = !!activity && !!activity.start
              const hasLocation = !!location
              const hasLink = !!link

              if (!hasActivity && !hasLocation && !hasLink) return null

              const canEditActivity = isOwner || isManager
              const canEditLocation = isOwner || isManager
              const canSeeFullLocation = isOwner || isManager || isMember || isAdmin

              const handleLocationClick = () => {
                if (!location) return
                const queryParts: string[] = []
                // Include street address in the map query whenever the viewer
                // is allowed to see the full location OR when the exact address is public.
                // This keeps the Google Maps search aligned with what’s shown in the badge UI.
                const isExactPrivate = !!location.isExactLocationPrivate
                if (location.line1 && (!isExactPrivate || canSeeFullLocation)) {
                  queryParts.push(location.line1)
                }
                const cityStateCountry = [location.city, location.state, location.country]
                  .filter(Boolean)
                  .join(', ')
                if (cityStateCountry) {
                  queryParts.push(cityStateCountry)
                }
                if (queryParts.length === 0) return
                const query = encodeURIComponent(queryParts.join(', '))
                const url = `https://www.google.com/maps/search/?api=1&query=${query}`
                window.open(url, '_blank', 'noopener,noreferrer')
              }

              const handleUnauthorizedClick = () => {
                alert('Address is visible for members only.')
              }

              return (
                <div className="mb-4 max-w-full flex flex-wrap gap-2">
                  {hasLink && (
                    <div>
                      <ActivityLinkBadge url={link} />
                    </div>
                  )}
                  {hasActivity && (
                    <div>
                      <ActivityDateTimeBadge
                        value={activity}
                        disableRootClick={canEditActivity}
                        showEditIcon={canEditActivity}
                        onEditIconClick={
                          canEditActivity
                            ? () => {
                                setOpenActivityOnEdit(true)
                                setOpenLocationOnEdit(false)
                                setIsEditing(true)
                              }
                            : undefined
                        }
                      />
                    </div>
                  )}
                  {hasLocation && (
                    <div>
                      <ActivityLocationBadge
                        value={location}
                        canSeeFullLocation={canSeeFullLocation}
                        showEditIcon={canEditLocation}
                        onEditIconClick={
                          canEditLocation
                            ? () => {
                                setOpenLocationOnEdit(true)
                                setOpenActivityOnEdit(false)
                                setIsEditing(true)
                              }
                            : undefined
                        }
                        onClick={handleLocationClick}
                        onUnauthorizedClick={!canSeeFullLocation ? handleUnauthorizedClick : undefined}
                      />
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Human auto city location badge (derived from IP, when enabled) */}
            {isHumanPortfolio(portfolio) &&
              humanAutoCityLocationEnabled &&
              humanAutoCityLocation && (() => {
                const location = humanAutoCityLocation

                const handleHumanLocationClick = () => {
                  const queryParts: string[] = []
                  if (location.line1) {
                    queryParts.push(location.line1)
                  }
                  const cityStateCountry = [
                    location.city,
                    location.state,
                    location.country,
                  ]
                    .filter(Boolean)
                    .join(', ')
                  if (cityStateCountry) {
                    queryParts.push(cityStateCountry)
                  }
                  if (queryParts.length === 0) return
                  const query = encodeURIComponent(queryParts.join(', '))
                  const url = `https://www.google.com/maps/search/?api=1&query=${query}`
                  window.open(url, '_blank', 'noopener,noreferrer')
                }

                return (
                  <div className="mb-4 max-w-full">
                    <ActivityLocationBadge
                      value={{
                        // Suppress line1 so the badge only renders the
                        // "city, region" style second line for humans.
                        ...location,
                        line1: undefined,
                      }}
                      canSeeFullLocation
                      onClick={handleHumanLocationClick}
                    />
                  </div>
                )
              })()}

            {/* External activity Join card (simple Join button, no approval) */}
            {isActivityPortfolio(portfolio) && isExternalActivity && !isOwner && !isManager && !isMember && (() => {
              const handleJoinClick = async () => {
                if (!isAuthenticated) {
                  setIsLoginRequiredModalOpen(true)
                  return
                }
                setApplyFeedback('Joining...')
                try {
                  const result = await applyToActivityCallToJoin({
                    portfolioId: portfolio.id,
                    promptAnswer: undefined,
                  })
                  if (result?.success) {
                    setApplyFeedback('You have joined this event.')
                    router.refresh()
                  } else {
                    setApplyFeedback(result?.error || 'Failed to join.')
                  }
                } catch (err: any) {
                  setApplyFeedback(err.message || 'Failed to join.')
                }
              }
              return (
                <Card variant="subtle" padding="sm" className="mb-4 self-start">
                  <div className="flex flex-col gap-1.5 text-left">
                    <div className="flex items-center gap-1.5">
                      <Megaphone className="w-4 h-4 text-gray-500 flex-shrink-0" aria-hidden />
                      <UIText as="span" className="text-gray-600">
                        Going?
                      </UIText>
                    </div>
                    <Content className="my-1.5">
                      Join this event to show you&apos;re going.
                    </Content>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Button variant="primary" size="sm" onClick={handleJoinClick}>
                        <UIText>Join</UIText>
                      </Button>
                      {applyFeedback && (
                        <UIText className="text-gray-600">{applyFeedback}</UIText>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })()}

            {/* Activity Call-to-Join Card (activities only; on when not private) */}
            {isActivityPortfolio(portfolio) && activityCallToJoin && (portfolio as any).visibility !== 'private' && (() => {
              const config = activityCallToJoin
              const visibility = (portfolio as any).visibility === 'private' ? 'private' : 'public'
              const activityDateTime = (activityProperties?.activity_datetime as ActivityDateTimeValue | undefined) || null
              const joinWindowOpen = isCallToJoinWindowOpen(visibility, config, activityDateTime, projectStatus)
              const joinByDate = config.join_by ? new Date(config.join_by) : null
              const requiresApproval = config.require_approval ?? true

              const canSeeOwnerManagerCard = (isOwner || isManager)
              const canApplyAsVisitor =
                !isOwner &&
                !isManager &&
                !isMember &&
                joinWindowOpen
              const canSeeVisitorCard = canApplyAsVisitor || (!canSeeOwnerManagerCard && !joinWindowOpen)

              if (!canSeeOwnerManagerCard && !canSeeVisitorCard) {
                return null
              }

              const roles = config.roles || []

              const handleOpenApply = () => {
                setApplyFeedback(null)
                setApplyPromptAnswer('')
                setApplySelectedRoleId(roles[0]?.id)
                setIsApplyModalOpen(true)
              }

              const handleApplyClick = () => {
                if (!isAuthenticated) {
                  setIsLoginRequiredModalOpen(true)
                  return
                }

                // When approval is required, open the confirmation/prompt modal.
                // When no approval is required, auto-join directly (same flow as external activities, no popup).
                if (requiresApproval) {
                  handleOpenApply()
                  return
                }

                if (!joinWindowOpen) {
                  return
                }

                const runAutoJoin = async () => {
                  setApplyFeedback('Joining...')
                  try {
                    const result = await applyToActivityCallToJoin({
                      portfolioId: portfolio.id,
                      promptAnswer: undefined,
                    })
                    if (!result || !result.success) {
                      setApplyFeedback(result?.error || 'Failed to join.')
                      return
                    }
                    setApplyFeedback('You have joined this activity.')
                    router.refresh()
                  } catch (error: any) {
                    setApplyFeedback(error?.message || 'Failed to join.')
                  }
                }

                void runAutoJoin()
              }

              const handleOpenEdit = () => {
                setEditCallToJoinDraft({
                  enabled: config.enabled !== false,
                  description: config.description,
                  join_by: config.join_by ?? null,
                  require_approval: config.require_approval ?? true,
                  prompt: config.prompt ?? null,
                  roles: roles.length > 0 ? roles : [
                    { id: 'default-member', label: 'Member', activityRole: 'member' },
                  ],
                  join_by_auto_managed: config.join_by_auto_managed ?? true,
                })
                setIsEditingCallToJoin(true)
              }

              const membersRequestsUrl = `${getPortfolioUrl(portfolio.type, portfolio.id)}/members?tab=requests`
              const pendingCount = pendingJoinRequestsCount ?? 0

              return (
                <>
                  <Card variant="subtle" padding="sm" className="mb-4 self-start">
                    <div className="flex flex-col gap-1.5 text-left">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Megaphone className="w-4 h-4 text-gray-500 flex-shrink-0" aria-hidden />
                          <UIText as="span" className="text-gray-600">
                            Call to join
                          </UIText>
                        </div>
                        {canSeeOwnerManagerCard && (
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            {pendingCount > 0 && (
                              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-blue-600 text-white text-xs font-medium">
                                {pendingCount}
                              </span>
                            )}
                            <Button variant="secondary" size="sm" onClick={handleOpenEdit}>
                              <UIText>Edit</UIText>
                            </Button>
                            <Button variant="secondary" size="sm" asLink href={membersRequestsUrl}>
                              <UIText>Manage requests</UIText>
                            </Button>
                          </div>
                        )}
                      </div>
                      {hasPendingApplication ? (
                        <Content className="my-1.5">
                          Your application is received and under review.
                        </Content>
                      ) : (
                        <>
                          <Content className="my-1.5">
                            {config.description?.trim() || 'Join this activity.'}
                          </Content>
                          {(canApplyAsVisitor || (!canSeeOwnerManagerCard && !joinWindowOpen)) && (
                            <div className="flex items-center gap-2 mt-0.5">
                              {canApplyAsVisitor && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={handleApplyClick}
                                  disabled={!joinWindowOpen}
                                >
                                  <UIText>{requiresApproval ? 'Apply to join' : 'Join'}</UIText>
                                </Button>
                              )}
                              {!canApplyAsVisitor && !joinWindowOpen && (
                                <UIText className="text-gray-500">Join window closed</UIText>
                              )}
                              {applyFeedback && (
                                <UIText className="text-gray-600">{applyFeedback}</UIText>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </Card>
                </>
              )
            })()}

            {/* Friends & Communities Section (human portfolios only) - Under description, no title */}
            {isHumanPortfolio(portfolio) && (
              <div className="mb-4 flex flex-wrap gap-2">
                {/* Friends pill */}
                {(() => {
                  if (friendsLoading) {
                    return (
                      <div className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 flex-shrink-0">
                        <UIText className="text-gray-500">Loading friends...</UIText>
                      </div>
                    )
                  }

                  if (friends.length === 0) {
                    return null
                  }

                  const isVisitor = currentUserId && currentUserId !== portfolio.user_id

                  const friendCountText =
                    totalMutualFriends > 0
                      ? isVisitor
                        ? `${totalMutualFriends} mutual ${totalMutualFriends === 1 ? 'friend' : 'friends'}`
                        : `${totalMutualFriends} ${totalMutualFriends === 1 ? 'friend' : 'friends'}`
                      : null

                  const displayFriends = friends.slice(0, 5)

                  return (
                    <Link
                      href={`/portfolio/human/${portfolio.user_id}/friends`}
                      className="inline-flex items-center gap-2 px-2 py-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0 min-w-0"
                      title={isVisitor ? 'View all mutual friends' : 'View all friends'}
                    >
                      {/* Stacked avatars */}
                      <div className="flex -space-x-2 flex-shrink-0">
                        {displayFriends.map((friend, index) => (
                          <div
                            key={friend.id}
                            className="relative"
                            style={{ zIndex: displayFriends.length - index }}
                          >
                            <UserAvatar
                              userId={friend.id}
                              name={friend.name}
                              avatar={friend.avatar}
                              size={32}
                              showLink={false}
                            />
                          </div>
                        ))}
                      </div>
                      {/* Text after avatars */}
                      {friendCountText && (
                        <UIText className="text-gray-600 whitespace-nowrap">
                          {friendCountText}
                        </UIText>
                      )}
                    </Link>
                  )
                })()}

                {/* Communities pill */}
                {(() => {
                  if (communitiesLoading) {
                    return (
                      <div className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 flex-shrink-0">
                        <UIText className="text-gray-500">Loading communities...</UIText>
                      </div>
                    )
                  }

                  if (communities.length === 0) {
                    return null
                  }

                  const isVisitor = currentUserId && currentUserId !== portfolio.user_id

                  const communityCountText =
                    totalMutualCommunities > 0
                      ? isVisitor
                        ? `joined ${totalMutualCommunities} mutual ${totalMutualCommunities === 1 ? 'community' : 'communities'}`
                        : `joined ${totalMutualCommunities} ${totalMutualCommunities === 1 ? 'community' : 'communities'}`
                      : null

                  const displayCommunities = communities.slice(0, 5)

                  return (
                    <Link
                      href={`/portfolio/human/${portfolio.user_id}/communities`}
                      className="inline-flex items-center gap-2 px-2 py-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0 min-w-0"
                      title={isVisitor ? 'View all mutual communities' : 'View all communities'}
                    >
                      {/* Community avatars (non-stacked) */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {displayCommunities.map((community) => (
                          <StickerAvatar
                            key={community.id}
                            src={community.avatar}
                            alt={community.name || 'Community'}
                            type="community"
                            size={34}
                            emoji={community.emoji}
                            name={community.name}
                            normalizeScale={1.0}
                            variant="mini"
                          />
                        ))}
                      </div>
                      {/* Text after avatars */}
                      {communityCountText && (
                        <UIText className="text-gray-600 whitespace-nowrap">
                          {communityCountText}
                        </UIText>
                      )}
                    </Link>
                  )
                })()}
              </div>
            )}

            {/* Members Section - Projects, Activities, and Communities */}
            {(isProjectPortfolio(portfolio) || isActivityPortfolio(portfolio) || isCommunityPortfolio(portfolio)) && (() => {
              // Combine all members: creator (unless external and not going), managers, members
              const allMemberIds: string[] = []
              const creatorInMembers = members.includes(portfolio.user_id)
              const includeCreator =
                !isExternalActivity || creatorInMembers
              if (includeCreator) allMemberIds.push(portfolio.user_id)
              managers.forEach((managerId: string) => {
                if (managerId !== portfolio.user_id) allMemberIds.push(managerId)
              })
              members.forEach((memberId: string) => {
                if (memberId !== portfolio.user_id && !managers.includes(memberId)) allMemberIds.push(memberId)
              })
              const totalMembers = allMemberIds.length
              const hasMembers = totalMembers > 0
              const hasHosts = isActivityPortfolio(portfolio) && !isExternalActivity && (activityHostProjects.length > 0 || activityHostCommunities.length > 0)
              const hasUploader = isActivityPortfolio(portfolio) && isExternalActivity

              if (!hasMembers && !hasHosts && !hasUploader) return null

              return (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {hasMembers && (
                    memberAvatarsLoading ? (
                      <div className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100">
                        <UIText className="text-gray-500">Loading members...</UIText>
                      </div>
                    ) : (
                      <Link
                        href={`${getPortfolioUrl(portfolio.type, portfolio.id)}/members`}
                        className="inline-flex items-center gap-2 px-2 py-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
                        title="View all members"
                      >
                        {(() => {
                          const memberInfo = allMemberIds.map((memberId: string) => {
                            const avatarInfo = memberAvatars.find(m => m.id === memberId)
                            return { id: memberId, avatar: avatarInfo?.avatar || null, name: avatarInfo?.name || null }
                          })
                          const sortedMembers = [...memberInfo].sort((a, b) => {
                            if (currentUserId && a.id === currentUserId) return -1
                            if (currentUserId && b.id === currentUserId) return 1
                            return 0
                          })
                          const displayMembers = sortedMembers.slice(0, 5)
                          return (
                            <div className="flex items-center gap-2">
                              <div className="flex -space-x-2">
                                {displayMembers.map((member, index) => (
                                  <div key={member.id} className="relative" style={{ zIndex: displayMembers.length - index }}>
                                    <UserAvatar userId={member.id} name={member.name} avatar={member.avatar} size={32} showLink={false} />
                                  </div>
                                ))}
                              </div>
                              <UIText className="text-gray-600">
                                {totalMembers} {isExternalActivity
                                  ? (totalMembers === 1 ? 'is going' : 'are going')
                                  : (totalMembers === 1 ? 'member' : 'members')}
                              </UIText>
                            </div>
                          )
                        })()}
                      </Link>
                    )
                  )}
                  {/* Uploader pill (external activities only - shows owner where host would be) */}
                  {hasUploader && (
                    <Link
                      href={`/portfolio/human/${portfolio.user_id}`}
                      className="inline-flex items-center gap-2 px-2 py-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0 min-w-0"
                      title="Uploaded by"
                    >
                      <UserAvatar
                        userId={portfolio.user_id}
                        name={memberAvatars.find(m => m.id === portfolio.user_id)?.name}
                        avatar={memberAvatars.find(m => m.id === portfolio.user_id)?.avatar}
                        size={32}
                        showLink={false}
                      />
                      <UIText className="text-gray-600 whitespace-nowrap">
                        uploaded by {memberAvatars.find(m => m.id === portfolio.user_id)?.name || 'creator'}
                      </UIText>
                    </Link>
                  )}
                  {/* Host projects and communities pill (activities only, non-external) */}
                  {hasHosts && (
                    <div
                      className="inline-flex items-center gap-2 px-2 py-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0 min-w-0"
                      title={
                        activityHostProjects.length + activityHostCommunities.length === 1
                          ? (activityHostProjects[0] || activityHostCommunities[0])?.name
                          : `Hosted by ${activityHostProjects.length} project${activityHostProjects.length !== 1 ? 's' : ''}${activityHostProjects.length > 0 && activityHostCommunities.length > 0 ? ' and ' : ''}${activityHostCommunities.length} communit${activityHostCommunities.length !== 1 ? 'ies' : 'y'}`
                      }
                    >
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {activityHostProjects.slice(0, 5).map((proj) => (
                          <Link
                            key={`project-${proj.id}`}
                            href={getPortfolioUrl('projects', proj.id)}
                            className="block hover:opacity-90"
                          >
                            <StickerAvatar
                              src={proj.avatar}
                              alt={proj.name}
                              type="projects"
                              size={34}
                              emoji={proj.emoji}
                              name={proj.name}
                              normalizeScale={1.0}
                              variant="mini"
                            />
                          </Link>
                        ))}
                        {activityHostCommunities.slice(0, 5).map((comm) => (
                          <Link
                            key={`community-${comm.id}`}
                            href={getPortfolioUrl('community', comm.id)}
                            className="block hover:opacity-90"
                          >
                            <StickerAvatar
                              src={comm.avatar}
                              alt={comm.name}
                              type="community"
                              size={34}
                              emoji={comm.emoji}
                              name={comm.name}
                              normalizeScale={1.0}
                              variant="mini"
                            />
                          </Link>
                        ))}
                      </div>
                      <UIText className="text-gray-600 whitespace-nowrap">
                        {activityHostProjects.length + activityHostCommunities.length === 1
                          ? `hosted by ${(activityHostProjects[0] || activityHostCommunities[0])?.name ?? 'host'}`
                          : activityHostProjects.length > 0 && activityHostCommunities.length > 0
                            ? `hosted by ${activityHostProjects.length} project${activityHostProjects.length !== 1 ? 's' : ''} and ${activityHostCommunities.length} communit${activityHostCommunities.length !== 1 ? 'ies' : 'y'}`
                            : activityHostProjects.length > 0
                              ? `hosted by ${activityHostProjects.length} project${activityHostProjects.length !== 1 ? 's' : ''}`
                              : `hosted by ${activityHostCommunities.length} communit${activityHostCommunities.length !== 1 ? 'ies' : 'y'}`}
                      </UIText>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Buttons */}
            <div className="mb-6">
              {isCommunityPortfolio(portfolio) && !isOwner && !isMember && hasPendingCommunityApplication && (
                <Content className="mb-2 text-gray-600">Your application is received and under review.</Content>
              )}
              <PortfolioActions
                portfolio={portfolio}
                isOwner={isOwner}
                isManager={isManager}
                isMember={isMember}
                isAuthenticated={isAuthenticated}
                authChecked={authChecked}
                currentUserId={currentUserId}
                onEdit={() => setIsEditing(true)}
                onDelete={handleDelete}
                isDeleting={isDeleting}
                onOpenCommunityJoin={
                  isCommunityPortfolio(portfolio) && !isOwner && !isMember && !hasPendingCommunityApplication
                    ? () => {
                        if (!isAuthenticated) setIsCommunityLoginRequiredOpen(true)
                        else {
                          setCommunityJoinFeedback(null)
                          setCommunityJoinPromptAnswer('')
                          setIsCommunityJoinModalOpen(true)
                        }
                      }
                    : undefined
                }
              />
            </div>

            {/* Open Call Stack - right under action buttons */}
            <div className="mb-6 mt-0">
              <OpenCallStack
                context={isHumanPortfolio(portfolio) ? 'human' : 'portfolio'}
                portfolioId={portfolio.id}
                currentUserId={currentUserId}
              />
            </div>

            {/* Portfolio tabs */}
            <div className="mt-4">
              <div className="rounded-xl bg-gray-50/80 backdrop-blur-xl p-1">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      setActiveTab('overview')
                    }}
                    className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                      activeTab === 'overview'
                        ? 'bg-gray-200 text-gray-700'
                        : 'text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <UIText>Overview</UIText>
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      setActiveTab('feed')
                    }}
                    className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                      activeTab === 'feed'
                        ? 'bg-gray-200 text-gray-700'
                        : 'text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <UIText>Feed</UIText>
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      setActiveTab('activities')
                    }}
                    className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                      activeTab === 'activities'
                        ? 'bg-gray-200 text-gray-700'
                        : 'text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <UIText>Activities</UIText>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Overview tab */}
          {activeTab === 'overview' && (
            <>
          {/* Projects Row (for all visitors, human portfolios only) */}
          {isHumanPortfolio(portfolio) && (
            <div className="mt-4 mb-8 group">
              <div className="flex items-center gap-2 mb-4">
                <Apple className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
                <UIText>Projects</UIText>
              </div>
              <div className="relative">
                {/* Horizontal scroll buttons for mouse users */}
                <button
                  type="button"
                  className="hidden group-hover:flex items-center justify-center absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full p-0 bg-gray-200 hover:bg-gray-300 border border-gray-300 shadow-sm z-10 transition-colors"
                  onClick={() => {
                    if (involvementScrollRef.current) {
                      involvementScrollRef.current.scrollBy({ left: -200, behavior: 'smooth' })
                    }
                  }}
                >
                  <ChevronRight className="w-5 h-5 rotate-180 text-gray-700" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  className="hidden group-hover:flex items-center justify-center absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-8 h-8 rounded-full p-0 bg-gray-200 hover:bg-gray-300 border border-gray-300 shadow-sm z-10 transition-colors"
                  onClick={() => {
                    if (involvementScrollRef.current) {
                      involvementScrollRef.current.scrollBy({ left: 200, behavior: 'smooth' })
                    }
                  }}
                >
                  <ChevronRight className="w-5 h-5 text-gray-700" strokeWidth={1.5} />
                </button>
                <div
                  ref={involvementScrollRef}
                  className="flex items-start gap-4 overflow-x-auto pt-2 pb-2 scroll-smooth"
                >
                {projectsLoading ? (
                  <UIText className="text-gray-500">Loading projects...</UIText>
                ) : (
                  <>
                    {projects.map((project) => (
                      <div
                        key={project.id}
                        className="flex flex-col items-center flex-shrink-0 w-48 relative"
                      >
                        {project.visibility === 'private' && (
                          <Lock
                            className="absolute top-2 right-3 w-4 h-4 text-gray-500 z-10"
                            aria-label="Private"
                          />
                        )}
                        <Link
                          href={getPortfolioUrl('projects', project.id)}
                          className="w-full rounded-2xl px-3 pt-3 pb-4 transition-colors hover:bg-gray-100 block"
                        >
                          <div className="flex flex-col items-center gap-3">
                            <StickerAvatar
                              src={project.avatar}
                              alt={project.name}
                              type="projects"
                              size={96}
                              emoji={project.emoji}
                              name={project.name}
                            />
                            <div className="flex flex-col items-center gap-1 w-full">
                              <Content
                                className="text-center max-w-[140px] mx-auto line-clamp-2"
                                title={project.name}
                              >
                                {project.name}
                              </Content>
                              {(project.projectType || project.role) && (
                                <UIText className="text-center max-w-[140px] mx-auto truncate text-gray-600">
                                  {project.projectType && project.role
                                    ? `${project.projectType} · ${project.role}`
                                    : project.projectType || project.role}
                                </UIText>
                              )}
                            </div>
                          </div>
                        </Link>
                      </div>
                    ))}
                    {/* Create Project Button - Only visible to owner */}
                    {authChecked && isOwner && isAuthenticated && (
                      <div className="flex flex-col items-center flex-shrink-0 w-48">
                        <div className="w-full rounded-2xl px-3 pt-3 pb-4">
                          <div className="flex flex-col items-center gap-3">
                            <Link
                              href="/portfolio/create/projects"
                              className="w-24 h-24 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors flex items-center justify-center border-2 border-gray-300 hover:border-gray-400 cursor-pointer"
                            >
                              <svg
                                className="h-12 w-12 text-gray-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 4v16m8-8H4"
                                />
                              </svg>
                            </Link>
                            <UIText className="text-center max-w-[140px] mx-auto truncate">
                              Create Project
                            </UIText>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Create Community button - Admin only, owner only */}
                    {authChecked && isOwner && isAuthenticated && isAdmin === true && (
                      <div className="flex flex-col items-center flex-shrink-0 w-48">
                        <div className="w-full rounded-2xl px-3 pt-3 pb-4">
                          <div className="flex flex-col items-center gap-3">
                            <Link
                              href="/portfolio/create/community"
                              className="w-24 h-24 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors flex items-center justify-center border-2 border-gray-300 hover:border-gray-400 cursor-pointer"
                            >
                              <svg
                                className="h-12 w-12 text-gray-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                />
                              </svg>
                            </Link>
                            <UIText className="text-center max-w-[140px] mx-auto truncate">
                              Create Community
                            </UIText>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                </div>
              </div>
            </div>
          )}

          {/* Activities Row (for all visitors, human and project portfolios) */}
          {(isHumanPortfolio(portfolio) || isProjectPortfolio(portfolio)) && activities.length > 0 && (
            <div className="mt-4 mb-8 group">
              <div className="flex items-center gap-2 mb-4">
                <Balloon className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
                <UIText>Activities</UIText>
              </div>
              <div className="relative">
                <button
                  type="button"
                  className="hidden group-hover:flex items-center justify-center absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full p-0 bg-gray-200 hover:bg-gray-300 border border-gray-300 shadow-sm z-10 transition-colors"
                  onClick={() => {
                    if (activitiesScrollRef.current) {
                      activitiesScrollRef.current.scrollBy({ left: -200, behavior: 'smooth' })
                    }
                  }}
                >
                  <ChevronRight className="w-5 h-5 rotate-180 text-gray-700" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  className="hidden group-hover:flex items-center justify-center absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-8 h-8 rounded-full p-0 bg-gray-200 hover:bg-gray-300 border border-gray-300 shadow-sm z-10 transition-colors"
                  onClick={() => {
                    if (activitiesScrollRef.current) {
                      activitiesScrollRef.current.scrollBy({ left: 200, behavior: 'smooth' })
                    }
                  }}
                >
                  <ChevronRight className="w-5 h-5 text-gray-700" strokeWidth={1.5} />
                </button>
                <div
                  ref={activitiesScrollRef}
                  className="flex items-start gap-4 overflow-x-auto pt-2 pb-2 scroll-smooth"
                >
                  {activitiesLoading ? (
                    <UIText className="text-gray-500">Loading activities...</UIText>
                  ) : (
                    activities.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex flex-col items-center flex-shrink-0 w-48"
                      >
                        <Link
                          href={getPortfolioUrl('activities', activity.id)}
                          className="w-full rounded-2xl px-3 pt-3 pb-4 transition-colors hover:bg-gray-100 block"
                        >
                          <div className="flex flex-col items-center gap-3">
                            <StickerAvatar
                              src={activity.avatar}
                              alt={activity.name}
                              type="activities"
                              size={96}
                              emoji={activity.emoji}
                              name={activity.name}
                            />
                            <div className="flex flex-col items-center gap-1 w-full">
                              <Content
                                className="text-center max-w-[140px] mx-auto line-clamp-2"
                                title={activity.name}
                              >
                                {activity.name}
                              </Content>
                              {activity.hostProjectName && (
                                <UIText className="text-center max-w-[140px] mx-auto truncate text-gray-600">
                                  {activity.hostProjectName}
                                </UIText>
                              )}
                            </div>
                          </div>
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Community Members Grid (for communities) or Notes Feed (for projects/humans) */}
          {isCommunityPortfolio(portfolio) ? (
            <CommunityMembersGrid
              portfolioId={portfolio.id}
              creatorId={portfolio.user_id}
              managers={managers}
              members={members}
              memberRoles={metadata?.memberRoles || {}}
              currentUserId={currentUserId}
            />
          ) : (
            <NotesFeed
              portfolio={portfolio}
              portfolioId={portfolio.id}
              currentUserId={currentUserId}
              canCreateNote={canCreateNote}
            />
          )}
            </>
          )}

          {/* Feed tab: show notes feed for all portfolio types */}
          {activeTab === 'feed' && (
            <div className="mt-6 -mx-6 md:mx-0">
              <FeedView
                currentUserId={currentUserId}
                apiPath={`/api/portfolios/${portfolio.id}/member-feed`}
                showOpenCallStack={false}
              />
            </div>
          )}

          {/* Activities tab */}
          {activeTab === 'activities' && (
            <div className="mt-6 -mx-6 md:mx-0">
              {!currentUserId ? (
                <UIText className="text-gray-500">
                  Log in to see joinable activities.
                </UIText>
              ) : joinableActivitiesLoading ? (
                <UIText className="text-gray-500">Loading activities...</UIText>
              ) : joinableActivitiesError ? (
                <UIText className="text-gray-500">{joinableActivitiesError}</UIText>
              ) : joinableActivities.length === 0 ? (
                <UIText className="text-gray-500">No joinable activities yet.</UIText>
              ) : (
                <ExploreView
                  activities={joinableActivities}
                  userId={currentUserId}
                  isAdmin={isAdmin}
                  dailyMatch={undefined}
                />
              )}
            </div>
          )}
        </div>

        {/* Apply to Join Modal (activities only, when approval is required) */}
        {isActivityPortfolio(portfolio) && isApplyModalOpen && activityCallToJoin && (activityCallToJoin.require_approval ?? true) && (() => {
          const config = activityCallToJoin
          const requiresPrompt = !!config.require_approval && !!config.prompt

          const handleSubmit = async (e: React.FormEvent) => {
            e.preventDefault()
            if (requiresPrompt && !applyPromptAnswer.trim()) {
              setApplyFeedback('Please answer the prompt.')
              return
            }

            setIsApplying(true)
            setApplyFeedback(null)
            try {
              const result = await applyToActivityCallToJoin({
                portfolioId: portfolio.id,
                promptAnswer: requiresPrompt ? applyPromptAnswer.trim() : undefined,
              })

              if (!result || !result.success) {
                setApplyFeedback(result?.error || 'Failed to apply to join.')
                return
              }

              setApplyFeedback(
                config.require_approval
                  ? 'Application submitted. Waiting for approval.'
                  : 'You have joined this activity.'
              )
              setIsApplyModalOpen(false)
              // Refresh to reflect membership changes if auto-joined
              if (!config.require_approval) {
                router.refresh()
              }
            } catch (error) {
              console.error('Failed to apply to activity:', error)
              setApplyFeedback('An unexpected error occurred.')
            } finally {
              setIsApplying(false)
            }
          }

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
                <Title as="h2" className="mb-3">
                  Apply to join
                </Title>
                {config.prompt && (
                  <Content className="mb-2">
                    {config.prompt}
                  </Content>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                  {requiresPrompt && (
                    <div>
                      <UIText as="label" className="block mb-1">
                        Your answer
                      </UIText>
                      <textarea
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                        rows={4}
                        value={applyPromptAnswer}
                        onChange={(e) => setApplyPromptAnswer(e.target.value)}
                      />
                    </div>
                  )}
                  {applyFeedback && (
                    <UIText className="text-gray-600">
                      {applyFeedback}
                    </UIText>
                  )}
                  <div className="flex justify-end gap-2 mt-4">
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => setIsApplyModalOpen(false)}
                      disabled={isApplying}
                    >
                      <UIText>Cancel</UIText>
                    </Button>
                    <Button
                      variant="primary"
                      type="submit"
                      disabled={isApplying}
                    >
                      <UIText>{isApplying ? 'Submitting...' : 'Submit'}</UIText>
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )
        })()}

        {/* Login Required Modal for Apply (activities only, unauthenticated visitors) */}
        {isActivityPortfolio(portfolio) && isLoginRequiredModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
              <Title as="h2" className="mb-3">
                Log in to join this activity
              </Title>
              <Content className="mb-4">
                Please log in to join this activity. After logging in, refresh this page to continue.
              </Content>
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setIsLoginRequiredModalOpen(false)}
                >
                  <UIText>Close</UIText>
                </Button>
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => {
                    window.open('/login', '_blank', 'noopener,noreferrer')
                  }}
                >
                  <UIText>Log in</UIText>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Login Required Modal for Community Join (unauthenticated visitors) */}
        {isCommunityPortfolio(portfolio) && isCommunityLoginRequiredOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
              <Title as="h2" className="mb-3">
                Log in to join this community
              </Title>
              <Content className="mb-4">
                Please log in to join this community. After logging in, refresh this page to continue.
              </Content>
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setIsCommunityLoginRequiredOpen(false)}
                >
                  <UIText>Close</UIText>
                </Button>
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => {
                    window.open('/login', '_blank', 'noopener,noreferrer')
                  }}
                >
                  <UIText>Log in</UIText>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Community Request to Join Modal */}
        {isCommunityPortfolio(portfolio) && isCommunityJoinModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
              <Title as="h2" className="mb-3">
                Request to join
              </Title>
              <Content className="mb-2">
                Please provide proofs of your membership.
              </Content>
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!communityJoinPromptAnswer.trim()) {
                    setCommunityJoinFeedback('Please answer the prompt.')
                    return
                  }
                  setIsSubmittingCommunityJoin(true)
                  setCommunityJoinFeedback(null)
                  try {
                    const result = await applyToCommunityJoin({
                      portfolioId: portfolio.id,
                      promptAnswer: communityJoinPromptAnswer.trim(),
                    })
                    if (!result || !result.success) {
                      setCommunityJoinFeedback(result?.error || 'Failed to submit.')
                      return
                    }
                    setCommunityJoinFeedback('Application submitted. Waiting for approval.')
                    setIsCommunityJoinModalOpen(false)
                  } catch (err) {
                    console.error('Failed to apply to community:', err)
                    setCommunityJoinFeedback('An unexpected error occurred.')
                  } finally {
                    setIsSubmittingCommunityJoin(false)
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <UIText as="label" className="block mb-1">
                    Your answer
                  </UIText>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    rows={4}
                    value={communityJoinPromptAnswer}
                    onChange={(e) => setCommunityJoinPromptAnswer(e.target.value)}
                  />
                </div>
                {communityJoinFeedback && (
                  <UIText className="text-gray-600">{communityJoinFeedback}</UIText>
                )}
                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setIsCommunityJoinModalOpen(false)}
                    disabled={isSubmittingCommunityJoin}
                  >
                    <UIText>Cancel</UIText>
                  </Button>
                  <Button variant="primary" type="submit" disabled={isSubmittingCommunityJoin}>
                    <UIText>{isSubmittingCommunityJoin ? 'Submitting...' : 'Submit'}</UIText>
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Call-to-Join Modal (activities only, owner/manager) */}
        {isActivityPortfolio(portfolio) && isEditingCallToJoin && editCallToJoinDraft && (() => {
          const draft = editCallToJoinDraft

          const handleDraftChange = (partial: Partial<ActivityCallToJoinConfig>) => {
            setEditCallToJoinDraft({
              ...draft,
              ...partial,
            })
          }

          const handleSave = async (e: React.FormEvent) => {
            e.preventDefault()
            const joinBy =
              draft.join_by && draft.join_by.trim().length > 0
                ? draft.join_by
                : null

            try {
              const result = await updateActivityCallToJoin(portfolio.id, {
                enabled: draft.enabled !== false,
                description: draft.description || undefined,
                joinBy,
                requireApproval: draft.require_approval ?? true,
                prompt: draft.require_approval ? draft.prompt || undefined : undefined,
                roles: (draft.roles || []).map((r) => ({
                  id: r.id,
                  label: r.label,
                  activityRole: r.activityRole,
                })),
              })

              if (!result || !result.success) {
                alert(result?.error || 'Failed to update call-to-join.')
                return
              }

              setIsEditingCallToJoin(false)
              router.refresh()
            } catch (error) {
              console.error('Failed to update call-to-join:', error)
              alert('An unexpected error occurred.')
            }
          }

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-xl w-full max-w-lg mx-4 p-6">
                <Title as="h2" className="mb-3">
                  Edit call to join
                </Title>
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      id="call-to-join-enabled"
                      type="checkbox"
                      checked={draft.enabled !== false}
                      onChange={(e) =>
                        handleDraftChange({ enabled: e.target.checked })
                      }
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <UIText as="label" htmlFor="call-to-join-enabled">
                      Enable call to join
                    </UIText>
                  </div>
                  <div>
                    <UIText as="label" className="block mb-1">
                      Description
                    </UIText>
                    <textarea
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      rows={3}
                      value={draft.description || ''}
                      onChange={(e) =>
                        handleDraftChange({ description: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <UIText as="label" className="block mb-1">
                      Join by (ISO datetime, optional)
                    </UIText>
                    <input
                      type="datetime-local"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      value={
                        draft.join_by
                          ? new Date(draft.join_by).toISOString().slice(0, 16)
                          : ''
                      }
                      onChange={(e) => {
                        const value = e.target.value
                        handleDraftChange({
                          join_by: value ? new Date(value).toISOString() : null,
                          join_by_auto_managed: false,
                        })
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="call-to-join-require-approval"
                      type="checkbox"
                      checked={draft.require_approval ?? true}
                      onChange={(e) =>
                        handleDraftChange({ require_approval: e.target.checked })
                      }
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <UIText as="label" htmlFor="call-to-join-require-approval">
                      Require approval
                    </UIText>
                  </div>
                  {draft.require_approval && (
                    <div>
                      <UIText as="label" className="block mb-1">
                        Prompt (optional)
                      </UIText>
                      <textarea
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                        rows={3}
                        value={draft.prompt || ''}
                        onChange={(e) =>
                          handleDraftChange({ prompt: e.target.value })
                        }
                      />
                    </div>
                  )}
                  <div className="flex justify-end gap-2 mt-4">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setIsEditingCallToJoin(false)}
                    >
                      <UIText>Cancel</UIText>
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                    >
                      <UIText>Save</UIText>
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )
        })()}
    </>
  )
}
