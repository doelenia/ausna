'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Title, Content, UIText, Button } from '@/components/ui'

interface UserInfo {
  id: string
  username: string | null
  name: string | null
  avatar: string | null
  isManager?: boolean
  isCreator?: boolean
}

interface MembersPageClientProps {
  portfolioId: string
  portfolioName: string
  portfolioType: string
  creatorInfo: UserInfo | null
  memberDetails: UserInfo[]
  canManage: boolean
  currentUserId?: string
}

export function MembersPageClient({
  portfolioId,
  portfolioName,
  portfolioType,
  creatorInfo,
  memberDetails,
  canManage,
  currentUserId,
}: MembersPageClientProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserInfo[]>([])
  const [searching, setSearching] = useState(false)
  const [inviting, setInviting] = useState<string | null>(null)
  const [invitingManager, setInvitingManager] = useState<string | null>(null)
  const [invitedManagers, setInvitedManagers] = useState<Set<string>>(new Set())
  const [removing, setRemoving] = useState<string | null>(null)
  const [members, setMembers] = useState(memberDetails)
  const [showCreatorTransfer, setShowCreatorTransfer] = useState(false)
  const [newCreatorId, setNewCreatorId] = useState<string>('')
  const router = useRouter()
  
  // Filter members to separate creators, managers, and regular members
  const creator = creatorInfo
  const creatorInMembers = creator ? members.find(m => m.id === creator.id) : null
  const managers = members.filter((m) => m.isManager && !m.isCreator)
  const regularMembers = members.filter((m) => !m.isManager && !m.isCreator)
  
  // Combine all members into a single sorted list: creator first, then managers, then regular members
  const allMembers: (UserInfo & { isCreator?: boolean })[] = []
  
  // Add creator first (if they exist and aren't already in members, or if they are, use the member version with isCreator flag)
  if (creator) {
    if (creatorInMembers) {
      // Creator is already in members array, use that entry and ensure isCreator is set
      allMembers.push({ ...creatorInMembers, isCreator: true })
    } else {
      // Creator is not in members array, add them separately
      allMembers.push({ ...creator, isCreator: true })
    }
  }
  
  // Add managers (excluding creator if they were already added above)
  const creatorId = creator?.id
  managers.forEach(manager => {
    if (manager.id !== creatorId) {
      allMembers.push(manager)
    }
  })
  
  // Add regular members
  allMembers.push(...regularMembers)
  
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
        // Filter out users who are already members
        const existingMemberIds = new Set(members.map((m) => m.id))
        if (creator) {
          existingMemberIds.add(creator.id)
        }
        const filtered = (data.users || []).filter(
          (u: UserInfo) => !existingMemberIds.has(u.id)
        )
        setSearchResults(filtered)
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

  // Load pending manager invitations on mount
  useEffect(() => {
    const loadPendingInvitations = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: invitations } = await supabase
          .from('portfolio_invitations')
          .select('invitee_id')
          .eq('portfolio_id', portfolioId)
          .eq('status', 'pending')
          .eq('invitation_type', 'manager')

        if (invitations) {
          const invitedIds = new Set(invitations.map((inv: any) => inv.invitee_id))
          setInvitedManagers(invitedIds)
        }
      } catch (error) {
        console.error('Error loading pending invitations:', error)
      }
    }

    loadPendingInvitations()
  }, [portfolioId])

  const handleInvite = async (userId: string) => {
    setInviting(userId)
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/members/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      })

      if (response.ok) {
        alert('Invitation sent successfully!')
        setSearchQuery('')
        setSearchResults([])
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
        // Mark this user as invited
        setInvitedManagers(prev => new Set(prev).add(userId))
        alert('Manager invitation sent successfully!')
        setSearchQuery('')
        setSearchResults([])
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

  return (
    <div>
      {/* Invite Section - Only for managers */}
      {canManage && (
        <div className="mb-8 pb-6 border-b border-gray-200">
          <UIText as="h2" className="mb-4">Invite Members</UIText>
          {isManager && (
            <UIText as="p" className="mb-4">
              As a manager, you can also promote existing members to managers using the "Make Manager" button next to each member.
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
              <div className="absolute right-3 top-2.5"><UIText>Searching...</UIText></div>
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-4 space-y-2">
              <UIText as="h3">Search Results</UIText>
              {searchResults.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={getAvatarUrl(user)}
                      alt={getDisplayName(user)}
                      className="h-10 w-10 rounded-full"
                    />
                    <div>
                      <UIText as="div">{getDisplayName(user)}</UIText>
                      {user.username && (
                        <UIText as="div">@{user.username}</UIText>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => handleInvite(user.id)}
                    disabled={inviting === user.id}
                  >
                    <UIText>{inviting === user.id ? 'Sending...' : 'Invite'}</UIText>
                  </Button>
                </div>
              ))}
            </div>
          )}

          {searchQuery && !searching && searchResults.length === 0 && (
            <div className="mt-4"><UIText>No users found</UIText></div>
          )}
        </div>
      )}

      {/* Members Section - Combined List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <UIText as="h2">
            Members {allMembers.length > 0 && `(${allMembers.length})`}
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
          <div><UIText>No members yet</UIText></div>
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
                    href={`/portfolio/human/${member.id}`}
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
                    {canManage && member.id !== currentUserId && !memberIsCreator && (
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
                        disabled={invitingManager === member.id || invitedManagers.has(member.id)}
                      >
                        <UIText>
                        {invitingManager === member.id 
                          ? 'Sending...' 
                          : invitedManagers.has(member.id) 
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

