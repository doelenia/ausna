'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Title, Content, UIText, Button, UserAvatar } from '@/components/ui'
import { getHumanProfileUrl } from '@/lib/portfolio/routes'
import { approveActivityJoinRequest, respondToActivityJoinRequest } from '@/app/portfolio/[idOrSlug]/actions'
import { normalizePortfolioType } from '@/types/portfolio'

interface UserInfo {
  id: string
  username: string | null
  name: string | null
  avatar: string | null
  isManager?: boolean
  isCreator?: boolean
  role?: string | null
}

interface ActivityJoinRequest {
  id: string
  applicant: UserInfo
  status: string
  createdAt: string
  promptAnswer: string | null
  activityRole: string | null
  respondedAt?: string | null
}

interface SentPortfolioInvitation {
  id: string
  invitee: UserInfo
  inviter: UserInfo
  status: string
  invitation_type: string
  role: string | null
  createdAt: string
  message: string | null
}

type UnifiedActiveRow =
  | { kind: 'request'; request: ActivityJoinRequest }
  | { kind: 'invite'; invite: SentPortfolioInvitation }

interface MembersPageClientProps {
  portfolioId: string
  portfolioName: string
  portfolioType: string
  creatorInfo: UserInfo | null
  memberDetails: UserInfo[]
  subscriberDetails: UserInfo[]
  canManage: boolean
  currentUserId?: string
  joinRequests?: ActivityJoinRequest[]
  /** Outgoing invitations for this portfolio (managers/creator) */
  sentInvitations?: SentPortfolioInvitation[]
  /** When e.g. ?tab=requests is in the URL, open directly to that tab */
  initialTab?: 'members' | 'subscribers' | 'requests'
  /** When true, owner/manager cannot remove other members (external activities) */
  isExternalActivity?: boolean
}

export function MembersPageClient({
  portfolioId,
  portfolioName,
  portfolioType,
  creatorInfo,
  memberDetails,
  subscriberDetails,
  canManage,
  currentUserId,
  joinRequests = [],
  sentInvitations = [],
  initialTab = 'members',
  isExternalActivity = false,
}: MembersPageClientProps) {
  const [activeTab, setActiveTab] = useState<'members' | 'subscribers' | 'requests'>(initialTab)
  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserInfo[]>([])
  const [searching, setSearching] = useState(false)
  const [inviting, setInviting] = useState<string | null>(null)
  const [invitingManager, setInvitingManager] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [inviteRoleInputs, setInviteRoleInputs] = useState<{ [userId: string]: string }>({})
  const [inviteMessageInputs, setInviteMessageInputs] = useState<{ [userId: string]: string }>({})
  const [members, setMembers] = useState(memberDetails)
  const [showCreatorTransfer, setShowCreatorTransfer] = useState(false)
  const [newCreatorId, setNewCreatorId] = useState<string>('')
  const [editingRole, setEditingRole] = useState<string | null>(null)
  const [roleInputs, setRoleInputs] = useState<{ [userId: string]: string }>({})
  const router = useRouter()
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null)
  const [respondMessage, setRespondMessage] = useState('')
  const [cancellingInviteeId, setCancellingInviteeId] = useState<string | null>(null)

  /** Non-human portfolios (space, portfolio, legacy activities/community/projects) use join requests + this tab. */
  const canShowJoinRequestsTab =
    normalizePortfolioType(portfolioType) === 'portfolio' && canManage

  const pendingManagerInviteeIds = useMemo(() => {
    return new Set(
      sentInvitations
        .filter((i) => i.invitation_type === 'manager' && i.status === 'pending')
        .map((i) => i.invitee.id)
    )
  }, [sentInvitations])

  /** Pending join requests and pending invitations, one row per user (request wins over invite). */
  const unifiedActiveRows = useMemo((): UnifiedActiveRow[] => {
    const pendingReqs = joinRequests.filter((r) => r.status === 'pending')
    const applicantIds = new Set(pendingReqs.map((r) => r.applicant.id))
    const pendingInvs = sentInvitations.filter(
      (i) => i.status === 'pending' && !applicantIds.has(i.invitee.id)
    )
    const rank = (r: ActivityJoinRequest) => {
      if (r.status !== 'pending') return 2
      if (!r.respondedAt) return 0
      return 1
    }
    const sortedReqs = [...pendingReqs].sort((a, b) => {
      const d = rank(a) - rank(b)
      if (d !== 0) return d
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    const sortedInvs = [...pendingInvs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    const rows: UnifiedActiveRow[] = [
      ...sortedReqs.map((request) => ({ kind: 'request' as const, request })),
      ...sortedInvs.map((invite) => ({ kind: 'invite' as const, invite })),
    ]
    rows.sort((a, b) => {
      const ta = a.kind === 'request' ? a.request.createdAt : a.invite.createdAt
      const tb = b.kind === 'request' ? b.request.createdAt : b.invite.createdAt
      return new Date(tb).getTime() - new Date(ta).getTime()
    })
    return rows
  }, [joinRequests, sentInvitations])

  const requestsTabAttentionCount = unifiedActiveRows.filter((row) => {
    if (row.kind === 'request') {
      return row.request.status === 'pending' && !row.request.respondedAt
    }
    return true
  }).length

  // Filter members to separate creators, managers, and regular members
  const creator = creatorInfo
  const creatorInMembers = creator ? members.find(m => m.id === creator.id) : null
  const managers = members.filter((m) => m.isManager && !m.isCreator)
  const regularMembers = members.filter((m) => !m.isManager && !m.isCreator)

  // Combine all members: for non-external, creator first then managers then regular. For external, show only "going" and exclude creator (they appear in Uploader section).
  const allMembers: (UserInfo & { isCreator?: boolean })[] = []
  if (isExternalActivity) {
    const creatorId = creator?.id
    allMembers.push(...members.filter(m => m.id !== creatorId))
  } else {
    if (creator) {
      if (creatorInMembers) {
        allMembers.push({ ...creatorInMembers, isCreator: true })
      } else {
        allMembers.push({ ...creator, isCreator: true })
      }
    }
    const creatorId = creator?.id
    managers.forEach(manager => {
      if (manager.id !== creatorId) allMembers.push(manager)
    })
    allMembers.push(...regularMembers)
  }
  
  const isCreator = creator?.id === currentUserId
  const isManager = managers.some(m => m.id === currentUserId) || isCreator
  const isMember = members.some(m => m.id === currentUserId) || isCreator

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    setSearching(true)
    try {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`)
      if (response.ok) {
        const data = await response.json()
        setSearchResults(data.users || [])
      } else {
        console.error('Search failed')
        setSearchResults([])
      }
    } catch (error) {
      console.error('Error searching users:', error)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      handleSearch(searchQuery)
    }, 300)

    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  const handleInvite = async (userId: string, role: string = 'Member') => {
    setInviting(userId)
    try {
      const message = inviteMessageInputs[userId] || ''
      const response = await fetch(`/api/portfolios/${portfolioId}/members/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          role,
          message: message.trim().length > 0 ? message.trim() : undefined,
        }),
      })

      if (response.ok) {
        alert('Invitation sent successfully!')
        setSearchQuery('')
        setSearchResults([])
        setInviteMessageInputs((prev) => {
          const next = { ...prev }
          delete next[userId]
          return next
        })
        router.refresh()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to send invitation')
      }
    } catch (error) {
      console.error('Error sending invitation:', error)
      alert('Failed to send invitation')
    } finally {
      setInviting(null)
    }
  }

  const handleInviteManager = async (userId: string) => {
    setInvitingManager(userId)
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/managers/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      })

      if (response.ok) {
        alert('Manager invitation sent successfully!')
        setSearchQuery('')
        setSearchResults([])
        router.refresh()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to send manager invitation')
      }
    } catch (error) {
      console.error('Error sending manager invitation:', error)
      alert('Failed to send manager invitation')
    } finally {
      setInvitingManager(null)
    }
  }

  const handleRemove = async (userId: string, isSelf: boolean = false) => {
    const isRemovingCreator = isCreator && userId === currentUserId
    
    if (isRemovingCreator) {
      // Show creator transfer dialog
      setShowCreatorTransfer(true)
      return
    }

    const confirmMessage = isSelf 
      ? (isManager && !isCreator ? 'Are you sure you want to step down as manager? You will remain as a member.' : 'Are you sure you want to leave this ' + portfolioType + '?')
      : 'Are you sure you want to remove this member?'
    
    if (!confirm(confirmMessage)) {
      return
    }

    setRemoving(userId)
    try {
      const response = await fetch(
        `/api/portfolios/${portfolioId}/members/${userId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      )

      if (response.ok) {
        // If manager is removing themselves, they become a member, so update local state accordingly
        if (isSelf && isManager && !isCreator) {
          setMembers(members.map(m => 
            m.id === userId ? { ...m, isManager: false } : m
          ))
        } else {
          // Otherwise, remove from members list
          setMembers(members.filter((m) => m.id !== userId))
        }
        router.refresh()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to remove member')
      }
    } catch (error) {
      console.error('Error removing member:', error)
      alert('Failed to remove member')
    } finally {
      setRemoving(null)
    }
  }

  const handleRoleUpdate = async (userId: string, role: string) => {
    // Validate role (max 2 words)
    const words = role.trim().split(/\s+/)
    if (words.length > 2) {
      alert('Role must be 2 words or less')
      return
    }

    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/members/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: role.trim() || null }),
      })

      if (response.ok) {
        // Update local state
        setMembers(members.map(m => 
          m.id === userId ? { ...m, role: role.trim() || null } : m
        ))
        setEditingRole(null)
        setRoleInputs({ ...roleInputs, [userId]: '' })
        router.refresh()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to update role')
      }
    } catch (error) {
      console.error('Error updating role:', error)
      alert('Failed to update role')
    }
  }

  const handleCreatorTransfer = async () => {
    if (!newCreatorId) {
      alert('Please select a new creator')
      return
    }

    setRemoving(currentUserId!)
    try {
      const response = await fetch(
        `/api/portfolios/${portfolioId}/members/${currentUserId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ newCreatorId }),
        }
      )

      if (response.ok) {
        setShowCreatorTransfer(false)
        setNewCreatorId('')
        router.refresh()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to transfer creator')
      }
    } catch (error) {
      console.error('Error transferring creator:', error)
      alert('Failed to transfer creator')
    } finally {
      setRemoving(null)
    }
  }

  const getDisplayName = (user: UserInfo) => {
    return user.name || user.username || `User ${user.id.slice(0, 8)}`
  }

  const getAvatarUrl = (user: UserInfo) => {
    return (
      user.avatar ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(getDisplayName(user))}&background=random`
    )
  }

  const getPendingJoinRequestForUser = (userId: string) =>
    joinRequests.find((r) => r.applicant.id === userId && r.status === 'pending')

  const getPendingInvitationForUser = (userId: string) =>
    sentInvitations.find((i) => i.invitee.id === userId && i.status === 'pending')

  const isUserAlreadyMember = (userId: string) =>
    (!!creator && creator.id === userId) || members.some((m) => m.id === userId)

  const handleCancelInvitation = async (inviteeId: string) => {
    if (!confirm('Cancel this invitation?')) return
    setCancellingInviteeId(inviteeId)
    setRequestError(null)
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/invitations/${inviteeId}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        router.refresh()
      } else {
        const data = await response.json().catch(() => ({}))
        setRequestError(data.error || 'Failed to cancel invitation')
      }
    } catch (error) {
      console.error('Error cancelling invitation:', error)
      setRequestError('Failed to cancel invitation')
    } finally {
      setCancellingInviteeId(null)
    }
  }

  const renderInviteSearchSection = (wrapperClassName: string) => (
    <div className={wrapperClassName}>
      <UIText as="h2" className="mb-4">Invite members</UIText>
      {isManager && (
        <UIText as="p" className="mb-4">
          As a manager, you can also promote existing members to managers using the &quot;Make Manager&quot; button next to each member on the Members tab.
        </UIText>
      )}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by email or username..."
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {searching && (
          <div className="absolute right-3 top-2.5">
            <UIText>Searching...</UIText>
          </div>
        )}
      </div>

      {searchResults.length > 0 && (
        <div className="mt-4 space-y-2">
          <UIText as="h3">Search results</UIText>
          {searchResults.map((user) => {
            const pendingReq = getPendingJoinRequestForUser(user.id)
            const pendingInv = getPendingInvitationForUser(user.id)
            const alreadyMember = isUserAlreadyMember(user.id)
            const statusHint = alreadyMember
              ? 'Already a member of this space.'
              : pendingReq
                ? 'This person has a pending join request. Resolve it before sending an invitation.'
                : pendingInv
                  ? pendingInv.invitation_type === 'manager'
                    ? 'A manager invitation is already pending for this person.'
                    : 'An invitation is already pending for this person.'
                  : null
            const canInviteUser = !alreadyMember && !pendingReq && !pendingInv

            return (
              <div
                key={user.id}
                className="flex flex-col gap-2 p-3 bg-gray-50 rounded-md sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={getAvatarUrl(user)}
                    alt={getDisplayName(user)}
                    className="h-10 w-10 rounded-full"
                  />
                  <div>
                    <UIText as="div">{getDisplayName(user)}</UIText>
                    {user.username && <UIText as="div">@{user.username}</UIText>}
                    {statusHint && (
                      <UIText as="p" className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1">
                        {statusHint}
                      </UIText>
                    )}
                  </div>
                </div>
                {canInviteUser && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={inviteRoleInputs[user.id] || 'Member'}
                      onChange={(e) =>
                        setInviteRoleInputs({ ...inviteRoleInputs, [user.id]: e.target.value })
                      }
                      placeholder="Role (max 2 words)"
                      maxLength={50}
                      className="px-2 py-1 text-sm border border-gray-300 rounded w-32"
                    />
                    <input
                      type="text"
                      value={inviteMessageInputs[user.id] || ''}
                      onChange={(e) =>
                        setInviteMessageInputs({ ...inviteMessageInputs, [user.id]: e.target.value })
                      }
                      placeholder="Message (optional)"
                      maxLength={200}
                      className="px-2 py-1 text-sm border border-gray-300 rounded w-48"
                    />
                    <Button
                      variant="primary"
                      onClick={() => handleInvite(user.id, inviteRoleInputs[user.id] || 'Member')}
                      disabled={inviting === user.id}
                    >
                      <UIText>{inviting === user.id ? 'Sending...' : 'Invite'}</UIText>
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {searchQuery && !searching && searchResults.length === 0 && (
        <div className="mt-4">
          <UIText>No users found</UIText>
        </div>
      )}
    </div>
  )

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-200">
        <button
          onClick={(e) => {
            e.preventDefault()
            setActiveTab('members')
          }}
          className={`pb-2 px-1 border-b-2 transition-colors ${
            activeTab === 'members'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <UIText as="span">{isExternalActivity ? 'Going' : 'Members'} {allMembers.length > 0 && `(${allMembers.length})`}</UIText>
        </button>
        <button
          onClick={(e) => {
            e.preventDefault()
            setActiveTab('subscribers')
          }}
          className={`pb-2 px-1 border-b-2 transition-colors ${
            activeTab === 'subscribers'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <UIText as="span">Subscribers {subscriberDetails.length > 0 && `(${subscriberDetails.length})`}</UIText>
        </button>
        {canShowJoinRequestsTab && (
          <button
            onClick={(e) => {
              e.preventDefault()
              setActiveTab('requests')
            }}
            className={`pb-2 px-1 border-b-2 transition-colors ${
              activeTab === 'requests'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <UIText as="span">
              Requests &amp; Invites{' '}
              {requestsTabAttentionCount > 0 && `(${requestsTabAttentionCount})`}
            </UIText>
          </button>
        )}
      </div>

      {/* Members Tab */}
      {activeTab === 'members' && (
        <>
          {canManage && !canShowJoinRequestsTab &&
            renderInviteSearchSection('mb-8 pb-6 border-b border-gray-200')}

        {/* External activities: show Uploader separately, then Going list */}
        {isExternalActivity && creator && (
          <div className="mb-6">
            <UIText as="h2" className="mb-3">Uploader</UIText>
            <div className="flex items-center justify-between p-3 bg-amber-50 rounded-md">
              <Link
                href={getHumanProfileUrl(creator.id)}
                className="flex items-center gap-3 hover:opacity-80"
              >
                <img
                  src={getAvatarUrl(creator)}
                  alt={getDisplayName(creator)}
                  className="h-10 w-10 rounded-full"
                />
                <div>
                  <UIText as="div">{getDisplayName(creator)}</UIText>
                  {creator.username && (
                    <UIText as="div">@{creator.username}</UIText>
                  )}
                </div>
              </Link>
              <UIText as="span" className="px-2 py-1 text-amber-700 bg-amber-100 rounded uppercase">
                Uploader
              </UIText>
            </div>
          </div>
        )}

        {/* Members / Going Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <UIText as="h2">
              {isExternalActivity ? 'Going' : 'Members'} {allMembers.length > 0 && `(${allMembers.length})`}
            </UIText>
            {(isMember || isManager || isCreator) && currentUserId && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleRemove(currentUserId, true)}
                disabled={removing === currentUserId}
              >
                <UIText>{removing === currentUserId ? 'Leaving...' : 'Leave'}</UIText>
              </Button>
            )}
          </div>
          {allMembers.length === 0 ? (
            <div><UIText>{isExternalActivity ? 'No one is going yet' : 'No members yet'}</UIText></div>
          ) : (
            <div className="space-y-2">
              {allMembers.map((member) => {
                const memberIsCreator = member.isCreator || false
                const memberIsManager = member.isManager || false
                const bgColor = memberIsCreator 
                  ? 'bg-blue-50' 
                  : memberIsManager 
                  ? 'bg-purple-50' 
                  : 'bg-gray-50'
                
                return (
                  <div
                    key={member.id}
                    className={`flex items-center justify-between p-3 ${bgColor} rounded-md`}
                  >
                    <Link
                      href={getHumanProfileUrl(member.id)}
                      className="flex items-center gap-3 hover:opacity-80"
                    >
                      <img
                        src={getAvatarUrl(member)}
                        alt={getDisplayName(member)}
                        className="h-10 w-10 rounded-full"
                      />
                      <div>
                        <UIText as="div">
                          {getDisplayName(member)}
                          {member.id === currentUserId && ' (You)'}
                        </UIText>
                        {member.username && (
                          <UIText as="div">@{member.username}</UIText>
                        )}
                        {member.role && (
                          <UIText as="div" className="text-gray-600 text-xs mt-1">
                            {member.role}
                          </UIText>
                        )}
                      </div>
                    </Link>
                    <div className="flex items-center gap-2">
                      {memberIsCreator && (
                        <UIText as="span" className="px-2 py-1 text-blue-600 bg-blue-100 rounded uppercase">
                          Creator
                        </UIText>
                      )}
                      {memberIsManager && !memberIsCreator && (
                        <UIText as="span" className="px-2 py-1 text-purple-600 bg-purple-100 rounded uppercase">
                          Manager
                        </UIText>
                      )}
                      {/* Allow editing own role OR managers editing others */}
                      {(member.id === currentUserId || canManage) && (
                        <>
                          {editingRole === member.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={roleInputs[member.id] || member.role || ''}
                                onChange={(e) => setRoleInputs({ ...roleInputs, [member.id]: e.target.value })}
                                placeholder="Role (max 2 words)"
                                maxLength={50}
                                className="px-2 py-1 text-sm border border-gray-300 rounded"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleRoleUpdate(member.id, roleInputs[member.id] || '')
                                  } else if (e.key === 'Escape') {
                                    setEditingRole(null)
                                    setRoleInputs({ ...roleInputs, [member.id]: '' })
                                  }
                                }}
                                autoFocus
                              />
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleRoleUpdate(member.id, roleInputs[member.id] || '')}
                              >
                                <UIText>Save</UIText>
                              </Button>
                              <Button
                                variant="text"
                                size="sm"
                                onClick={() => {
                                  setEditingRole(null)
                                  setRoleInputs({ ...roleInputs, [member.id]: '' })
                                }}
                              >
                                <UIText>Cancel</UIText>
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="text"
                              size="sm"
                              onClick={() => {
                                setEditingRole(member.id)
                                setRoleInputs({ ...roleInputs, [member.id]: member.role || '' })
                              }}
                            >
                              <UIText>{member.role ? 'Edit Role' : 'Set Role'}</UIText>
                            </Button>
                          )}
                        </>
                      )}
                      {canManage && member.id !== currentUserId && !memberIsCreator && !isExternalActivity && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleRemove(member.id)}
                          disabled={removing === member.id}
                        >
                          <UIText>{removing === member.id ? 'Removing...' : 'Remove'}</UIText>
                        </Button>
                      )}
                      {isManager && member.id !== currentUserId && !memberIsCreator && !memberIsManager && (
                        <Button
                          variant="text"
                          size="sm"
                          onClick={() => handleInviteManager(member.id)}
                          disabled={invitingManager === member.id || pendingManagerInviteeIds.has(member.id)}
                        >
                          <UIText>
                          {invitingManager === member.id 
                            ? 'Sending...' 
                            : pendingManagerInviteeIds.has(member.id) 
                            ? 'Invited' 
                            : 'Make Manager'}
                          </UIText>
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </>)}

      {/* Subscribers Tab */}
      {activeTab === 'subscribers' && (
        <div>
          <div className="mb-3">
            <UIText as="h2">
              Subscribers {subscriberDetails.length > 0 && `(${subscriberDetails.length})`}
            </UIText>
          </div>
          {subscriberDetails.length === 0 ? (
            <div><UIText>No subscribers yet</UIText></div>
          ) : (
            <div className="space-y-2">
              {subscriberDetails.map((subscriber) => (
                <div
                  key={subscriber.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                >
                  <Link
                    href={getHumanProfileUrl(subscriber.id)}
                    className="flex items-center gap-3 hover:opacity-80"
                  >
                    <img
                      src={getAvatarUrl(subscriber)}
                      alt={getDisplayName(subscriber)}
                      className="h-10 w-10 rounded-full"
                    />
                    <div>
                      <UIText as="div">
                        {getDisplayName(subscriber)}
                        {subscriber.id === currentUserId && ' (You)'}
                      </UIText>
                      {subscriber.username && (
                        <UIText as="div">@{subscriber.username}</UIText>
                      )}
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Requests & invites: same UI and server actions for all non-human portfolio types */}
      {activeTab === 'requests' && canShowJoinRequestsTab && (
        <div>
          {canManage && renderInviteSearchSection('mb-8 pb-8 border-b border-gray-200')}
          <UIText as="p" className="mb-4">
            Search for people to invite, then review active join requests and invitations below. If both
            applied to the same person, only the join request is listed.
          </UIText>
          {requestError && (
            <Content className="mb-2 text-red-600">{requestError}</Content>
          )}
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <UIText as="h2">
              Active requests &amp; invitations{' '}
              {unifiedActiveRows.length > 0 && `(${unifiedActiveRows.length})`}
            </UIText>
            {(() => {
              const unprocessed = unifiedActiveRows.filter(
                (row) =>
                  row.kind === 'request' &&
                  row.request.status === 'pending' &&
                  !row.request.respondedAt
              ).length
              return unprocessed > 0 ? (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-blue-600 text-white text-xs font-medium">
                  {unprocessed}
                </span>
              ) : null
            })()}
          </div>
          {unifiedActiveRows.length === 0 ? (
            <div>
              <UIText>No active join requests or invitations</UIText>
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {unifiedActiveRows.map((row) => {
                if (row.kind === 'invite') {
                  const inv = row.invite
                  const inviteeName = getDisplayName(inv.invitee)
                  const inviterName = getDisplayName(inv.inviter)
                  const typeLabel =
                    inv.invitation_type === 'manager' ? 'Manager invite' : 'Member invite'
                  const canCancel = inv.inviter.id === currentUserId

                  return (
                    <div
                      key={inv.id}
                      className="flex flex-col gap-2 p-3 bg-gray-50 rounded-md sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative flex-shrink-0">
                          <img
                            src={getAvatarUrl(inv.invitee)}
                            alt={inviteeName}
                            className="h-10 w-10 rounded-full"
                          />
                          <span
                            className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-600 border-2 border-white"
                            title="Awaiting response"
                            aria-hidden
                          />
                        </div>
                        <div>
                          <UIText as="div">{inviteeName}</UIText>
                          {inv.invitee.username && (
                            <UIText as="div">@{inv.invitee.username}</UIText>
                          )}
                          <UIText as="div" className="text-gray-600 text-xs mt-1">
                            Invitation · {typeLabel}
                            {inv.invitation_type === 'member' && inv.role && inv.role !== 'Member'
                              ? ` · Role: ${inv.role}`
                              : ''}{' '}
                            · {new Date(inv.createdAt).toLocaleString()}
                          </UIText>
                          <UIText as="div" className="text-gray-600 text-xs mt-1">
                            Sent by {inviterName}
                            {inv.inviter.id === currentUserId ? ' (you)' : ''}
                          </UIText>
                          {inv.message && (
                            <UIText as="div" className="text-gray-600 text-xs mt-1">
                              Message: {inv.message}
                            </UIText>
                          )}
                        </div>
                      </div>
                      {canCancel && (
                        <Button
                          variant="text"
                          size="sm"
                          onClick={() => handleCancelInvitation(inv.invitee.id)}
                          disabled={cancellingInviteeId === inv.invitee.id}
                        >
                          <UIText>
                            {cancellingInviteeId === inv.invitee.id
                              ? 'Cancelling...'
                              : 'Cancel invitation'}
                          </UIText>
                        </Button>
                      )}
                    </div>
                  )
                }

                const req = row.request
                const { applicant } = req
                const displayName = getDisplayName(applicant)
                const isUnprocessed = req.status === 'pending' && !req.respondedAt
                const statusLabel =
                  req.status === 'pending'
                    ? req.respondedAt
                      ? 'Pending (responded)'
                      : 'Pending'
                    : req.status === 'approved'
                    ? 'Approved'
                    : req.status === 'rejected'
                    ? 'Rejected'
                    : req.status

                const handleApprove = async () => {
                  setProcessingRequestId(req.id)
                  setRequestError(null)
                  try {
                    const result = await approveActivityJoinRequest(req.id)
                    if (!result || !result.success) {
                      setRequestError(result?.error || 'Failed to approve request')
                      return
                    }
                    router.refresh()
                  } catch (error) {
                    console.error('Error approving join request:', error)
                    setRequestError('An unexpected error occurred while approving request')
                  } finally {
                    setProcessingRequestId(null)
                  }
                }

                const handleOpenRespond = () => {
                  setRespondingRequestId(req.id)
                  setRespondMessage('')
                  setRequestError(null)
                }

                const handleSendRespond = async () => {
                  if (!respondingRequestId || respondingRequestId !== req.id) return
                  setProcessingRequestId(req.id)
                  setRequestError(null)
                  try {
                    const result = await respondToActivityJoinRequest(
                      respondingRequestId,
                      respondMessage
                    )
                    if (!result || !result.success) {
                      setRequestError(result?.error || 'Failed to send message')
                      return
                    }
                    setRespondingRequestId(null)
                    setRespondMessage('')
                    router.refresh()
                  } catch (error) {
                    console.error('Error responding to join request:', error)
                    setRequestError('An unexpected error occurred')
                  } finally {
                    setProcessingRequestId(null)
                  }
                }

                return (
                  <div
                    key={req.id}
                    className="flex flex-col gap-2 p-3 bg-gray-50 rounded-md"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <img
                            src={getAvatarUrl(applicant)}
                            alt={displayName}
                            className="h-10 w-10 rounded-full"
                          />
                          {isUnprocessed && (
                            <span
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-600 border-2 border-white"
                              title="Unprocessed application"
                              aria-hidden
                            />
                          )}
                        </div>
                        <div>
                          <UIText as="div">{displayName}</UIText>
                          {applicant.username && (
                            <UIText as="div">@{applicant.username}</UIText>
                          )}
                          <UIText as="div" className="text-gray-600 text-xs mt-1">
                            Join request · {statusLabel} ·{' '}
                            {new Date(req.createdAt).toLocaleString()}
                          </UIText>
                          {req.activityRole && (
                            <UIText as="div" className="text-gray-600 text-xs mt-1">
                              Requested as: {req.activityRole}
                            </UIText>
                          )}
                        </div>
                      </div>
                      {req.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleOpenRespond}
                            disabled={processingRequestId === req.id}
                          >
                            <UIText>Respond</UIText>
                          </Button>
                          <Button
                            variant="success"
                            size="sm"
                            onClick={handleApprove}
                            disabled={processingRequestId === req.id}
                          >
                            <UIText>
                              {processingRequestId === req.id
                                ? 'Processing...'
                                : 'Approve'}
                            </UIText>
                          </Button>
                        </div>
                      )}
                    </div>
                    {respondingRequestId === req.id && (
                      <div className="mt-2 p-2 bg-white rounded border border-gray-200 flex flex-col gap-2">
                        <UIText as="label">Message to applicant</UIText>
                        <textarea
                          value={respondMessage}
                          onChange={(e) => setRespondMessage(e.target.value)}
                          placeholder="Optional: add a message (e.g. asking for more info)"
                          className="w-full min-h-[80px] px-3 py-2 border border-gray-300 rounded-md text-sm"
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleSendRespond}
                            disabled={processingRequestId === req.id}
                          >
                            <UIText>{processingRequestId === req.id ? 'Sending...' : 'Send'}</UIText>
                          </Button>
                          <Button
                            variant="text"
                            size="sm"
                            onClick={() => {
                              setRespondingRequestId(null)
                              setRespondMessage('')
                            }}
                          >
                            <UIText>Cancel</UIText>
                          </Button>
                        </div>
                      </div>
                    )}
                    {req.promptAnswer && (
                      <div className="mt-1">
                        <UIText className="text-gray-700 text-sm">
                          Answer: {req.promptAnswer}
                        </UIText>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Creator Transfer Dialog */}
      {showCreatorTransfer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <Title as="h3" className="mb-4">Transfer Creator</Title>
            <UIText as="p" className="mb-4">
              You are the creator. Please select a new creator before removing yourself as manager.
            </UIText>
            <div className="mb-4">
              <UIText as="label" className="block mb-2">
                Select New Creator
              </UIText>
              <select
                value={newCreatorId}
                onChange={(e) => setNewCreatorId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select a member or manager --</option>
                {[...managers, ...regularMembers]
                  .filter(m => m.id !== currentUserId)
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {getDisplayName(user)} {user.isManager ? '(Manager)' : ''}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCreatorTransfer(false)
                  setNewCreatorId('')
                }}
              >
                <UIText>Cancel</UIText>
              </Button>
              <Button
                variant="danger"
                onClick={handleCreatorTransfer}
                disabled={!newCreatorId || removing === currentUserId}
              >
                <UIText>{removing === currentUserId ? 'Transferring...' : 'Transfer & Remove'}</UIText>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

