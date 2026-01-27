'use client'

import { useState, useEffect } from 'react'
import {
  getUsers,
  getWaitlist,
  approveWaitlist,
  deleteWaitlist,
  blockUser,
  searchUsers,
  deleteUser,
  approveUser,
} from '@/app/admin/actions'
import Link from 'next/link'
import { Button } from '@/components/ui'

function IdCell({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="group relative flex items-center gap-2">
      <span className="text-sm text-gray-600 font-mono truncate max-w-[120px]">{id}</span>
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
        title="Copy ID"
      >
        {copied ? '✓' : '📋'}
      </button>
    </div>
  )
}

interface WaitlistEntry {
  id: string
  email: string
  username: string | null
  status: string
  created_at: string
  approved_at: string | null
  approved_by: string | null
}

interface User {
  id: string
  email: string
  username: string | null
  name: string | null
  created_at: string
  is_blocked: boolean
  human_portfolio_id: string | null
  is_approved?: boolean
}

export function UsersTab() {
  const [users, setUsers] = useState<User[]>([])
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [usersResult, waitlistResult] = await Promise.all([
        searchQuery ? searchUsers(searchQuery) : getUsers(),
        getWaitlist(),
      ])

      if (!usersResult.success) {
        setError(usersResult.error || 'Failed to load users')
      } else {
        setUsers(usersResult.users || [])
      }

      if (!waitlistResult.success) {
        setError(waitlistResult.error || 'Failed to load waitlist')
      } else {
        setWaitlist(waitlistResult.waitlist || [])
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleSearch = async () => {
    await loadData()
  }

  const handleApproveWaitlist = async (waitlistId: string) => {
    setActionLoading(waitlistId)
    try {
      const result = await approveWaitlist(waitlistId)
      if (result.success) {
        await loadData()
      } else {
        setError(result.error || 'Failed to approve waitlist entry')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteWaitlist = async (waitlistId: string) => {
    if (
      !confirm(
        'Delete this waitlist entry? This will allow them to sign up again in the future. The entry will be permanently removed.'
      )
    ) {
      return
    }

    setActionLoading(waitlistId)
    setError(null)
    try {
      const result = await deleteWaitlist(waitlistId)
      if (result.success) {
        await loadData()
      } else {
        console.error('Delete waitlist failed:', result.error)
        setError(result.error || 'Failed to delete waitlist entry')
      }
    } catch (err: any) {
      console.error('Delete waitlist exception:', err)
      setError(err.message || 'An error occurred')
    } finally {
      setActionLoading(null)
    }
  }

  const handleBlockUser = async (userId: string, block: boolean) => {
    setActionLoading(userId)
    try {
      const result = await blockUser(userId, block)
      if (result.success) {
        await loadData()
      } else {
        setError(result.error || `Failed to ${block ? 'block' : 'unblock'} user`)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this user? This will permanently delete:\n' +
        '- All owned projects (and remove them from member portfolios)\n' +
        '- All owned notes\n' +
        '- Remove user from joined communities\n' +
        '- Delete user account\n' +
        '\nThis action cannot be undone!'
      )
    ) {
      return
    }

    setActionLoading(userId)
    setError(null)
    try {
      const result = await deleteUser(userId)
      if (result.success) {
        await loadData()
      } else {
        console.error('Delete user failed:', result.error)
        setError(result.error || 'Failed to delete user')
      }
    } catch (err: any) {
      console.error('Delete user exception:', err)
      setError(err.message || 'An error occurred')
    } finally {
      setActionLoading(null)
    }
  }

  const handleApproveUser = async (userId: string, approve: boolean) => {
    setApprovalLoading(userId)
    setError(null)
    try {
      const result = await approveUser(userId, approve)
      if (result.success) {
        await loadData()
      } else {
        setError(result.error || `Failed to ${approve ? 'approve' : 'unapprove'} user`)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setApprovalLoading(null)
    }
  }

  const pendingWaitlist = waitlist.filter((w) => w.status === 'pending')

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="flex gap-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search by name, email, or ID..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSearch}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Search
        </button>
        <button
          onClick={() => {
            setSearchQuery('')
            loadData()
          }}
          className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
        >
          Clear
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Waitlist Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Waitlist ({pendingWaitlist.length} pending)</h2>
        {loading ? (
          <div className="text-gray-500">Loading waitlist...</div>
        ) : pendingWaitlist.length === 0 ? (
          <div className="text-gray-500">No pending waitlist entries</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Username
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pendingWaitlist.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <IdCell id={entry.id} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {entry.username || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <button
                        onClick={() => handleApproveWaitlist(entry.id)}
                        disabled={actionLoading === entry.id}
                        className="text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        {actionLoading === entry.id ? 'Approving...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleDeleteWaitlist(entry.id)}
                        disabled={actionLoading === entry.id}
                        className="text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {actionLoading === entry.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Users Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Users ({users.length})</h2>
        {loading ? (
          <div className="text-gray-500">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="text-gray-500">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Username
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Verification
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <IdCell id={user.id} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.username || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          user.is_blocked
                            ? 'bg-red-100 text-red-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {user.is_blocked ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          user.is_approved
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {user.is_approved ? 'Verified (non-pseudo)' : 'Pseudo / Unverified'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      {user.human_portfolio_id && (
                        <Link
                          href={`/account/${user.id}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          View
                        </Link>
                      )}
                      <button
                        onClick={() => handleBlockUser(user.id, !user.is_blocked)}
                        disabled={actionLoading === user.id}
                        className={`${
                          user.is_blocked ? 'text-green-600 hover:text-green-800' : 'text-red-600 hover:text-red-800'
                        } disabled:opacity-50`}
                      >
                        {actionLoading === user.id
                          ? '...'
                          : user.is_blocked
                          ? 'Unblock'
                          : 'Block'}
                      </button>
                      <button
                        onClick={() => handleApproveUser(user.id, !user.is_approved)}
                        disabled={approvalLoading === user.id}
                        className="text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        {approvalLoading === user.id
                          ? '...'
                          : user.is_approved
                          ? 'Unapprove'
                          : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        disabled={actionLoading === user.id}
                        className="text-red-600 hover:text-red-800 disabled:opacity-50"
                        title="Delete user permanently"
                      >
                        {actionLoading === user.id ? '...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

