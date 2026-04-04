'use client'

import {
  Portfolio,
  isProjectPortfolio,
  isCommunityPortfolio,
  isHumanPortfolio,
  isActivityPortfolio,
  ActivityCallToJoinConfig,
  DB_NON_HUMAN_TYPES,
} from '@/types/portfolio'
import {
  getPortfolioUrl,
  getHumanProfileUrl,
  getHumanFriendsUrl,
  getSpaceCreateUrl,
  getSpaceUrl,
  getSpaceMembersUrl,
} from '@/lib/portfolio/routes'
import Link from 'next/link'
import { PortfolioEditor } from './PortfolioEditor'
import { NotesFeed } from './NotesFeed'
import { ResourcesSection } from './ResourcesSection'
import { PortfolioActions } from './PortfolioActions'
import { StickerAvatar } from './StickerAvatar'
import { DescriptionSpacePopup } from './DescriptionPopups'
import { ImageViewerPopup } from './ImageViewerPopup'
import { OpenCallStack } from '@/components/notes/OpenCallStack'
import { Topic } from '@/types/indexing'
import { useState, useEffect, useRef, useMemo } from 'react'
import {
  deletePortfolio,
  getSubPortfolios,
  applyToActivityCallToJoin,
  updateActivityCallToJoin,
  getPendingJoinRequestsCount,
  applyToCommunityJoin,
  updatePortfolioDescription,
  updatePortfolio,
} from '@/app/portfolio/[idOrSlug]/actions'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getSharedAuth } from '@/lib/auth/browser-auth'
import { Button, Title, Content, UIText, UserAvatar, Card, UIButtonText } from '@/components/ui'
import { Apple, ChevronRight, Lock, Megaphone, Timer, History, X, Plus } from 'lucide-react'
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
import { normalizePortfolioType } from '@/types/portfolio'
import { ActivityCard } from '@/components/explore/ExploreView'
import { getExploreActivityHighlights, type DailyMatchHighlightMeta } from '@/app/explore/actions'

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
  /** Pending invite to join this space (member or manager) — visitor should see accept card, not call-to-join */
  hasPendingPortfolioInvitation?: boolean
  pendingPortfolioInvitationType?: 'member' | 'manager' | null
}

export function PortfolioView({
  portfolio,
  basic,
  isOwner: serverIsOwner,
  currentUserId,
  topInterests = [],
  isAdmin = false,
  hasPendingApplication = false,
  hasPendingCommunityApplication = false,
  hasPendingPortfolioInvitation = false,
  pendingPortfolioInvitationType = null,
}: PortfolioViewProps) {
  const membershipRoleFromServer = (() => {
    if (!currentUserId) {
      return { isManager: false, isMember: false }
    }
    if (
      !isProjectPortfolio(portfolio) &&
      !isCommunityPortfolio(portfolio) &&
      !isActivityPortfolio(portfolio)
    ) {
      return { isManager: false, isMember: false }
    }
    const metadata = portfolio.metadata as any
    const managers = metadata?.managers || []
    const members = metadata?.members || []
    return {
      isManager: Array.isArray(managers) && managers.includes(currentUserId),
      isMember: Array.isArray(members) && members.includes(currentUserId),
    }
  })()

  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDescriptionPopup, setShowDescriptionPopup] = useState(false)
  const [displayDescription, setDisplayDescription] = useState(() => basic.description || '')
  const [showAvatarPopup, setShowAvatarPopup] = useState(false)
  const [isOwner, setIsOwner] = useState(() => serverIsOwner)
  const [isManager, setIsManager] = useState(() => membershipRoleFromServer.isManager)
  const [isMember, setIsMember] = useState(() => membershipRoleFromServer.isMember)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [projects, setProjects] = useState<
    Array<{
      id: string
      name: string
      avatar?: string
      emoji?: string
      slug?: string
      role?: string
      projectType?: string | null
      visibility?: 'public' | 'private'
    }>
  >([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [memberAvatars, setMemberAvatars] = useState<Array<{ id: string; avatar?: string; name?: string }>>([])
  const [memberAvatarsLoading, setMemberAvatarsLoading] = useState(false)
  const [friends, setFriends] = useState<Array<{ id: string; avatar?: string; name?: string }>>([])
  const [friendsLoading, setFriendsLoading] = useState(false)
  const [totalMutualFriends, setTotalMutualFriends] = useState<number>(0)
  const involvementScrollRef = useRef<HTMLDivElement | null>(null)
  const [activityHostProjects, setActivityHostProjects] = useState<Array<{ id: string; name: string; avatar?: string; emoji?: string }>>([])
  const [activityHostCommunities, setActivityHostCommunities] = useState<Array<{ id: string; name: string; avatar?: string; emoji?: string }>>([])
  const [pendingJoinRequestsCount, setPendingJoinRequestsCount] = useState<number | null>(null)
  const [acceptingPortfolioInvitation, setAcceptingPortfolioInvitation] = useState(false)
  const [acceptPortfolioInvitationError, setAcceptPortfolioInvitationError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const effectivePendingApplication = hasPendingApplication && !hasPendingPortfolioInvitation
  const effectivePendingCommunityApplication =
    hasPendingCommunityApplication && !hasPendingPortfolioInvitation

  const handleAcceptPortfolioInvitation = async () => {
    if (!currentUserId) return
    setAcceptingPortfolioInvitation(true)
    setAcceptPortfolioInvitationError(null)
    try {
      const res = await fetch(`/api/portfolios/${portfolio.id}/invitations/${currentUserId}`, {
        method: 'PUT',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAcceptPortfolioInvitationError(
          typeof data.error === 'string' ? data.error : 'Could not accept invitation'
        )
        return
      }
      router.refresh()
    } catch {
      setAcceptPortfolioInvitationError('Could not accept invitation')
    } finally {
      setAcceptingPortfolioInvitation(false)
    }
  }

  useEffect(() => {
    setDisplayDescription(basic.description || '')
  }, [basic.description, portfolio.id])

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
        if (result.success) {
          const fromProjects = result.projects ?? []
          const fromCommunities = result.communities ?? []
          // Overview "Spaces" should list both owned/project rows and community involvements (deduped).
          const seen = new Set<string>()
          const combined: Array<{
            id: string
            name: string
            avatar?: string
            slug: string
            role: string
            projectType?: string | null
            visibility: 'public' | 'private'
          }> = []
          for (const p of fromProjects) {
            if (seen.has(p.id)) continue
            seen.add(p.id)
            combined.push({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              slug: p.slug,
              role: p.role,
              projectType: p.projectType,
              visibility: (p as { visibility?: string }).visibility === 'private' ? 'private' : 'public',
            })
          }
          for (const c of fromCommunities) {
            if (seen.has(c.id)) continue
            seen.add(c.id)
            combined.push({
              id: c.id,
              name: c.name,
              avatar: c.avatar,
              slug: c.slug,
              role: c.role,
              projectType: c.projectType,
              visibility: 'public',
            })
          }

          const projectIds = combined.map((p) => p.id)
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

            const projectData = combined.map((p) => ({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              emoji: projectMap.get(p.id) as string | undefined,
              role: p.role,
              projectType: p.projectType,
              visibility: p.visibility,
              slug: p.slug,
            }))
            setProjects(projectData)
          } else {
            setProjects([])
          }
        } else {
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
        .in('type', [...DB_NON_HUMAN_TYPES])
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
        .in('type', [...DB_NON_HUMAN_TYPES])
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

  // Pending join requests count for owner/manager (call-to-join card badge)
  useEffect(() => {
    const callToJoin = ((portfolio.metadata as any)?.properties?.call_to_join || null) as
      | { enabled?: boolean }
      | null
    const hasCallToJoin = !!callToJoin && callToJoin.enabled !== false
    const visibility = (portfolio as any).visibility === 'private' ? 'private' : 'public'

    if (portfolio.type === 'human' || visibility === 'private' || !hasCallToJoin || (!isOwner && !isManager)) {
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

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this portfolio? This action cannot be undone.')) {
      return
    }

    setIsDeleting(true)
    const result = await deletePortfolio(portfolio.id)

    if (result.success) {
      router.push('/space')
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
  const [orgJoinEligible, setOrgJoinEligible] = useState<boolean>(false)
  const [orgJoinEligibilityChecked, setOrgJoinEligibilityChecked] = useState<boolean>(false)
  const [isEditingCallToJoin, setIsEditingCallToJoin] = useState(false)
  const [editCallToJoinDraft, setEditCallToJoinDraft] = useState<ActivityCallToJoinConfig | null>(null)
  const [editOrgMembershipEmailSuffixes, setEditOrgMembershipEmailSuffixes] = useState<string>('')
  const [isCommunityJoinModalOpen, setIsCommunityJoinModalOpen] = useState(false)
  const [communityJoinPromptAnswer, setCommunityJoinPromptAnswer] = useState('')
  const [isSubmittingCommunityJoin, setIsSubmittingCommunityJoin] = useState(false)
  const [communityJoinFeedback, setCommunityJoinFeedback] = useState<string | null>(null)
  const [isCommunityLoginRequiredOpen, setIsCommunityLoginRequiredOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'feed' | 'spaces'>('overview')
  const [isFriendVisitor, setIsFriendVisitor] = useState(false)
  const [isCurrentPortfolioSubscribed, setIsCurrentPortfolioSubscribed] = useState(false)
  const didSetInitialTabRef = useRef(false)

  const userIsInThisPortfolio = (userId: string | undefined, p: Portfolio): boolean => {
    if (!userId) return false
    if (p.user_id === userId) return true
    const meta = (p.metadata as any) || {}
    const members: string[] = Array.isArray(meta?.members) ? meta.members : []
    const managers: string[] = Array.isArray(meta?.managers) ? meta.managers : []
    return members.includes(userId) || managers.includes(userId)
  }

  const getHumanRoleForSpace = (space: any, humanUserId: string | undefined): string | null => {
    if (!humanUserId) return null
    if (String(space?.user_id || '') === String(humanUserId)) return 'Host'
    const meta = (space?.metadata as any) || {}
    const memberRoles = (meta?.memberRoles as Record<string, unknown> | undefined) || undefined
    const assignedRoleRaw = memberRoles ? memberRoles[String(humanUserId)] : undefined
    const assignedRole = typeof assignedRoleRaw === 'string' ? assignedRoleRaw.trim() : ''
    if (assignedRole) return assignedRole
    const managers: string[] = Array.isArray(meta?.managers) ? meta.managers : []
    const members: string[] = Array.isArray(meta?.members) ? meta.members : []
    if (managers.map(String).includes(String(humanUserId))) return 'Manager'
    if (members.map(String).includes(String(humanUserId))) return 'Member'
    return null
  }

  const shouldShowSpacesTab = isHumanPortfolio(portfolio) || normalizePortfolioType(portfolio.type) === 'space'
  const spacesApiPath = isHumanPortfolio(portfolio)
    ? `/api/portfolios/${encodeURIComponent(portfolio.id)}/member-spaces`
    : `/api/portfolios/${encodeURIComponent(portfolio.id)}/hosted-spaces`

  // For human portfolios: determine whether the visitor is an accepted friend of this human.
  useEffect(() => {
    if (!authChecked || !currentUserId) {
      setIsFriendVisitor(false)
      return
    }
    if (!isHumanPortfolio(portfolio)) {
      setIsFriendVisitor(false)
      return
    }
    if (portfolio.user_id === currentUserId) {
      setIsFriendVisitor(false)
      return
    }

    let cancelled = false
    supabase
      .from('friends')
      .select('status')
      .or(
        `and(user_id.eq.${currentUserId},friend_id.eq.${portfolio.user_id}),and(user_id.eq.${portfolio.user_id},friend_id.eq.${currentUserId})`
      )
      .eq('status', 'accepted')
      .maybeSingle()
      .then((res: { data: unknown; error: unknown }) => {
        if (cancelled) return
        if (res.error) {
          setIsFriendVisitor(false)
          return
        }
        setIsFriendVisitor(!!res.data)
      })
      .catch(() => {
        if (!cancelled) setIsFriendVisitor(false)
      })

    return () => {
      cancelled = true
    }
  }, [authChecked, currentUserId, portfolio, supabase])

  // For space portfolios: detect whether the visitor is subscribed (used for initial tab defaulting).
  useEffect(() => {
    if (!authChecked || !currentUserId) {
      setIsCurrentPortfolioSubscribed(false)
      return
    }
    if (normalizePortfolioType(portfolio.type) !== 'space') {
      setIsCurrentPortfolioSubscribed(false)
      return
    }
    if (userIsInThisPortfolio(currentUserId, portfolio)) {
      setIsCurrentPortfolioSubscribed(false)
      return
    }

    let cancelled = false
    supabase
      .from('subscriptions')
      .select('portfolio_id')
      .eq('user_id', currentUserId)
      .eq('portfolio_id', portfolio.id)
      .maybeSingle()
      .then((res: { data: unknown; error: unknown }) => {
        if (cancelled) return
        if (res.error) {
          setIsCurrentPortfolioSubscribed(false)
          return
        }
        setIsCurrentPortfolioSubscribed(!!res.data)
      })
      .catch(() => {
        if (!cancelled) setIsCurrentPortfolioSubscribed(false)
      })

    return () => {
      cancelled = true
    }
  }, [authChecked, currentUserId, portfolio, supabase])

  // Initial tab: land on Feed when visiting your own/friend human, or a joined/subscribed space.
  useEffect(() => {
    if (didSetInitialTabRef.current) return
    if (!authChecked) return

    const shouldDefaultToFeed =
      (isHumanPortfolio(portfolio) && (portfolio.user_id === currentUserId || isFriendVisitor)) ||
      (normalizePortfolioType(portfolio.type) === 'space' &&
        (userIsInThisPortfolio(currentUserId, portfolio) || isCurrentPortfolioSubscribed))

    if (!shouldDefaultToFeed) return
    if (activeTab !== 'overview') return

    didSetInitialTabRef.current = true
    setActiveTab('feed')
  }, [
    activeTab,
    authChecked,
    currentUserId,
    isCurrentPortfolioSubscribed,
    isFriendVisitor,
    portfolio,
  ])

  useEffect(() => {
    if (activeTab !== 'feed') return
    if (!currentUserId || !authChecked) return

    const post = (target_type: 'friend' | 'joined_space' | 'subscribed_space', target_id: string) => {
      fetch('/api/last-checked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type, target_id }),
      }).catch(() => {})
    }

    if (isHumanPortfolio(portfolio)) {
      if (portfolio.user_id !== currentUserId) {
        post('friend', portfolio.user_id)
      }
      return
    }

    const inPortfolio = userIsInThisPortfolio(currentUserId, portfolio)
    const isSpace = normalizePortfolioType(portfolio.type) === 'space'

    if (inPortfolio) {
      post('joined_space', portfolio.id)
      return
    }
    if (isSpace && isCurrentPortfolioSubscribed) {
      post('subscribed_space', portfolio.id)
    }
  }, [
    activeTab,
    authChecked,
    currentUserId,
    isCurrentPortfolioSubscribed,
    portfolio.id,
    portfolio.user_id,
    portfolio.type,
  ])

  type SpacesApiPortfolio = {
    id: string
    type: string
    slug: string | null
    user_id: string
    visibility: string | null
    created_at?: string | null
    metadata: any
    member_preview?: Array<{ userId: string; name?: string | null; avatar?: string | null }>
  }

  const [spacesList, setSpacesList] = useState<SpacesApiPortfolio[]>([])
  const [spacesLoading, setSpacesLoading] = useState(false)
  const [spacesError, setSpacesError] = useState<string | null>(null)
  const [spacesSearchMode, setSpacesSearchMode] = useState(false)
  const [spacesQuery, setSpacesQuery] = useState('')
  const [spacesHighlights, setSpacesHighlights] = useState<Record<string, DailyMatchHighlightMeta>>({})
  const [spacesLastNoteById, setSpacesLastNoteById] = useState<Record<string, string | null>>({})
  const [spacesLastNoteLoaded, setSpacesLastNoteLoaded] = useState(false)
  const [feedRowUnreadBySpaceId, setFeedRowUnreadBySpaceId] = useState<Record<string, number>>({})
  const [feedRowSubscribedSpaceIds, setFeedRowSubscribedSpaceIds] = useState<Set<string>>(new Set())
  const feedRowUnreadFetchKeyRef = useRef<string>('')

  const getSpaceName = (p: SpacesApiPortfolio): string => {
    const basic = (p.metadata as any)?.basic || {}
    return (basic.name as string) || ''
  }

  const getSpaceStatus = (p: SpacesApiPortfolio): string | null => {
    const status = (p.metadata as any)?.status
    return typeof status === 'string' ? status : null
  }

  const getSpaceActivityDateTime = (p: SpacesApiPortfolio): ActivityDateTimeValue | null => {
    const props = (p.metadata as any)?.properties || {}
    const dt = props.activity_datetime
    return dt && typeof dt === 'object' ? (dt as ActivityDateTimeValue) : null
  }

  const isSpaceLive = (p: SpacesApiPortfolio): boolean => {
    const status = getSpaceStatus(p)
    const dt = getSpaceActivityDateTime(p)
    if (dt?.start) return isActivityLive(dt, status)
    return status === 'live'
  }

  const isSpaceUpcoming = (p: SpacesApiPortfolio): boolean => {
    const status = getSpaceStatus(p)
    if (status === 'archived') return false
    const dt = getSpaceActivityDateTime(p)
    const start = dt?.start ? new Date(dt.start) : null
    if (!start || Number.isNaN(start.getTime())) return false
    return start.getTime() > Date.now()
  }

  const renderSpaceLiveOrUpcomingPill = (p: SpacesApiPortfolio): React.ReactNode => {
    const dt = getSpaceActivityDateTime(p)
    const status = getSpaceStatus(p)
    const hasActivity = !!dt?.start

    // Match the exact pill styles used next to the portfolio title.
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
      return null
    }

    const live = isActivityLive(dt as ActivityDateTimeValue, status)
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

    const start = dt?.start ? new Date(dt.start) : null
    const validStart = start && !Number.isNaN(start.getTime()) ? start : null
    if (!validStart) return null
    if (status === 'archived') return null
    if (new Date() >= validStart) return null

    const label = formatDistanceToNowStrict(validStart, { addSuffix: true })
    return (
      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100">
        <Timer className="w-3 h-3 text-blue-600 flex-shrink-0" aria-hidden />
        <UIText as="span" className="text-[11px] leading-none text-blue-600">
          {label}
        </UIText>
      </div>
    )
  }

  const isSpaceJoinable = (p: SpacesApiPortfolio): boolean => {
    if (!currentUserId) return false
    if ((p.visibility || 'public') === 'private') return false
    const status = getSpaceStatus(p)
    if (status === 'archived') return false

    // Membership check: owner OR manager OR member -> not joinable
    if (p.user_id === currentUserId) return false
    const meta = (p.metadata as any) || {}
    const managersArr: string[] = Array.isArray(meta?.managers) ? meta.managers : []
    const membersArr: string[] = Array.isArray(meta?.members) ? meta.members : []
    if (managersArr.includes(currentUserId) || membersArr.includes(currentUserId)) return false

    const props = meta?.properties || {}
    const callToJoin = props.call_to_join || null
    const dt = getSpaceActivityDateTime(p) ?? undefined
    const visibility = (p.visibility as 'public' | 'private' | undefined | null) ?? 'public'
    return isCallToJoinWindowOpen(visibility, callToJoin, dt, status)
  }

  type TimelineItem = {
    portfolio: SpacesApiPortfolio
    activity: {
      id: string
      name: string
      avatar?: string
      emoji?: string
      description?: string
      hostProjectId?: string | null
      activityDateTime?: ActivityDateTimeValue | null
      location?: ActivityLocationValue | null
      external?: boolean
    }
  }

  const toExploreActivity = (p: SpacesApiPortfolio): TimelineItem['activity'] => {
    const meta = (p.metadata as any) || {}
    const basic = meta.basic || {}
    const props = meta.properties || {}
    return {
      id: p.id,
      name: (basic.name as string) || 'Space',
      avatar: basic.avatar as string | undefined,
      emoji: basic.emoji as string | undefined,
      description: (basic.description as string) || undefined,
      hostProjectId: null,
      activityDateTime: (props.activity_datetime as ActivityDateTimeValue | null | undefined) ?? null,
      location: (props.location as ActivityLocationValue | null | undefined) ?? null,
      external: props.external === true,
    }
  }

  const getStartDate = (a: TimelineItem['activity']): Date | null => {
    const start = a.activityDateTime?.start
    if (!start) return null
    const d = new Date(start)
    if (Number.isNaN(d.getTime())) return null
    return d
  }

  const getDateKey = (a: TimelineItem['activity']): string => {
    const d = getStartDate(a)
    if (!d) return 'no-date'
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const formatDateGroupLabel = (key: string): string => {
    if (key === 'no-date') return 'Anytime'
    const [y, m, d] = key.split('-').map((v) => parseInt(v, 10))
    if (!y || !m || !d) return 'Anytime'
    const date = new Date(y, m - 1, d)
    if (Number.isNaN(date.getTime())) return 'Anytime'

    const today = new Date()
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate()
    ).padStart(2, '0')}`
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(tomorrow.getDate()).padStart(2, '0')}`

    if (key === todayKey) {
      const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date)
      return `Today ${weekday}`
    }
    if (key === tomorrowKey) {
      const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date)
      return `Tomorrow ${weekday}`
    }

    const monthDay = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(date)
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date)
    return `${monthDay} ${weekday}`
  }

  // Spaces list for overview / feed / spaces tabs: depend only on API path, not activeTab,
  // so switching tabs does not refetch the same list.
  useEffect(() => {
    if (!shouldShowSpacesTab) return

    let cancelled = false
    setSpacesLoading(true)
    setSpacesError(null)
    // Reset so the feed row skeleton stays visible until ordering data is ready.
    setSpacesLastNoteLoaded(false)
    fetch(spacesApiPath)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const list: SpacesApiPortfolio[] = Array.isArray(data?.portfolios) ? data.portfolios : []
        setSpacesList(list)
      })
      .catch(() => {
        if (cancelled) return
        setSpacesError('Failed to load spaces.')
        setSpacesList([])
      })
      .finally(() => {
        if (cancelled) return
        setSpacesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [shouldShowSpacesTab, spacesApiPath])

  useEffect(() => {
    if (!currentUserId) return
    if (!spacesList || spacesList.length === 0) return
    let cancelled = false
    const run = async () => {
      try {
        const ids = spacesList.map((p) => p.id)
        const result = await getExploreActivityHighlights(currentUserId, ids)
        if (!cancelled && result.success) {
          setSpacesHighlights(result.highlights || {})
        }
      } catch {
        // non-critical UI
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [currentUserId, spacesList])

  useEffect(() => {
    if (!spacesList || spacesList.length === 0) {
      setSpacesLastNoteById({})
      // Empty list: feed-tab row ordering is trivially ready; otherwise the top row
      // (including create-space placeholder for eligible users) never renders.
      setSpacesLastNoteLoaded(true)
      return
    }

    let cancelled = false
    const run = async () => {
      try {
        const ids = spacesList.map((p) => p.id).filter(Boolean)
        const qs = new URLSearchParams({ portfolio_ids: ids.join(',') })
        const res = await fetch(`/api/portfolios/last-note-created-at?${qs.toString()}`)
        const data = await res.json()
        if (cancelled) return
        const next = (data?.lastNoteByPortfolioId as Record<string, string | null> | undefined) || {}
        setSpacesLastNoteById(next)
        setSpacesLastNoteLoaded(true)
      } catch {
        if (!cancelled) {
          setSpacesLastNoteById({})
          setSpacesLastNoteLoaded(true)
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [spacesList])

  const needsPortfolioFeedRowData = activeTab === 'overview' || activeTab === 'feed'

  // Feed tab row: unread counts + subscription status for indicators (load in parallel with feed below).
  useEffect(() => {
    if (!needsPortfolioFeedRowData) {
      feedRowUnreadFetchKeyRef.current = ''
      return
    }
    if (!currentUserId) return
    if (!spacesList || spacesList.length === 0) {
      setFeedRowUnreadBySpaceId({})
      setFeedRowSubscribedSpaceIds(new Set())
      return
    }

    let cancelled = false
    const run = async () => {
      try {
        const eligibleIds = spacesList
          .filter((p) => isSpaceLive(p) || isSpaceUpcoming(p))
          .map((p) => String(p.id))
          .filter(Boolean)

        // Fetch only once per (user + eligibleIds) set to prevent request spam.
        const fetchKey = `${currentUserId}:${eligibleIds.join(',')}`
        if (feedRowUnreadFetchKeyRef.current === fetchKey) {
          return
        }
        feedRowUnreadFetchKeyRef.current = fetchKey

        if (eligibleIds.length === 0) {
          if (!cancelled) {
            setFeedRowUnreadBySpaceId({})
            setFeedRowSubscribedSpaceIds(new Set())
          }
          return
        }

        // Only query subscriptions for spaces the user is NOT already a member of.
        const nonJoinedEligibleIds = eligibleIds.filter((id) => {
          const p = spacesList.find((x) => String(x.id) === id)
          if (!p) return true
          if (p.user_id === currentUserId) return false
          const meta = (p.metadata as any) || {}
          const managersArr: string[] = Array.isArray(meta?.managers) ? meta.managers : []
          const membersArr: string[] = Array.isArray(meta?.members) ? meta.members : []
          return !managersArr.includes(currentUserId) && !membersArr.includes(currentUserId)
        })

        const [unreadRes, subsRes] = await Promise.all([
          fetch(
            `/api/unread-counts?${new URLSearchParams({
              space_ids: eligibleIds.join(','),
            }).toString()}`
          ).then((r) => r.json().catch(() => ({}))),
          nonJoinedEligibleIds.length > 0
            ? supabase
                .from('subscriptions')
                .select('portfolio_id')
                .eq('user_id', currentUserId)
                .in('portfolio_id', nonJoinedEligibleIds)
            : Promise.resolve({ data: [] as any[] }),
        ])

        const unread = (unreadRes?.spaces as Record<string, number> | undefined) || {}
        const subscribedIds = new Set<string>(
          ((subsRes as any)?.data || []).map((r: any) => String(r.portfolio_id)).filter(Boolean)
        )

        if (!cancelled) {
          setFeedRowUnreadBySpaceId(unread)
          setFeedRowSubscribedSpaceIds(subscribedIds)
        }
      } catch {
        if (!cancelled) {
          setFeedRowUnreadBySpaceId({})
          setFeedRowSubscribedSpaceIds(new Set())
          feedRowUnreadFetchKeyRef.current = ''
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [needsPortfolioFeedRowData, currentUserId, spacesList, supabase])

  const userIsInSpace = (space: SpacesApiPortfolio, userId: string): boolean => {
    if (!userId) return false
    if (space.user_id === userId) return true
    const meta = (space.metadata as any) || {}
    const managersArr: string[] = Array.isArray(meta?.managers) ? meta.managers : []
    const membersArr: string[] = Array.isArray(meta?.members) ? meta.members : []
    return managersArr.includes(userId) || membersArr.includes(userId)
  }

  const renderSpaceFeedRowTile = (p: SpacesApiPortfolio): React.ReactNode => {
    const basic = (p.metadata as any)?.basic || {}
    const name = (basic.name as string) || 'Space'
    const avatar = basic.avatar as string | undefined
    const emoji = basic.emoji as string | undefined
    const joinable = isSpaceJoinable(p)
    const pill = renderSpaceLiveOrUpcomingPill(p)
    const role = isHumanPortfolio(portfolio) ? getHumanRoleForSpace(p, portfolio.user_id) : null
    const unread = feedRowUnreadBySpaceId[String(p.id)] || 0
    const joined = currentUserId ? userIsInSpace(p, currentUserId) : false
    const subscribed = feedRowSubscribedSpaceIds.has(String(p.id))
    const isJoinedOrSubscribed = joined || subscribed

    return (
      <div key={p.id} className="flex flex-col items-center flex-shrink-0 w-48 relative">
        <div className="absolute top-2 right-3 z-10 flex flex-col items-end gap-1">
          {(p.visibility || 'public') === 'private' && (
            <Lock className="w-4 h-4 text-gray-500" aria-label="Private" />
          )}
          {unread > 0 ? (
            isJoinedOrSubscribed ? (
              <div className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-red-500">
                <UIText as="span" className="text-[11px] text-white leading-none">
                  {unread}
                </UIText>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100">
                <UIText as="span" className="text-[11px] text-gray-700 leading-none">
                  New updates
                </UIText>
              </div>
            )
          ) : joinable ? (
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100">
              <UIText as="span" className="text-[11px] text-orange-700 leading-none">
                Joinable
              </UIText>
            </div>
          ) : null}
        </div>

        <Link
          href={getSpaceUrl(p.slug || p.id)}
          className="w-full rounded-2xl px-3 pt-3 pb-4 transition-colors hover:bg-gray-100 block"
        >
          <div className="flex flex-col items-center gap-3">
            <StickerAvatar
              src={avatar}
              alt={name}
              type="space"
              size={96}
              emoji={emoji}
              name={name}
            />
            <div className="flex flex-col items-center gap-1 w-full">
              <Content className="text-center max-w-[140px] mx-auto line-clamp-2" title={name}>
                {name}
              </Content>
              {role && (
                <UIText as="span" className="text-[11px] text-gray-600 leading-none">
                  {role}
                </UIText>
              )}
              {pill}
            </div>
          </div>
        </Link>
      </div>
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

  useEffect(() => {
    // Check if user is verified for one-click org join on this space.
    // Only relevant for visitors when call-to-join requires approval.
    const requiresApproval = activityCallToJoin?.require_approval ?? true
    if (!isAuthenticated || isOwner || isManager || isMember) {
      setOrgJoinEligible(false)
      setOrgJoinEligibilityChecked(true)
      return
    }
    if (!activityCallToJoin || !requiresApproval) {
      setOrgJoinEligible(false)
      setOrgJoinEligibilityChecked(true)
      return
    }
    if ((portfolio as any).visibility === 'private') {
      setOrgJoinEligible(false)
      setOrgJoinEligibilityChecked(true)
      return
    }

    let cancelled = false
    setOrgJoinEligibilityChecked(false)
    fetch(`/api/spaces/org-eligibility?portfolioId=${encodeURIComponent(portfolio.id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setOrgJoinEligible(Boolean(data?.eligible))
        setOrgJoinEligibilityChecked(true)
      })
      .catch(() => {
        if (cancelled) return
        setOrgJoinEligible(false)
        setOrgJoinEligibilityChecked(true)
      })
    return () => {
      cancelled = true
    }
  }, [
    portfolio.id,
    (portfolio as any).visibility,
    isAuthenticated,
    isOwner,
    isManager,
    isMember,
    activityCallToJoin?.require_approval,
    Boolean(activityCallToJoin),
  ])
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
  const tabLabel = isHumanPortfolio(portfolio) ? 'Spaces' : 'Navigations'

  return isEditing ? (
    <PortfolioEditor
      portfolio={portfolio}
      onCancel={() => setIsEditing(false)}
      onSave={async () => {
        setIsEditing(false)
        // Force a full page reload to ensure fresh data is loaded
        // This ensures the server action completes and cache is cleared
        const portfolioUrl = getPortfolioUrl(portfolio)
        // Use window.location to force a full page reload with fresh data
        window.location.href = portfolioUrl
      }}
      initialShowActivityPicker={openActivityOnEdit}
      initialShowLocationPicker={openLocationOnEdit}
    />
  ) : (
    <>
    {basic.avatar && (
      <ImageViewerPopup
        open={showAvatarPopup}
        src={basic.avatar}
        alt={basic.name}
        onClose={() => setShowAvatarPopup(false)}
      />
    )}
    {(displayDescription.trim() || isOwner || isManager) && (
      <DescriptionSpacePopup
        open={showDescriptionPopup}
        onClose={() => setShowDescriptionPopup(false)}
        description={displayDescription}
        canEdit={isOwner || isManager}
        onSave={
          isOwner || isManager
            ? (next) => updatePortfolioDescription(portfolio.id, next)
            : undefined
        }
        onSaved={(trimmed) => {
          setDisplayDescription(trimmed)
          router.refresh()
        }}
        emptyViewHint="No description yet. Use the pencil to add one."
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
                    href={getHumanProfileUrl(portfolio.user_id)}
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
                  href={getHumanProfileUrl(portfolio.user_id)}
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
                  href={getPortfolioUrl(portfolio)}
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
              {portfolio.type !== 'human' && (() => {
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
                          Ended
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
                  label = 'Ended'
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
                    label = 'Ended'
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
            {(displayDescription.trim() || isOwner || isManager) && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setShowDescriptionPopup(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setShowDescriptionPopup(true)
                  }
                }}
                className="mb-4 w-full text-left rounded-lg px-2 py-1 -mx-2 -my-1 hover:bg-gray-100 focus-visible:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors cursor-pointer"
                aria-label={displayDescription.trim() ? 'Open full description' : 'Add or edit description'}
              >
                {displayDescription.trim() ? (
                  <Content className="max-h-[7.5rem] whitespace-pre-wrap line-clamp-5 cursor-pointer">
                    {displayDescription}
                  </Content>
                ) : (
                  <Content as="span" className="block text-gray-500 cursor-pointer">
                    Click to add or edit description
                  </Content>
                )}
              </div>
            )}

            {/* Date/time & location badges (non-human portfolios) */}
            {portfolio.type !== 'human' && (() => {
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

            {/* Pending invitation — accept before joining any other way */}
            {portfolio.type !== 'human' &&
              hasPendingPortfolioInvitation &&
              !isOwner &&
              !isManager &&
              !isMember &&
              currentUserId && (
                <Card variant="subtle" padding="sm" className="mb-4 self-start max-w-lg">
                  <div className="flex flex-col gap-1.5 text-left">
                    <div className="flex items-center gap-1.5">
                      <Megaphone className="w-4 h-4 text-gray-500 flex-shrink-0" aria-hidden />
                      <UIText as="span" className="text-gray-600">
                        Invitation
                      </UIText>
                    </div>
                    <Content className="my-1.5">
                      {pendingPortfolioInvitationType === 'manager'
                        ? 'You have been invited to become a manager of this space.'
                        : 'You have been invited to join this space.'}
                    </Content>
                    {acceptPortfolioInvitationError && (
                      <UIText className="text-red-600">{acceptPortfolioInvitationError}</UIText>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void handleAcceptPortfolioInvitation()}
                        disabled={acceptingPortfolioInvitation}
                      >
                        <UIText>
                          {acceptingPortfolioInvitation ? 'Accepting...' : 'Accept invitation'}
                        </UIText>
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

            {/* External activity Join card (simple Join button, no approval) */}
            {isActivityPortfolio(portfolio) &&
              isExternalActivity &&
              !isOwner &&
              !isManager &&
              !isMember &&
              !hasPendingPortfolioInvitation &&
              (() => {
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

            {/* Call-to-Join Card (any non-human portfolio; on when not private and enabled) */}
            {portfolio.type !== 'human' &&
              activityCallToJoin &&
              activityCallToJoin.enabled !== false &&
              (portfolio as any).visibility !== 'private' &&
              (() => {
              const config = activityCallToJoin
              const visibility = (portfolio as any).visibility === 'private' ? 'private' : 'public'
              const activityDateTime = (activityProperties?.activity_datetime as ActivityDateTimeValue | undefined) || null
              const joinWindowOpen = isCallToJoinWindowOpen(visibility, config, activityDateTime, projectStatus)
              const joinByDate = config.join_by ? new Date(config.join_by) : null
              const requiresApproval = config.require_approval ?? true

              // Include server isOwner so first paint matches leadership (client isOwner starts false).
              const canSeeOwnerManagerCard = serverIsOwner || isOwner || isManager
              const canApplyAsVisitor =
                !canSeeOwnerManagerCard &&
                !isMember &&
                joinWindowOpen &&
                !hasPendingPortfolioInvitation
              const visitorShouldSeeCallToJoinCard =
                canSeeOwnerManagerCard || effectivePendingApplication || canApplyAsVisitor

              if (!visitorShouldSeeCallToJoinCard) {
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
                // When no approval is required, auto-join directly (no popup).
                // When approval is required but user is org-verified, also auto-join (no popup).
                if (requiresApproval && !orgJoinEligible) {
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
                    setApplyFeedback('You have joined this portfolio.')
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
                const org = (activityProperties?.org_membership || null) as
                  | { email_suffixes?: unknown }
                  | null
                const suffixes = Array.isArray(org?.email_suffixes)
                  ? (org!.email_suffixes as unknown[])
                      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
                      .join(', ')
                  : ''
                setEditOrgMembershipEmailSuffixes(suffixes)
                setIsEditingCallToJoin(true)
              }

              const membersRequestsUrl = getSpaceMembersUrl(
                portfolio.slug || portfolio.id,
                'tab=requests'
              )
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
                      {effectivePendingApplication ? (
                        <Content className="my-1.5">
                          Your application is received and under review.
                        </Content>
                      ) : (
                        <>
                          <Content className="my-1.5">
                            {config.description?.trim() || 'Join this portfolio.'}
                          </Content>
                          {canApplyAsVisitor && (
                            <div className="flex items-center gap-2 mt-0.5">
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={handleApplyClick}
                                disabled={!joinWindowOpen}
                              >
                                <UIText>
                                  {requiresApproval
                                    ? orgJoinEligible
                                      ? 'Join'
                                      : 'Apply to join'
                                    : 'Join'}
                                </UIText>
                              </Button>
                              {requiresApproval && orgJoinEligible && (
                                <UIText className="text-green-700">
                                  You are verified as part of {((portfolio.metadata as any)?.basic?.name as string) || 'this space'}, please join with one click!
                                </UIText>
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

            {/* Friends Section (human portfolios only) - Under description, no title */}
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
                      href={getHumanFriendsUrl(portfolio.user_id)}
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
                        href={getSpaceMembersUrl(portfolio.slug || portfolio.id)}
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
                      href={getHumanProfileUrl(portfolio.user_id)}
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
                            href={getSpaceUrl((proj as { slug?: string }).slug || proj.id)}
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
                            href={getSpaceUrl((comm as { slug?: string }).slug || comm.id)}
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
              {isCommunityPortfolio(portfolio) &&
                !isOwner &&
                !isMember &&
                effectivePendingCommunityApplication && (
                  <Content className="mb-2 text-gray-600">
                    Your application is received and under review.
                  </Content>
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
                  isCommunityPortfolio(portfolio) &&
                  !isOwner &&
                  !isMember &&
                  !effectivePendingCommunityApplication &&
                  !hasPendingPortfolioInvitation
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
                context={isHumanPortfolio(portfolio) ? 'human' : 'space'}
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
                  {shouldShowSpacesTab && (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        setActiveTab('spaces')
                      }}
                      className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                        activeTab === 'spaces'
                          ? 'bg-gray-200 text-gray-700'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <UIText>Spaces</UIText>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Overview tab */}
          {activeTab === 'overview' && (
            <>
          {/* Resources section (Overview only) */}
          <ResourcesSection
            portfolioId={portfolio.id}
            portfolioType={portfolio.type}
            currentUserId={currentUserId}
          />

          {/* Portfolios Row (for all visitors, human portfolios only) */}
          {isHumanPortfolio(portfolio) && (
            <>
              {(() => {
                const canCreateSpaces = authChecked && isOwner && isAuthenticated
                const eligible = spacesList.filter((p) => isSpaceLive(p) || isSpaceUpcoming(p))
                const sorted = [...eligible].sort((a, b) => {
                  const aKey = spacesLastNoteById[a.id] || a.created_at || null
                  const bKey = spacesLastNoteById[b.id] || b.created_at || null
                  const ad = aKey ? new Date(aKey) : null
                  const bd = bKey ? new Date(bKey) : null
                  const at = ad && !Number.isNaN(ad.getTime()) ? ad.getTime() : 0
                  const bt = bd && !Number.isNaN(bd.getTime()) ? bd.getTime() : 0
                  return bt - at
                })
                const top = sorted.slice(0, 10)

                if (!spacesLoading && top.length === 0 && !canCreateSpaces) return null

                return (
                  <div className="mt-4 mb-8 group">
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <div className="flex items-center gap-2">
                        <Apple className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
                        <UIText>Spaces</UIText>
                      </div>
                      {shouldShowSpacesTab && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('spaces')}
                          className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-800 transition-colors"
                        >
                          <UIText as="span">View all</UIText>
                          <ChevronRight className="w-4 h-4" strokeWidth={1.5} aria-hidden />
                        </button>
                      )}
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
                        {spacesLoading ? (
                          <UIText className="text-gray-500">Loading spaces...</UIText>
                        ) : (
                          <>
                            {canCreateSpaces && (
                            <div className="flex flex-col items-center flex-shrink-0 w-48">
                              <div className="w-full rounded-2xl px-3 pt-3 pb-4">
                                <div className="flex flex-col items-center gap-3">
                                  <Link
                                    href={getSpaceCreateUrl()}
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
                                    Create Space
                                  </UIText>
                                </div>
                              </div>
                            </div>
                            )}
                            {top.map((p) => renderSpaceFeedRowTile(p))}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </>
          )}

          {/* Live spaces section (space portfolios only) */}
          {!isHumanPortfolio(portfolio) &&
            normalizePortfolioType(portfolio.type) === 'space' && (
              <>
                {(() => {
                  const permission =
                    ((portfolio.metadata as any)?.properties?.hosting_permission as string | undefined) || 'managers'
                  const canCreateHostedSpace =
                    authChecked &&
                    isAuthenticated &&
                    (isOwner || isManager || (permission === 'members' && isMember))
                  const eligible = spacesList.filter((p) => isSpaceLive(p) || isSpaceUpcoming(p))
                  const sorted = [...eligible].sort((a, b) => {
                    const aKey = spacesLastNoteById[a.id] || a.created_at || null
                    const bKey = spacesLastNoteById[b.id] || b.created_at || null
                    const ad = aKey ? new Date(aKey) : null
                    const bd = bKey ? new Date(bKey) : null
                    const at = ad && !Number.isNaN(ad.getTime()) ? ad.getTime() : 0
                    const bt = bd && !Number.isNaN(bd.getTime()) ? bd.getTime() : 0
                    return bt - at
                  })
                  const top = sorted.slice(0, 10)

                  // If there are no live/upcoming spaces, hide this section unless the viewer can create one.
                  if (!spacesLoading && top.length === 0 && !canCreateHostedSpace) {
                    return null
                  }

                  return (
                    <div className="mt-4 mb-8 group">
                      <div className="flex items-center justify-between gap-2 mb-4">
                        <div className="flex items-center gap-2">
                          <Apple className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
                          <UIText>Spaces</UIText>
                        </div>
                        {shouldShowSpacesTab && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('spaces')}
                            className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-800 transition-colors"
                          >
                            <UIText as="span">View all</UIText>
                            <ChevronRight className="w-4 h-4" strokeWidth={1.5} aria-hidden />
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <div className="flex items-start gap-4 overflow-x-auto pt-2 pb-2 scroll-smooth">
                          {spacesLoading ? (
                            <UIText className="text-gray-500">Loading spaces...</UIText>
                          ) : (
                            <>
                              {canCreateHostedSpace && (
                                <div className="flex flex-col items-center flex-shrink-0 w-48">
                                  <div className="w-full rounded-2xl px-3 pt-3 pb-4">
                                    <div className="flex flex-col items-center gap-3">
                                      <Link
                                        href={`${getSpaceCreateUrl()}?host=${encodeURIComponent(portfolio.id)}`}
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
                                        Create Space
                                      </UIText>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {top.map((p) => renderSpaceFeedRowTile(p))}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </>
            )}

          {/* Notes feed (unified overview layout) */}
          <NotesFeed
            portfolio={portfolio}
            portfolioId={portfolio.id}
            currentUserId={currentUserId}
            canCreateNote={canCreateNote}
          />
            </>
          )}

          {/* Feed tab: show notes feed for all portfolio types */}
          {activeTab === 'feed' && (
            <div className="mt-6 -mx-6 md:mx-0">
              {currentUserId &&
                (spacesLoading || (!spacesLastNoteLoaded && spacesList.length > 0)) && (
                <div className="mb-6 md:px-10">
                  <div className="flex items-start gap-4 overflow-x-auto pt-2 pb-2 px-6 md:px-0 scroll-smooth">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div
                        key={`portfolio-top-row-skeleton:${idx}`}
                        className="flex flex-col items-center flex-shrink-0 w-48"
                      >
                        <div className="w-full rounded-2xl px-3 pt-3 pb-4">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-24 h-24 rounded-full bg-gray-200 animate-pulse" />
                            <div className="w-32 h-4 rounded bg-gray-200 animate-pulse" />
                            <div className="w-20 h-4 rounded bg-gray-200 animate-pulse" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(() => {
                // Avoid rendering the row until we have stable ordering (last-note timestamps loaded).
                if (!spacesLastNoteLoaded) return null
                if (spacesLoading) return null
                const eligible = spacesList.filter((p) => isSpaceLive(p) || isSpaceUpcoming(p))
                const sorted = [...eligible].sort((a, b) => {
                  const aKey = spacesLastNoteById[a.id] || a.created_at || null
                  const bKey = spacesLastNoteById[b.id] || b.created_at || null
                  const ad = aKey ? new Date(aKey) : null
                  const bd = bKey ? new Date(bKey) : null
                  const at = ad && !Number.isNaN(ad.getTime()) ? ad.getTime() : 0
                  const bt = bd && !Number.isNaN(bd.getTime()) ? bd.getTime() : 0
                  return bt - at
                })
                const allTop = sorted.slice(0, 50)
                const isSpace = !isHumanPortfolio(portfolio) && normalizePortfolioType(portfolio.type) === 'space'
                const hostingPermission =
                  ((portfolio.metadata as any)?.properties?.hosting_permission as string | undefined) || 'managers'
                const canCreateFromThisSpace =
                  authChecked &&
                  isAuthenticated &&
                  isSpace &&
                  (isOwner || isManager || (hostingPermission === 'members' && isMember))
                const canCreateAsHuman =
                  authChecked && isAuthenticated && isHumanPortfolio(portfolio) && isOwner
                const canCreateAnySpace = canCreateFromThisSpace || canCreateAsHuman
                const createSpaceHref = canCreateFromThisSpace
                  ? `${getSpaceCreateUrl()}?host=${encodeURIComponent(portfolio.id)}`
                  : getSpaceCreateUrl()

                if (!currentUserId || (allTop.length === 0 && !canCreateAnySpace)) return null

                return (
                  <div className="mb-6 md:px-10">
                    <div className="flex items-start gap-4 overflow-x-auto pt-2 pb-2 px-6 md:px-0 scroll-smooth">
                      {canCreateAnySpace && (
                        <div className="flex flex-col items-center flex-shrink-0 w-48">
                          <div className="w-full rounded-2xl px-3 pt-3 pb-4">
                            <div className="flex flex-col items-center gap-3">
                              <Link
                                href={createSpaceHref}
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
                                Create Space
                              </UIText>
                            </div>
                          </div>
                        </div>
                      )}
                      {allTop.map((p) => renderSpaceFeedRowTile(p))}
                    </div>
                  </div>
                )
              })()}
              <FeedView
                currentUserId={currentUserId}
                apiPath={`/api/portfolios/${portfolio.id}/member-feed`}
                showOpenCallStack={false}
              />
            </div>
          )}

          {/* Spaces tab */}
          {activeTab === 'spaces' && shouldShowSpacesTab && (
            <div className="mt-6">
              <div className="mb-3 flex items-center gap-2">
                <input
                  type="search"
                  value={spacesQuery}
                  onChange={(e) => setSpacesQuery(e.target.value)}
                  onFocus={() => setSpacesSearchMode(true)}
                  onBlur={(e) => {
                    // Exit search mode when focus leaves the search control area.
                    // Keep search mode if focus moves to the clear button.
                    const next = e.relatedTarget as HTMLElement | null
                    if (next && next.dataset && next.dataset.role === 'spaces-search-clear') {
                      return
                    }
                    setSpacesSearchMode(false)
                    setSpacesQuery('')
                  }}
                  placeholder="Search by name or slug..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  autoComplete="off"
                />
                {spacesSearchMode && (
                  <Button
                    variant="text"
                    onClick={() => {
                      setSpacesSearchMode(false)
                      setSpacesQuery('')
                    }}
                    data-role="spaces-search-clear"
                    disabled={spacesLoading}
                  >
                    <X className="w-4 h-4" aria-hidden />
                  </Button>
                )}
              </div>

              {(() => {
                const isSpace = !isHumanPortfolio(portfolio) && normalizePortfolioType(portfolio.type) === 'space'
                const permission =
                  ((portfolio.metadata as any)?.properties?.hosting_permission as string | undefined) || 'managers'
                const canCreateFromThisSpace =
                  authChecked &&
                  isAuthenticated &&
                  isSpace &&
                  (isOwner || isManager || (permission === 'members' && isMember))

                const canCreateAsHuman = authChecked && isAuthenticated && isHumanPortfolio(portfolio) && isOwner

                if (!canCreateFromThisSpace && !canCreateAsHuman) return null

                const href = canCreateFromThisSpace
                  ? `${getSpaceCreateUrl()}?host=${encodeURIComponent(portfolio.id)}`
                  : getSpaceCreateUrl()

                return (
                  <div className="mb-4 flex justify-start">
                    <Link href={href}>
                      <Button variant="primary">
                        <Plus className="w-4 h-4" aria-hidden />
                        <UIText>Create Space</UIText>
                      </Button>
                    </Link>
                  </div>
                )
              })()}

              {spacesLoading ? (
                <UIText className="text-gray-500">Loading...</UIText>
              ) : spacesError ? (
                <UIText className="text-gray-600">{spacesError}</UIText>
              ) : spacesList.length === 0 ? (
                <Card variant="default" padding="md">
                  <Content className="text-gray-500">No spaces found.</Content>
                </Card>
              ) : (
                (() => {
                  const query = spacesQuery.trim().toLowerCase()
                  const filtered = query
                    ? spacesList.filter((p) => {
                        const name = getSpaceName(p).toLowerCase()
                        const slug = (p.slug || '').toLowerCase()
                        return name.includes(query) || slug.includes(query)
                      })
                    : spacesList

                  if (spacesSearchMode) {
                    const alphabetical = [...filtered].sort((a, b) =>
                      getSpaceName(a).toLowerCase().localeCompare(getSpaceName(b).toLowerCase())
                    )
                    return (
                      <div className="space-y-3">
                        {alphabetical.map((p) => {
                          const joinable = isSpaceJoinable(p)
                          const a = toExploreActivity(p)
                          const meta = (p.metadata as any) || {}
                          const managersArr: string[] = Array.isArray(meta?.managers) ? meta.managers : []
                          const membersArr: string[] = Array.isArray(meta?.members) ? meta.members : []
                          const memberUserIds = Array.from(new Set<string>([p.user_id, ...managersArr, ...membersArr].filter(Boolean)))
                          const memberLabel = memberUserIds.length > 0 ? `${memberUserIds.length} member${memberUserIds.length === 1 ? '' : 's'}` : undefined
                          const memberUsers =
                            Array.isArray(p.member_preview) && p.member_preview.length > 0
                              ? p.member_preview.map((u) => ({
                                  userId: u.userId,
                                  name: u.name ?? null,
                                  avatar: u.avatar ?? null,
                                }))
                              : undefined
                          return (
                            <ActivityCard
                              key={p.id}
                              activity={a as any}
                              hrefOverride={getSpaceUrl(p.slug || p.id)}
                              avatarTypeOverride="space"
                              joinable={joinable}
                              highlight={spacesHighlights[p.id]}
                              memberLabel={memberLabel}
                              memberUserIds={memberUserIds}
                              memberUsers={memberUsers}
                            />
                          )
                        })}
                      </div>
                    )
                  }

                  const items: TimelineItem[] = filtered.map((p) => ({
                    portfolio: p,
                    activity: toExploreActivity(p),
                  }))

                  const sorted = [...items].sort((a, b) => {
                    const da = getStartDate(a.activity)
                    const db = getStartDate(b.activity)
                    if (!da && !db) return 0
                    if (!da) return 1
                    if (!db) return -1
                    return da.getTime() - db.getTime()
                  })

                  const live = sorted.filter((x) => isSpaceLive(x.portfolio))
                  const upcoming = sorted.filter(
                    (x) => !isSpaceLive(x.portfolio) && isSpaceUpcoming(x.portfolio)
                  )

                  const groups: Array<{ label: string; items: TimelineItem[] }> = []

                  if (live.length > 0) {
                    groups.push({ label: 'Live', items: live })
                  }

                  const upcomingGroups = new Map<string, TimelineItem[]>()
                  upcoming.forEach((x) => {
                    const key = getDateKey(x.activity)
                    const list = upcomingGroups.get(key)
                    if (list) list.push(x)
                    else upcomingGroups.set(key, [x])
                  })

                  const sortedKeys = Array.from(upcomingGroups.keys()).sort((a, b) => {
                    if (a === 'no-date' && b === 'no-date') return 0
                    if (a === 'no-date') return 1
                    if (b === 'no-date') return -1
                    return a.localeCompare(b)
                  })

                  sortedKeys.forEach((key) => {
                    const list = upcomingGroups.get(key)
                    if (!list || list.length === 0) return
                    groups.push({ label: formatDateGroupLabel(key), items: list })
                  })

                  if (groups.length === 0) {
                    return (
                      <Card variant="default" padding="md">
                        <Content className="text-gray-500">No live or upcoming spaces.</Content>
                      </Card>
                    )
                  }

                  return (
                    <div className="relative pl-4">
                      <div className="absolute left-1 top-0 bottom-0 border-l border-dashed border-gray-200" />
                      <div className="space-y-6">
                        {groups.map((group) => (
                          <div key={group.label} className="relative pb-1">
                            <div className="ml-2 mb-2 text-gray-500">
                              <UIButtonText as="span">{group.label}</UIButtonText>
                            </div>
                            <div className="ml-2 space-y-4">
                              {group.items.map((x) => (
                                (() => {
                                  const meta = (x.portfolio.metadata as any) || {}
                                  const managersArr: string[] = Array.isArray(meta?.managers) ? meta.managers : []
                                  const membersArr: string[] = Array.isArray(meta?.members) ? meta.members : []
                                  const memberUserIds = Array.from(new Set<string>([x.portfolio.user_id, ...managersArr, ...membersArr].filter(Boolean)))
                                  const memberLabel = memberUserIds.length > 0 ? `${memberUserIds.length} member${memberUserIds.length === 1 ? '' : 's'}` : undefined
                                  const memberUsers =
                                    Array.isArray(x.portfolio.member_preview) && x.portfolio.member_preview.length > 0
                                      ? x.portfolio.member_preview.map((u) => ({
                                          userId: u.userId,
                                          name: u.name ?? null,
                                          avatar: u.avatar ?? null,
                                        }))
                                      : undefined
                                  return (
                                    <ActivityCard
                                      key={x.portfolio.id}
                                      activity={x.activity as any}
                                      hrefOverride={getSpaceUrl(x.portfolio.slug || x.portfolio.id)}
                                      avatarTypeOverride="space"
                                      joinable={isSpaceJoinable(x.portfolio)}
                                      highlight={spacesHighlights[x.portfolio.id]}
                                      memberLabel={memberLabel}
                                      memberUserIds={memberUserIds}
                                      memberUsers={memberUsers}
                                    />
                                  )
                                })()
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()
              )}
            </div>
          )}
        </div>

        {/* Apply to Join Modal (any non-human portfolio, when approval is required) */}
        {portfolio.type !== 'human' && isApplyModalOpen && activityCallToJoin && (activityCallToJoin.require_approval ?? true) && (() => {
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
                  : 'You have joined this portfolio.'
              )
              setIsApplyModalOpen(false)
              // Refresh to reflect membership changes if auto-joined
              if (!config.require_approval) {
                router.refresh()
              }
            } catch (error) {
              console.error('Failed to apply to portfolio:', error)
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

        {/* Login Required Modal for Apply (unauthenticated visitors) */}
        {portfolio.type !== 'human' && isLoginRequiredModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
              <Title as="h2" className="mb-3">
                Log in to join this portfolio
              </Title>
              <Content className="mb-4">
                Please log in to join this portfolio. After logging in, refresh this page to continue.
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

              // Persist org_membership suffixes via shared updatePortfolio API.
              const meta = (portfolio.metadata as any) || {}
              const basic = meta.basic || {}
              const formData = new FormData()
              formData.set('portfolioId', portfolio.id)
              formData.set('name', (basic.name as string) || '')
              formData.set('description', (basic.description as string) || '')
              formData.set('org_membership_email_suffixes', editOrgMembershipEmailSuffixes || '')
              await updatePortfolio(formData)

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
                        Organization email suffixes (optional)
                      </UIText>
                      <input
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                        value={editOrgMembershipEmailSuffixes}
                        onChange={(e) => setEditOrgMembershipEmailSuffixes(e.target.value)}
                        placeholder="e.g. company.com, school.edu"
                        autoComplete="off"
                      />
                      <UIText as="p" className="text-xs text-gray-500 mt-1">
                        People with matching email domains can join without approval.
                      </UIText>
                    </div>
                  )}
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
