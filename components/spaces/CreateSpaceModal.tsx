'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortfolio } from '@/app/portfolio/create/actions'
import { createClient } from '@/lib/supabase/client'
import { getSpaceUrl } from '@/lib/portfolio/routes'
import { Button, Card, Content, Title, UIText } from '@/components/ui'
import { X } from 'lucide-react'

const DEFAULT_SPACE_EMOJIS = [
  '🚀',
  '✨',
  '🌟',
  '💡',
  '🎯',
  '📌',
  '🏠',
  '🌈',
  '🎉',
  '🧩',
  '📣',
  '🤝',
  '🌱',
  '🔭',
  '🎨',
  '🛠',
] as const

function pickRandomEmoji(): string {
  const i = Math.floor(Math.random() * DEFAULT_SPACE_EMOJIS.length)
  return DEFAULT_SPACE_EMOJIS[i] || '✨'
}

export type CreateSpaceModalProps = {
  isOpen: boolean
  onClose: () => void
  /** When creating from an existing space, it becomes the host. */
  hostSpaceId?: string | null
}

type Person = {
  id: string
  name: string
  avatar?: string | null
  username?: string | null
  isPseudo?: boolean
}

type InviteKind = 'follow' | 'join'

type Invitee =
  | { isNew: false; person: Person; kind: InviteKind }
  | { isNew: true; name: string; email: string; kind: InviteKind }

function isNewInvitee(i: Invitee): i is { isNew: true; name: string; email: string; kind: InviteKind } {
  return i.isNew === true
}

function isExistingInvitee(i: Invitee): i is { isNew: false; person: Person; kind: InviteKind } {
  return i.isNew === false
}

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

export function CreateSpaceModal({ isOpen, onClose, hostSpaceId }: CreateSpaceModalProps) {
  const [topic, setTopic] = useState('')
  const [why, setWhy] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [inviteQuery, setInviteQuery] = useState('')
  const [recentPeople, setRecentPeople] = useState<Person[]>([])
  const [hostPeople, setHostPeople] = useState<Person[]>([])
  const [searchResults, setSearchResults] = useState<Person[]>([])
  const [newInviteeSuggestion, setNewInviteeSuggestion] = useState<{ email: string; name: string } | null>(null)
  const [recentLoading, setRecentLoading] = useState(false)
  const [hostLoading, setHostLoading] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [invitees, setInvitees] = useState<Invitee[]>([])

  // Tracks in-flight edits for new-user rows in the invitee list
  const [newInviteeEdits, setNewInviteeEdits] = useState<Record<string, { name: string; email: string }>>({})

  const supabase = useMemo(() => createClient(), [])
  const abortRef = useRef<AbortController | null>(null)

  const randomEmoji = useMemo(() => pickRandomEmoji(), [])

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setLoading(false)
    setInviteQuery('')
    setSearchResults([])
    setNewInviteeSuggestion(null)
    abortRef.current?.abort()
    abortRef.current = null
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const run = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!cancelled) setCurrentUserId(user?.id ?? null)
      } catch {
        if (!cancelled) setCurrentUserId(null)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [isOpen, supabase])

  useEffect(() => {
    if (!isOpen) return
    if (!currentUserId) return
    let cancelled = false
    const loadRecent = async () => {
      try {
        setRecentLoading(true)
        const [activeRes, inviteRes] = await Promise.all([
          fetch('/api/messages?tab=active'),
          fetch('/api/messages?tab=invitations'),
        ])
        const activeData = activeRes.ok ? await activeRes.json() : { conversations: [] }
        const inviteData = inviteRes.ok ? await inviteRes.json() : { conversations: [] }
        const convos = [...(activeData?.conversations || []), ...(inviteData?.conversations || [])]
        const partnerIds: string[] = []
        const seen = new Set<string>()
        for (const c of convos) {
          const id = String(c?.partner_id || '')
          if (!id || id === currentUserId) continue
          if (seen.has(id)) continue
          seen.add(id)
          partnerIds.push(id)
          if (partnerIds.length >= 12) break
        }

        if (partnerIds.length === 0) {
          if (!cancelled) setRecentPeople([])
          return
        }

        const { data: portfolios } = await supabase
          .from('portfolios')
          .select('user_id, slug, metadata')
          .eq('type', 'human')
          .in('user_id', partnerIds)

        const byUserId = new Map<string, Person>()
        ;(portfolios || []).forEach((row: any) => {
          const userId = String(row?.user_id || '')
          if (!userId) return
          const meta = (row?.metadata as any) || {}
          const basic = (meta?.basic as any) || {}
          byUserId.set(userId, {
            id: userId,
            name:
              (typeof basic?.name === 'string' && basic.name.trim().length > 0
                ? basic.name.trim()
                : null) ||
              (row?.slug as string | null) ||
              `User ${userId.slice(0, 8)}`,
            avatar: typeof basic?.avatar === 'string' ? basic.avatar : null,
            username: (row?.slug as string | null) ?? null,
          })
        })

        const people: Person[] = partnerIds.map((id) => {
          return (
            byUserId.get(id) || {
              id,
              name: `User ${id.slice(0, 8)}`,
              avatar: null,
              username: null,
            }
          )
        })
        if (!cancelled) setRecentPeople(people)
      } catch {
        if (!cancelled) setRecentPeople([])
      } finally {
        if (!cancelled) setRecentLoading(false)
      }
    }
    loadRecent()
    return () => {
      cancelled = true
    }
  }, [isOpen, currentUserId, supabase])

  useEffect(() => {
    if (!isOpen) return
    if (!hostSpaceId || !currentUserId) {
      setHostPeople([])
      setHostLoading(false)
      return
    }

    let cancelled = false
    const run = async () => {
      setHostLoading(true)
      try {
        const res = await fetch(
          `/api/notes/collaborator-candidates?portfolio_id=${encodeURIComponent(hostSpaceId)}`
        )
        const data = res.ok ? await res.json() : { users: [] }
        const users = Array.isArray(data?.users) ? data.users : []
        const mapped: Person[] = users
          .map((u: any) => ({
            id: String(u.id || ''),
            name: String(u.name || u.username || '').trim() || `User ${String(u.id || '').slice(0, 8)}`,
            avatar: u.avatar ?? null,
            username: u.username ?? null,
          }))
          .filter((p: Person) => p.id && p.id !== currentUserId)
        if (!cancelled) setHostPeople(mapped)
      } catch {
        if (!cancelled) setHostPeople([])
      } finally {
        if (!cancelled) setHostLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [isOpen, hostSpaceId, currentUserId])

  useEffect(() => {
    if (!isOpen) return
    if (!currentUserId) return
    const q = inviteQuery.trim()
    abortRef.current?.abort()
    abortRef.current = null
    if (!q) {
      setSearchResults([])
      setNewInviteeSuggestion(null)
      setSearchLoading(false)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    const run = async () => {
      try {
        setSearchLoading(true)
        const [hostRes, globalRes] = await Promise.all([
          hostSpaceId
            ? fetch(
                `/api/notes/collaborator-candidates?portfolio_id=${encodeURIComponent(hostSpaceId)}&q=${encodeURIComponent(q)}`,
                { signal: controller.signal }
              )
            : Promise.resolve(null),
          fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { signal: controller.signal }),
        ])

        const hostData = hostRes && hostRes.ok ? await hostRes.json() : { users: [] }
        const globalData = globalRes.ok ? await globalRes.json() : { users: [] }
        const hostUsers = Array.isArray(hostData?.users) ? hostData.users : []
        const globalUsers = Array.isArray(globalData?.users) ? globalData.users : []

        const merged: Person[] = [...hostUsers, ...globalUsers]
          .map((u: any) => ({
            id: String(u.id || ''),
            name: String(u.name || u.username || '').trim() || `User ${String(u.id || '').slice(0, 8)}`,
            avatar: u.avatar ?? null,
            username: u.username ?? null,
            isPseudo: u.isPseudo ?? false,
          }))
          .filter((p: Person) => p.id && p.id !== currentUserId)

        const byId = new Map<string, Person>()
        merged.forEach((p) => byId.set(p.id, p))

        setSearchResults(Array.from(byId.values()).slice(0, 24))

        // Surface new invitee suggestion from search API
        const suggestion = globalData?.newInviteeSuggestion ?? null
        if (suggestion && looksLikeEmail(q)) {
          setNewInviteeSuggestion({ email: q.trim().toLowerCase(), name: '' })
        } else {
          setNewInviteeSuggestion(null)
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        setSearchResults([])
        setNewInviteeSuggestion(null)
      } finally {
        setSearchLoading(false)
      }
    }

    const t = window.setTimeout(run, 200)
    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
  }, [isOpen, inviteQuery, currentUserId, hostSpaceId])

  if (!isOpen) return null

  const canCreate = topic.trim().length > 0

  const isInvited = (personId: string) =>
    invitees.some((i) => (isExistingInvitee(i) ? i.person.id === personId : false))

  const isEmailInvited = (email: string) =>
    invitees.some((i) => isNewInvitee(i) && i.email === email)

  const addInvitee = (person: Person) => {
    if (!person.id) return
    if (isInvited(person.id)) return
    setInvitees((prev) => [...prev, { isNew: false, person, kind: 'join' }])
  }

  const addNewEmailInvitee = (email: string) => {
    if (!email || isEmailInvited(email)) return
    setInvitees((prev) => [
      ...prev,
      { isNew: true, name: '', email: email.trim().toLowerCase(), kind: 'join' },
    ])
    setInviteQuery('')
    setNewInviteeSuggestion(null)
  }

  const removeInvitee = (index: number) => {
    setInvitees((prev) => prev.filter((_, i) => i !== index))
  }

  const setInviteKind = (index: number, kind: InviteKind) => {
    setInvitees((prev) => prev.map((inv, i) => (i === index ? { ...inv, kind } : inv)))
  }

  const updateNewInviteeName = (index: number, name: string) => {
    setInvitees((prev) =>
      prev.map((inv, i) => (i === index && isNewInvitee(inv) ? { ...inv, name } : inv))
    )
  }

  const updateNewInviteeEmail = (index: number, email: string) => {
    setInvitees((prev) =>
      prev.map((inv, i) => (i === index && isNewInvitee(inv) ? { ...inv, email } : inv))
    )
  }

  const handleCreate = async () => {
    if (!canCreate || loading) return
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('type', 'space')
      formData.append('name', topic.trim())
      if (why.trim().length > 0) {
        formData.append('description', why.trim())
      }

      formData.append('emoji', randomEmoji)
      formData.append('visibility', 'unlisted')
      formData.append('activity_call_to_join_enabled', 'true')
      formData.append('activity_call_to_join_require_approval', 'false')

      if (hostSpaceId && hostSpaceId.trim().length > 0) {
        formData.append('host_project_ids', JSON.stringify([hostSpaceId.trim()]))
      }

      const result = await createPortfolio(formData)
      if (!result.success || !result.portfolioId) {
        setError(result.error || 'Failed to create space')
        setLoading(false)
        return
      }

      if (invitees.length > 0) {
        try {
          await fetch(`/api/portfolios/${encodeURIComponent(result.portfolioId)}/invitations/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              invites: invitees.map((i) => {
                if (isNewInvitee(i)) {
                  return { email: i.email, name: i.name, kind: i.kind }
                }
                return { inviteeId: i.person.id, kind: i.kind }
              }),
              description: why.trim().length > 0 ? why.trim() : null,
            }),
          })
        } catch {
          // Non-blocking
        }
      }

      window.location.href = getSpaceUrl(result.portfolioId)
    } catch (e: any) {
      setError(e?.message || 'Failed to create space')
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-space-modal-title"
      >
        <Card variant="default" padding="md">
          <div className="mb-4">
            <Title as="h2" id="create-space-modal-title">
              Create space
            </Title>
          </div>

          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <UIText className="text-red-700">{error}</UIText>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <UIText as="label" className="block mb-2" htmlFor="create-space-topic">
                Topic <span className="text-red-500">*</span>
              </UIText>
              <input
                id="create-space-topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={100}
                placeholder="What is this space about?"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                disabled={loading}
              />
            </div>

            <div>
              <UIText as="label" className="block mb-2" htmlFor="create-space-why">
                Why this topic <span className="text-gray-500">(optional)</span>
              </UIText>
              <textarea
                id="create-space-why"
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                rows={4}
                maxLength={3000}
                placeholder="A few sentences to help people understand the intent."
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                disabled={loading}
              />
            </div>

            <Card variant="subtle" padding="sm">
              <UIText as="div">Invite people</UIText>

              <div className="mt-3">
                <input
                  type="text"
                  value={inviteQuery}
                  onChange={(e) => setInviteQuery(e.target.value)}
                  placeholder="Search people or enter email…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                  disabled={loading}
                />
              </div>

              {/* ---- Current invitees list ---- */}
              {invitees.length > 0 && (
                <div className="mt-3 space-y-2">
                  {invitees.map((inv, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 sm:flex-row sm:items-start sm:justify-between"
                    >
                      {isExistingInvitee(inv) ? (
                        /* Existing user row */
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={
                              inv.person.avatar ||
                              `https://ui-avatars.com/api/?name=${encodeURIComponent(inv.person.name)}&background=random`
                            }
                            alt={inv.person.name}
                            className="h-9 w-9 rounded-full object-cover"
                          />
                          <div className="min-w-0">
                            <UIText as="div" className="truncate">
                              {inv.person.name}
                            </UIText>
                            {inv.person.username && (
                              <UIText as="div" className="text-gray-600 truncate">
                                @{inv.person.username}
                              </UIText>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* New user row — editable name + email */
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <div className="flex items-center gap-1 flex-wrap">
                            <input
                              type="text"
                              value={inv.name}
                              onChange={(e) => updateNewInviteeName(idx, e.target.value)}
                              placeholder="Name"
                              maxLength={100}
                              disabled={loading}
                              className="px-2 py-1 text-sm border border-gray-300 rounded w-36 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <input
                              type="email"
                              value={inv.email}
                              onChange={(e) => updateNewInviteeEmail(idx, e.target.value)}
                              placeholder="Email"
                              maxLength={200}
                              disabled={loading}
                              className="px-2 py-1 text-sm border border-gray-300 rounded w-48 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          {inv.name.trim() && looksLikeEmail(inv.email) && (
                            <UIText as="div" className="text-xs text-amber-600">
                              New user — will be invited to join Ausna
                            </UIText>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                        <UIText as="label" className="text-gray-600" htmlFor={`invite-kind-${idx}`}>
                          Invite to
                        </UIText>
                        <select
                          id={`invite-kind-${idx}`}
                          value={inv.kind}
                          onChange={(e) => setInviteKind(idx, e.target.value as InviteKind)}
                          disabled={loading}
                          className="px-2 py-1 text-sm border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="join">Join</option>
                          <option value="follow">Follow</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removeInvitee(idx)}
                          disabled={loading}
                          className="p-1 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 disabled:opacity-60"
                          aria-label="Remove"
                        >
                          <X className="w-4 h-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ---- Search results / suggestions ---- */}
              <div className="mt-3 space-y-3">
                {inviteQuery.trim().length > 0 ? (
                  <>
                    {searchLoading ? (
                      <UIText className="text-gray-500">Searching…</UIText>
                    ) : (
                      <>
                        {searchResults.length > 0 && (
                          <div className="space-y-2">
                            {searchResults.map((p) => {
                              const disabled = loading || isInvited(p.id)
                              return (
                                <div
                                  key={p.id}
                                  className="w-full flex flex-col gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <img
                                      src={
                                        p.avatar ||
                                        `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random`
                                      }
                                      alt={p.name}
                                      className="h-9 w-9 rounded-full object-cover"
                                    />
                                    <div className="min-w-0 text-left">
                                      <UIText as="div" className="truncate">
                                        {p.name}
                                      </UIText>
                                      {p.username && (
                                        <UIText as="div" className="text-gray-600 truncate">
                                          @{p.username}
                                        </UIText>
                                      )}
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => addInvitee(p)}
                                    disabled={disabled}
                                  >
                                    <UIText>{isInvited(p.id) ? 'Added' : 'Add'}</UIText>
                                  </Button>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* New user suggestion row */}
                        {newInviteeSuggestion && !isEmailInvited(newInviteeSuggestion.email) && (
                          <div className="w-full flex flex-col gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <UIText as="div" className="truncate text-amber-800">
                                Invite {newInviteeSuggestion.email}
                              </UIText>
                              <UIText as="div" className="text-xs text-amber-600">
                                Not on Ausna yet — will receive an invitation email
                              </UIText>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => addNewEmailInvitee(newInviteeSuggestion.email)}
                              disabled={loading}
                            >
                              <UIText>Add</UIText>
                            </Button>
                          </div>
                        )}

                        {searchResults.length === 0 && !newInviteeSuggestion && (
                          <UIText className="text-gray-500">No results</UIText>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <UIText as="div">Recent</UIText>
                      {recentLoading ? (
                        <UIText className="text-gray-500 mt-1">Loading…</UIText>
                      ) : recentPeople.length === 0 ? (
                        <UIText className="text-gray-500 mt-1">No recent contacts</UIText>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {recentPeople.slice(0, 12).map((p) => {
                            const disabled = loading || isInvited(p.id)
                            return (
                              <div
                                key={`recent:${p.id}`}
                                className="w-full flex flex-col gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <img
                                    src={
                                      p.avatar ||
                                      `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random`
                                    }
                                    alt={p.name}
                                    className="h-9 w-9 rounded-full object-cover"
                                  />
                                  <div className="min-w-0 text-left">
                                    <UIText as="div" className="truncate">
                                      {p.name}
                                    </UIText>
                                    {p.username && (
                                      <UIText as="div" className="text-gray-600 truncate">
                                        @{p.username}
                                      </UIText>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => addInvitee(p)}
                                  disabled={disabled}
                                >
                                  <UIText>{isInvited(p.id) ? 'Added' : 'Add'}</UIText>
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {hostSpaceId && (
                      <div>
                        <UIText as="div">Host space members</UIText>
                        {hostLoading ? (
                          <UIText className="text-gray-500 mt-1">Loading…</UIText>
                        ) : hostPeople.length === 0 ? (
                          <UIText className="text-gray-500 mt-1">No members found</UIText>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {hostPeople.slice(0, 12).map((p) => {
                              const disabled = loading || isInvited(p.id)
                              return (
                                <div
                                  key={`host:${p.id}`}
                                  className="w-full flex flex-col gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <img
                                      src={
                                        p.avatar ||
                                        `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random`
                                      }
                                      alt={p.name}
                                      className="h-9 w-9 rounded-full object-cover"
                                    />
                                    <div className="min-w-0 text-left">
                                      <UIText as="div" className="truncate">
                                        {p.name}
                                      </UIText>
                                      {p.username && (
                                        <UIText as="div" className="text-gray-600 truncate">
                                          @{p.username}
                                        </UIText>
                                      )}
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => addInvitee(p)}
                                    disabled={disabled}
                                  >
                                    <UIText>{isInvited(p.id) ? 'Added' : 'Add'}</UIText>
                                  </Button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              <UIText>Cancel</UIText>
            </Button>
            <Button variant="primary" onClick={() => void handleCreate()} disabled={!canCreate || loading}>
              <UIText>{loading ? 'Creating…' : 'Create'}</UIText>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
