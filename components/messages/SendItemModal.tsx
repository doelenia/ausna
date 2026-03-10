'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, UIText, UserAvatar } from '@/components/ui'
import { Copy, Search, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Portfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { buildLoginHref } from '@/lib/auth/login-redirect'

type Person = {
  id: string
  name: string
  avatar?: string | null
  username?: string | null
}

type SendItemModalProps = {
  isOpen: boolean
  onClose: () => void
  currentUserId?: string | null
  /** Used when query is empty (optional) */
  authors?: Person[]
  /** A descriptive label like "note" or "portfolio" for UI strings */
  itemLabel: string
  /** The link to copy (absolute preferred, but relative is OK) */
  copyLink: string
  /** When sending, either provide noteId (to send as attachment) or text (to send as message) */
  sendPayload: { noteId?: string; text?: string; messageType?: string }
}

type ViewState = 'picker' | 'confirm' | 'sent'

export function SendItemModal({
  isOpen,
  onClose,
  currentUserId,
  authors,
  itemLabel,
  copyLink,
  sendPayload,
}: SendItemModalProps) {
  const router = useRouter()
  const isBrowser = typeof window !== 'undefined'
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [view, setView] = useState<ViewState>('picker')
  const [selected, setSelected] = useState<Person | null>(null)
  const [copied, setCopied] = useState(false)
  const copiedTimeoutRef = useRef<number | null>(null)

  const [recentPeople, setRecentPeople] = useState<Person[]>([])
  const [recentLoading, setRecentLoading] = useState(false)

  const [results, setResults] = useState<Person[]>([])
  const [resultsLoading, setResultsLoading] = useState(false)

  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const filteredAuthors = useMemo(() => {
    const list = Array.isArray(authors) ? authors : []
    return list.filter((p) => p && p.id && (!currentUserId || p.id !== currentUserId))
  }, [authors, currentUserId])

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setView('picker')
    setSelected(null)
    setCopied(false)
    setSendError(null)
    setResults([])
  }, [isOpen])

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
        const convos = [
          ...(activeData?.conversations || []),
          ...(inviteData?.conversations || []),
        ]
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
          const p = row as Pick<Portfolio, 'user_id' | 'slug' | 'metadata'>
          const userId = String(p.user_id || '')
          if (!userId) return
          const basic = getPortfolioBasic(p as any)
          byUserId.set(userId, {
            id: userId,
            name: basic?.name || (p.slug as string | null) || `User ${userId.slice(0, 8)}`,
            avatar: basic?.avatar ?? null,
            username: (p.slug as string | null) ?? null,
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
    if (!currentUserId) return
    const q = query.trim()
    if (!q) {
      setResults([])
      setResultsLoading(false)
      return
    }

    const controller = new AbortController()
    const run = async () => {
      try {
        setResultsLoading(true)
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
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
        setResults(mapped)
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        setResults([])
      } finally {
        setResultsLoading(false)
      }
    }

    const t = window.setTimeout(run, 200)
    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
  }, [isOpen, query, currentUserId])

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current && isBrowser) {
        window.clearTimeout(copiedTimeoutRef.current)
        copiedTimeoutRef.current = null
      }
    }
  }, [isBrowser])

  if (!isOpen) return null

  const startConfirm = (p: Person) => {
    setSelected(p)
    setSendError(null)
    setView('confirm')
  }

  const handleCopy = async () => {
    if (!isBrowser) return
    try {
      await navigator.clipboard.writeText(copyLink)
      setCopied(true)
      if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current)
      copiedTimeoutRef.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: select + copy not worth implementing here; show error text.
      setCopied(false)
      setSendError('Could not copy link in this browser.')
    }
  }

  const handleSend = async () => {
    if (!selected || sending) return
    if (!currentUserId) {
      const returnTo = isBrowser
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : '/main'
      router.push(buildLoginHref({ returnTo }))
      return
    }

    setSending(true)
    setSendError(null)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiver_id: selected.id,
          text: sendPayload.text ?? '',
          note_id: sendPayload.noteId ?? null,
          message_type: sendPayload.messageType ?? null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to send')
      }
      setView('sent')
    } catch (e: any) {
      setSendError(e?.message || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const goToConversation = () => {
    if (!selected) return
    router.push(`/messages/${selected.id}`)
  }

  const closeAndStay = () => {
    onClose()
  }

  const listItem = (p: Person) => (
    <button
      key={p.id}
      type="button"
      onClick={() => startConfirm(p)}
      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 text-left"
    >
      <UserAvatar userId={p.id} name={p.name} avatar={p.avatar} size={32} showLink={false} />
      <div className="min-w-0 flex-1">
        <UIText as="span" className="block truncate">{p.name}</UIText>
        {p.username && (
          <UIText as="span" className="block text-xs text-gray-500 truncate">
            @{p.username}
          </UIText>
        )}
      </div>
    </button>
  )

  const showAuthorsSection = query.trim().length === 0 && filteredAuthors.length > 0
  const showRecentSection = query.trim().length === 0

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black bg-opacity-40"
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div className="w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <Card variant="default" padding="sm" className="rounded-xl shadow-lg">
          {view === 'picker' && (
            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-3 mb-3">
                <UIText>Send {itemLabel}</UIText>
                <Button variant="text" size="sm" onClick={onClose}>
                  <UIText>Close</UIText>
                </Button>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                  aria-label="Copy link"
                  title="Copy link"
                >
                  <Copy className="w-5 h-5 text-gray-700" strokeWidth={1.5} />
                </button>
                <div className="flex-1 min-w-0">
                  <UIText as="p" className="text-gray-700">
                    {copied ? 'Link copied' : 'Copy link'}
                  </UIText>
                </div>
              </div>

              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" strokeWidth={1.5} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people to send..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {sendError && (
                <UIText as="p" className="text-sm text-red-600 mb-2">
                  {sendError}
                </UIText>
              )}

              <div className="overflow-y-auto" style={{ maxHeight: '52vh' }}>
                {query.trim() ? (
                  resultsLoading ? (
                    <UIText className="text-gray-500">Searching...</UIText>
                  ) : results.length === 0 ? (
                    <UIText className="text-gray-500">No people found.</UIText>
                  ) : (
                    <div className="space-y-1">
                      {results.map(listItem)}
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    {showAuthorsSection && (
                      <div>
                        <UIText as="p" className="text-xs text-gray-500 mb-2">Authors</UIText>
                        <div className="space-y-1">
                          {filteredAuthors.map(listItem)}
                        </div>
                      </div>
                    )}

                    {showRecentSection && (
                      <div>
                        <UIText as="p" className="text-xs text-gray-500 mb-2">Recent conversations</UIText>
                        {recentLoading ? (
                          <UIText className="text-gray-500">Loading...</UIText>
                        ) : recentPeople.length === 0 ? (
                          <UIText className="text-gray-500">No recent conversations.</UIText>
                        ) : (
                          <div className="space-y-1">
                            {recentPeople.map(listItem)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {view === 'confirm' && selected && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <UserAvatar userId={selected.id} name={selected.name} avatar={selected.avatar} size={40} showLink={false} />
                <div className="min-w-0 flex-1">
                  <UIText as="p" className="truncate">{selected.name}</UIText>
                  <UIText as="p" className="text-xs text-gray-500">
                    This will send the {itemLabel} through message.
                  </UIText>
                </div>
              </div>

              {sendError && (
                <UIText as="p" className="text-sm text-red-600">
                  {sendError}
                </UIText>
              )}

              <div className="flex gap-2 justify-end">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setView('picker')
                    setSendError(null)
                  }}
                  disabled={sending}
                >
                  <UIText>Back</UIText>
                </Button>
                <Button variant="primary" onClick={handleSend} disabled={sending}>
                  <Send className="w-4 h-4 mr-2" strokeWidth={1.5} />
                  <UIText>{sending ? 'Sending...' : 'Send'}</UIText>
                </Button>
              </div>
            </div>
          )}

          {view === 'sent' && selected && (
            <div className="flex flex-col gap-4">
              <UIText>Message sent</UIText>
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={closeAndStay}>
                  <UIText>Stay here</UIText>
                </Button>
                <Button variant="primary" onClick={goToConversation}>
                  <UIText>Go to conversation</UIText>
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

