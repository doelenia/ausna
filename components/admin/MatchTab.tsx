'use client'

import { useState, useEffect } from 'react'
import { getUsers, getAdminDemoPreference, setAdminDemoPreference } from '@/app/admin/actions'
import Link from 'next/link'
import { UIText, Subtitle } from '@/components/ui'

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

export function MatchTab() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [demoEnabled, setDemoEnabled] = useState(false)
  const [isTogglingDemo, setIsTogglingDemo] = useState(false)

  useEffect(() => {
    let cancelled = false
    getAdminDemoPreference().then((res) => {
      if (!cancelled && res.success && res.enabled !== undefined) {
        setDemoEnabled(res.enabled)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleDemoToggle = async () => {
    setIsTogglingDemo(true)
    const next = !demoEnabled
    const res = await setAdminDemoPreference(next)
    if (res.success) {
      setDemoEnabled(next)
    }
    setIsTogglingDemo(false)
  }

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await getUsers()
        if (!result.success) {
          setError(result.error || 'Failed to load users')
        } else {
          setUsers(result.users || [])
        }
      } catch (err: any) {
        setError(err.message || 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    loadUsers()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Subtitle as="h2" className="mb-0">
          Users ({users.length})
        </Subtitle>
        <div className="flex items-center gap-3">
          <UIText>Demo mode (anonymize in match console)</UIText>
          <button
            type="button"
            role="switch"
            aria-checked={demoEnabled}
            onClick={handleDemoToggle}
            disabled={isTogglingDemo}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              demoEnabled ? 'bg-blue-600' : 'bg-gray-200'
            } ${isTogglingDemo ? 'opacity-60' : ''}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                demoEnabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>
      <div>
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm mb-4">
            {error}
          </div>
        )}
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
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
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
                      <Link
                        href={`/admin/match/${user.id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        View Match Console →
                      </Link>
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

