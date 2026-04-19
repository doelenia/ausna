'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { createNote } from '@/app/notes/actions'
import { Portfolio, DB_NON_HUMAN_TYPES, isSpacePortfolio } from '@/types/portfolio'
import type { NoteVisibility } from '@/types/note'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { getPortfolioUrl, getHumanProfileUrl } from '@/lib/portfolio/routes'
import { UIText, Button, Content, UIButtonText, Card, UserAvatar } from '@/components/ui'
import { StickerAvatar } from '@/components/portfolio/StickerAvatar'
import Link from 'next/link'
import { NotePostKindPill, type PostKind } from '@/components/notes/NotePostKindPill'
import {
  NoteReferenceAttachments,
  type NoteReferenceAttachmentsHandle,
} from '@/components/notes/NoteReferenceAttachments'
import {
  Megaphone,
  Plus,
  Circle,
  CheckCircle2,
} from 'lucide-react'
import {
  addDays,
  addMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  format,
  isBefore,
  startOfDay,
} from 'date-fns'

export type CollaboratorCandidate = {
  id: string
  username: string | null
  name: string | null
  avatar: string | null
}

interface CreateNoteFormProps {
  portfolios: Portfolio[]
  defaultPortfolioIds?: string[]
  humanPortfolioId?: string
  /** Owner's human portfolio for display (same style as NoteCard) */
  ownerPortfolio?: Portfolio | null
  currentUserId?: string
  mentionedNoteId?: string
  redirectUrl?: string
  onSuccess?: () => void
  onCancel?: () => void
  /** When true, form is for creating an open call (title, end date; no comment/collection settings) */
  isOpenCall?: boolean
  /** When true, form is for creating a resource note (no annotation privacy / collections / pin) */
  isResource?: boolean
}

const OPEN_CALL_NEVER_ENDS_WARNING = 'Setting never ends might lower the priority for broadcasting.'

export function CreateNoteForm({
  portfolios,
  defaultPortfolioIds = [],
  humanPortfolioId,
  ownerPortfolio = null,
  currentUserId,
  mentionedNoteId,
  redirectUrl,
  onSuccess,
  onCancel,
  isOpenCall = false,
  isResource = false,
}: CreateNoteFormProps) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [postKind, setPostKind] = useState<PostKind>(isResource ? 'resource' : 'post')
  const [postKindMenuOpen, setPostKindMenuOpen] = useState(false)
  const postKindMenuRef = useRef<HTMLDivElement>(null)
  const [openCallTitle, setOpenCallTitle] = useState('')
  const [openCallEndDate, setOpenCallEndDate] = useState<Date | null>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d
  })
  const [showEndDatePopup, setShowEndDatePopup] = useState(false)
  const [openCallCalendarMonth, setOpenCallCalendarMonth] = useState<Date>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d
  })
  const [selectedPortfolios, setSelectedPortfolios] = useState<string[]>(defaultPortfolioIds)
  const [collaborators, setCollaborators] = useState<CollaboratorCandidate[]>([])
  const [showCollaboratorPopup, setShowCollaboratorPopup] = useState(false)
  const [collaboratorSearchQuery, setCollaboratorSearchQuery] = useState('')
  const [collaboratorCandidates, setCollaboratorCandidates] = useState<CollaboratorCandidate[]>([])
  const [collaboratorCandidatesLoading, setCollaboratorCandidatesLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const referenceAttachmentsRef = useRef<NoteReferenceAttachmentsHandle>(null)
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([])
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([])
  const [newCollectionName, setNewCollectionName] = useState('')
  const [isCreatingCollection, setIsCreatingCollection] = useState(false)
  const [loadingCollections, setLoadingCollections] = useState(false)
  const [annotationPrivacy, setAnnotationPrivacy] = useState<'authors' | 'friends' | 'everyone'>('everyone')
  const [visibility, setVisibility] = useState<NoteVisibility>('public')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [showAssignPanel, setShowAssignPanel] = useState(false)
  const [userSelectedPortfolio, setUserSelectedPortfolio] = useState<Portfolio | null>(null)
  const [assignableSpaces, setAssignableSpaces] = useState<Portfolio[]>([])
  const [assignableLoading, setAssignableLoading] = useState(false)
  /** When collaborators are added: portfolio id -> true if all (owner + collaborators) can create there */

  const isEffectiveResource = isResource || postKind === 'resource'
  const canSelectPostKind = !isOpenCall && !mentionedNoteId && !isResource

  useEffect(() => {
    if (!postKindMenuOpen) return
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (postKindMenuRef.current && postKindMenuRef.current.contains(target)) return
      setPostKindMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [postKindMenuOpen])
  const [portfolioIdsAllCanCreate, setPortfolioIdsAllCanCreate] = useState<Record<string, boolean>>({})
  const [portfolioIdsAllCanCreateLoading, setPortfolioIdsAllCanCreateLoading] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  // Effective list: props portfolios + any assignable space we selected (for display and submit)
  const effectivePortfolios = useMemo(() => {
    const list = [...portfolios]
    // Ensure any selected spaces are present (portfolios prop may not include them on /notes/create).
    for (const id of selectedPortfolios) {
      if (list.some((p) => p.id === id)) continue
      const fromAssignable = assignableSpaces.find((p) => p.id === id)
      if (fromAssignable) list.push(fromAssignable)
    }
    return list
  }, [portfolios, selectedPortfolios, assignableSpaces])

  // Filter to show portfolios passed in (currently projects/activities/communities)
  const displayablePortfolios = effectivePortfolios

  // With multi-space assignment, "context" features (collections, members label)
  // are only well-defined when exactly one space is selected.
  const selectedSpaceIds = useMemo(() => {
    return selectedPortfolios.filter((id) => {
      const p = effectivePortfolios.find((x) => x.id === id)
      return !!p && isSpacePortfolio(p)
    })
  }, [selectedPortfolios, effectivePortfolios])

  const selectedContextId = selectedSpaceIds.length === 1 ? selectedSpaceIds[0] : undefined

  // Fetch collections for the selected project or activity
  useEffect(() => {
    const fetchCollections = async () => {
      if (!selectedContextId) {
        setCollections([])
        return
      }

      setLoadingCollections(true)
      try {
        const response = await fetch(`/api/collections?portfolio_id=${selectedContextId}`)
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setCollections(data.collections || [])
          }
        }
      } catch (error) {
        console.error('Error fetching collections:', error)
      } finally {
        setLoadingCollections(false)
      }
    }

    fetchCollections()
  }, [selectedContextId])

  // Fetch collaborator candidates when popup is open (friends or portfolio members, then filter by q)
  useEffect(() => {
    if (!showCollaboratorPopup) {
      setCollaboratorCandidates([])
      return
    }
    const portfolioId = selectedContextId || ''
    const params = new URLSearchParams()
    if (portfolioId) params.set('portfolio_id', portfolioId)
    if (collaboratorSearchQuery.trim()) params.set('q', collaboratorSearchQuery.trim())
    const url = `/api/notes/collaborator-candidates?${params.toString()}`
    setCollaboratorCandidatesLoading(true)
    fetch(url)
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((data) => {
        setCollaboratorCandidates(data.users || [])
      })
      .catch(() => setCollaboratorCandidates([]))
      .finally(() => setCollaboratorCandidatesLoading(false))
  }, [showCollaboratorPopup, selectedContextId, collaboratorSearchQuery])

  // Reset selected collections when context portfolio changes
  useEffect(() => {
    setSelectedCollectionIds([])
  }, [selectedContextId])

  // Keep visibility valid when assignment changes (unassigned: public/friends/private; assigned: public/members)
  useEffect(() => {
    if (selectedSpaceIds.length >= 1) {
      if (visibility === 'friends' || visibility === 'private') {
        setVisibility('members')
      }
    } else {
      if (visibility === 'members') {
        setVisibility('public')
      }
    }
  }, [selectedSpaceIds.length, visibility])

  // Fetch assignable projects and activities when assign panel opens
  useEffect(() => {
    if (!showAssignPanel) return

    const fetchAssignable = async () => {
      setAssignableLoading(true)
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (!authUser) {
          setAssignableSpaces([])
          return
        }

        const { data: allSpaces } = await supabase
          .from('portfolios')
          .select('*')
          .in('type', [...DB_NON_HUMAN_TYPES])
          .order('created_at', { ascending: false })

        // All eligible spaces: user is owner, manager, or member.
        const spaces = (allSpaces || [])
          .filter((p: any) => {
            const metadata = p.metadata as any
            const managers = metadata?.managers || []
            const members = metadata?.members || []
            return (
              p.user_id === authUser.id ||
              (Array.isArray(managers) && managers.includes(authUser.id)) ||
              (Array.isArray(members) && members.includes(authUser.id))
            )
          })
          .map((p: any) => ({ ...p, type: 'space' as const } as Portfolio))

        setAssignableSpaces(spaces)
      } catch (err) {
        console.error('Failed to fetch assignable portfolios:', err)
        setAssignableSpaces([])
      } finally {
        setAssignableLoading(false)
      }
    }

    fetchAssignable()
  }, [showAssignPanel, supabase])

  // When collaborators are added, check which assignable portfolios allow all (owner + collaborators) to post
  useEffect(() => {
    if (collaborators.length === 0) {
      setPortfolioIdsAllCanCreate({})
      return
    }
    const portfolioIds = [...assignableSpaces.map((p) => p.id)]
    if (portfolioIds.length === 0 || !currentUserId) {
      setPortfolioIdsAllCanCreate({})
      return
    }
    const userIds = [currentUserId, ...collaborators.map((c) => c.id)]
    setPortfolioIdsAllCanCreateLoading(true)
    fetch('/api/portfolios/can-create-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolio_ids: portfolioIds, user_ids: userIds }),
    })
      .then((res) => (res.ok ? res.json() : { result: {} }))
      .then((data) => setPortfolioIdsAllCanCreate(data.result || {}))
      .catch(() => setPortfolioIdsAllCanCreate({}))
      .finally(() => setPortfolioIdsAllCanCreateLoading(false))
  }, [collaborators, currentUserId, assignableSpaces])

  // If a portfolio is selected and collaborators are added such that not all can post there, clear the selection
  useEffect(() => {
    if (collaborators.length === 0 || !selectedPortfolios.length) return
    const id = selectedPortfolios[0]
    if (portfolioIdsAllCanCreate[id] === false) {
      setSelectedPortfolios([])
      setUserSelectedPortfolio(null)
    }
  }, [collaborators.length, portfolioIdsAllCanCreate, selectedPortfolios])

  const removePortfolio = (portfolioId: string) => {
    // Don't allow removing the assigned project - notes must be assigned to exactly one project
    // Only allow removal if there are multiple portfolios selected (shouldn't happen, but safety check)
    if (selectedPortfolios.length <= 1) {
      return
    }
    setSelectedPortfolios((prev) => prev.filter((id) => id !== portfolioId))
  }

  const getPortfolioName = (portfolio: Portfolio): string => {
    const basic = getPortfolioBasic(portfolio)
    return basic.name || portfolio.slug
  }

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim() || !selectedContextId) return

    setIsCreatingCollection(true)
    try {
      const response = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio_id: selectedContextId,
          name: newCollectionName.trim(),
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.collection) {
          setCollections((prev) => [...prev, data.collection])
          setSelectedCollectionIds((prev) => [...prev, data.collection.id])
          setNewCollectionName('')
        } else {
          setError(data.error || 'Failed to create collection')
        }
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to create collection')
      }
    } catch (error: any) {
      setError(error.message || 'Failed to create collection')
    } finally {
      setIsCreatingCollection(false)
    }
  }

  const toggleCollection = (collectionId: string) => {
    setSelectedCollectionIds((prev) =>
      prev.includes(collectionId)
        ? prev.filter((id) => id !== collectionId)
        : [...prev, collectionId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (isOpenCall && !openCallTitle.trim()) {
      setError('Open call title is required')
      return
    }
    setIsSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('text', text.trim())
      referenceAttachmentsRef.current?.appendToFormData(formData)

      // Only allow IDs that correspond to portfolios we know about (props + user-selected)
      const contextPortfolios = selectedPortfolios.filter((id) =>
        effectivePortfolios.some((p) => p.id === id)
      )
      // Allow zero or more portfolios (assignment is optional)
      formData.append('assigned_portfolios', JSON.stringify(contextPortfolios))

      // Collaborators are invited after note is created (invite flow), not added directly
      formData.append('collaborator_account_ids', '[]')

      if (mentionedNoteId) {
        formData.append('mentioned_note_id', mentionedNoteId)
      }

      if (isOpenCall) {
        formData.append('note_type', 'open_call')
        formData.append('open_call_title', openCallTitle.trim())
        formData.append('open_call_never_ends', openCallEndDate === null ? 'true' : 'false')
        if (openCallEndDate) {
          formData.append('open_call_end_date', openCallEndDate.toISOString())
        }
      } else {
        if (!mentionedNoteId) {
          formData.append('note_type', postKind)
        }
        if (!isEffectiveResource) {
        if (!mentionedNoteId) {
          formData.append('annotation_privacy', annotationPrivacy)
        }
        if (selectedCollectionIds.length > 0) {
          formData.append('collection_ids', JSON.stringify(selectedCollectionIds))
        }
        }
      }

      // Visibility: public/friends/private (unassigned) or public/members (assigned)
      formData.append('visibility', visibility)

      const result = await createNote(formData)

      // Guard against undefined result
      if (!result) {
        console.error('createNote returned undefined')
        setError('An unexpected error occurred. Please try again.')
        return
      }

      if (result.success) {
        if (result.noteId && collaborators.length > 0) {
          for (const c of collaborators) {
            try {
              await fetch(`/api/notes/${result.noteId}/collaborator-invites`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invitee_id: c.id }),
              })
            } catch (err) {
              console.error('Failed to send invite to', c.id, err)
            }
          }
        }
        setText('')
        referenceAttachmentsRef.current?.reset()
        setCollaborators([])
        if (isOpenCall) {
          setOpenCallTitle('')
          const d = addDays(startOfDay(new Date()), 7)
          setOpenCallEndDate(d)
          setOpenCallCalendarMonth(d)
        }
        if (onSuccess) {
          onSuccess()
        } else if (redirectUrl) {
          router.push(redirectUrl)
        } else {
          router.refresh()
        }
      } else {
        setError(result.error || 'Failed to create note')
      }
    } catch (err: any) {
      console.error('Error in handleSubmit:', err)
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const ownerBasic = ownerPortfolio ? getPortfolioBasic(ownerPortfolio) : null
  const ownerName = ownerBasic?.name || 'You'
  const ownerUrl = currentUserId
    ? ownerPortfolio
      ? getPortfolioUrl(ownerPortfolio)
      : getHumanProfileUrl(currentUserId)
    : '#'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Open call heading + title at top (same size/style as Projects, Activities, Notes section headings) */}
      {isOpenCall && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-orange-500 flex-shrink-0" strokeWidth={1.5} aria-hidden />
            <UIText>Open call</UIText>
          </div>
          <textarea
            id="open_call_title"
            value={openCallTitle}
            onChange={(e) => setOpenCallTitle(e.target.value)}
            placeholder="Open call title"
            rows={2}
            className="w-full px-0 py-2 bg-transparent text-xl font-normal text-gray-900 placeholder:text-gray-400 focus:outline-none resize-none"
            aria-label="Open call title"
          />
        </div>
      )}

      {/* Authors pill (stacked avatars when 2+ people) + Plus to add collaborators (invite after create) */}
      {ownerPortfolio && (
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0 min-w-0">
              {collaborators.length === 0 ? (
                <>
                  <UserAvatar
                    userId={currentUserId ?? ''}
                    name={ownerName}
                    avatar={ownerBasic?.avatar}
                    size={32}
                    showLink={false}
                  />
                  <UIText as="span" className="text-gray-700 whitespace-nowrap">{ownerName}</UIText>
                </>
              ) : (
                (() => {
                  const authorProfiles: { id: string; name: string; avatar?: string | null }[] = [
                    { id: currentUserId ?? '', name: ownerName, avatar: ownerBasic?.avatar },
                    ...collaborators.map((c) => ({ id: c.id, name: c.name || c.username || c.id.slice(0, 8), avatar: c.avatar })),
                  ]
                  const display = authorProfiles.slice(0, 5)
                  const label =
                    authorProfiles.length === 2
                      ? `${authorProfiles[0].name} and ${authorProfiles[1].name}`
                      : authorProfiles.length > 2
                        ? `${authorProfiles[0].name}, ${authorProfiles[1].name}, and others`
                        : authorProfiles[0].name
                  return (
                    <>
                      <div className="flex -space-x-2 flex-shrink-0">
                        {display.map((p, index) => (
                          <div
                            key={p.id}
                            className="relative ring-2 ring-white rounded-full"
                            style={{ zIndex: display.length - index }}
                          >
                            <UserAvatar userId={p.id} name={p.name} avatar={p.avatar} size={32} showLink={false} />
                          </div>
                        ))}
                      </div>
                      <UIText as="span" className="text-gray-700 whitespace-nowrap">{label}</UIText>
                    </>
                  )
                })()
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowCollaboratorPopup(true)}
              className="p-2 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 flex-shrink-0"
              title="Add collaborators (invite)"
              aria-label="Add collaborators"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Post kind selector (top-right). Hidden for open calls, annotations, and dedicated resource route. */}
          {!isOpenCall && !mentionedNoteId && (
            <div className="relative" ref={postKindMenuRef}>
              {canSelectPostKind ? (
                <button
                  type="button"
                  onClick={() => setPostKindMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={postKindMenuOpen}
                  className="focus:outline-none"
                >
                  <NotePostKindPill kind={postKind} interactive={true} showChevron={true} />
                </button>
              ) : (
                <NotePostKindPill kind="resource" />
              )}

              {canSelectPostKind && postKindMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-48 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden z-50"
                >
                  {(['post', 'resource'] as PostKind[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setPostKind(kind)
                        setPostKindMenuOpen(false)
                      }}
                      className="w-full px-3 py-2 hover:bg-gray-50 flex items-center justify-start"
                    >
                      <NotePostKindPill kind={kind} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Collaborator popup - same style as reactions (reactions-style modal) */}
      {showCollaboratorPopup && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black bg-opacity-40"
          onClick={() => setShowCollaboratorPopup(false)}
        >
          <div
            className="bg-white rounded-xl shadow-lg w-full max-w-sm mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 flex items-center justify-center border-b border-gray-100">
              <UIText>Add collaborators (invite after note is created)</UIText>
            </div>
            {collaborators.length > 0 && (
              <div className="px-4 py-3 border-b border-gray-100">
                <UIText as="p" className="text-xs text-gray-500 mb-2">Added (to invite)</UIText>
                <div className="space-y-1">
                  {collaborators.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 py-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <UserAvatar userId={c.id} name={c.name || c.username || ''} avatar={c.avatar} size={28} showLink={false} />
                        <UIText as="span" className="truncate text-sm">{c.name || c.username || c.id.slice(0, 8)}</UIText>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCollaborators((prev) => prev.filter((x) => x.id !== c.id))}
                        className="text-sm text-red-600 hover:text-red-700 flex-shrink-0"
                        aria-label="Remove"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <input
              type="text"
              value={collaboratorSearchQuery}
              onChange={(e) => setCollaboratorSearchQuery(e.target.value)}
              placeholder="Search by username or name..."
              className="mx-4 mt-3 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus={collaborators.length === 0}
            />
            <div className="px-4 py-3 overflow-y-auto flex-1" style={{ maxHeight: '50vh' }}>
              {collaboratorCandidatesLoading ? (
                <UIText className="text-gray-500 text-sm">Loading...</UIText>
              ) : collaboratorCandidates.length === 0 ? (
                <UIText className="text-gray-500 text-sm">
                  {collaboratorSearchQuery.trim() ? 'No matching people.' : 'No friends or members to add.'}
                </UIText>
              ) : (
                collaboratorCandidates
                  .filter((u) => !collaborators.some((c) => c.id === u.id))
                  .map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setCollaborators((prev) => [...prev, u])
                        setCollaboratorSearchQuery('')
                      }}
                      className="w-full flex items-center gap-3 py-2 rounded-lg hover:bg-gray-50 text-left"
                    >
                      <UserAvatar userId={u.id} name={u.name || u.username || ''} avatar={u.avatar} size={32} showLink={false} />
                      <div className="min-w-0">
                        <UIText as="span" className="block truncate">{u.name || u.username || u.id.slice(0, 8)}</UIText>
                        {u.username && u.name && <UIText as="span" className="text-gray-500 text-xs block truncate">@{u.username}</UIText>}
                      </div>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Text input */}
      <div>
        <textarea
          id="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          rows={4}
          className="w-full px-0 py-2 bg-transparent focus:outline-none resize-none placeholder:text-gray-400"
          placeholder={isOpenCall ? 'Describe your open call...' : 'Write your note...'}
          aria-label="Note text"
        />
      </div>

      <NoteReferenceAttachments ref={referenceAttachmentsRef} setError={setError} />

      {/* End date (open call only): below note content, before Advanced */}
      {isOpenCall && (
        <div>
          <UIText as="label" className="block text-sm font-medium text-gray-700 mb-1">
            End date
          </UIText>
          <button
            type="button"
            onClick={() => setShowEndDatePopup(true)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 text-left"
          >
            <span className="text-gray-900">
              {openCallEndDate === null
                ? 'Never ends'
                : (() => {
                    const now = new Date()
                    now.setHours(0, 0, 0, 0)
                    const end = new Date(openCallEndDate)
                    end.setHours(0, 0, 0, 0)
                    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                    if (daysLeft <= 0) return 'Ended'
                    if (daysLeft === 1) return 'Ends in 1 day'
                    if (daysLeft < 30) return `Ends in ${daysLeft} days`
                    return `Ends on ${end.toLocaleDateString()}`
                  })()}
            </span>
            <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {openCallEndDate === null && (
            <UIText as="p" className="mt-1.5 text-xs text-amber-700">
              {OPEN_CALL_NEVER_ENDS_WARNING}
            </UIText>
          )}
        </div>
      )}

      {/* Edit end date popup (open call only) */}
      {isOpenCall && showEndDatePopup && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black bg-opacity-40"
          onClick={() => setShowEndDatePopup(false)}
        >
          <div
            className="bg-white rounded-xl shadow-lg w-full max-w-sm mx-4 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <UIText as="h3" className="font-medium text-gray-900 mb-3">
              Set end date
            </UIText>
            <div className="space-y-3">
              {/* When "Never ends" is selected: hide end-in-days and calendar, show only warning */}
              {openCallEndDate === null ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    className="w-full px-3 py-2 rounded-lg text-sm text-left bg-amber-100 text-amber-900 border border-amber-300"
                  >
                    Never ends (selected)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = addDays(startOfDay(new Date()), 7)
                      setOpenCallEndDate(d)
                      setOpenCallCalendarMonth(d)
                    }}
                    className="w-full px-3 py-2 rounded-lg text-sm text-left bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    End in X days
                  </button>
                  <UIText as="p" className="text-xs text-amber-700">
                    {OPEN_CALL_NEVER_ENDS_WARNING}
                  </UIText>
                </div>
              ) : (
                <>
                  {/* End in [ ] day - editable number */}
                  {(() => {
                    const today = startOfDay(new Date())
                    const end = startOfDay(openCallEndDate)
                    const daysVal = Math.max(1, Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
                    return (
                      <div className="flex items-center gap-2">
                        <UIText as="span" className="text-sm text-gray-700">
                          End in
                        </UIText>
                        <input
                          type="number"
                          min={1}
                          value={daysVal}
                          onChange={(e) => {
                            const n = parseInt(e.target.value, 10)
                            if (!Number.isNaN(n) && n >= 1) {
                              const d = addDays(startOfDay(new Date()), n)
                              setOpenCallEndDate(d)
                              setOpenCallCalendarMonth(d)
                            }
                          }}
                          className="w-16 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-center"
                        />
                        <UIText as="span" className="text-sm text-gray-700">
                          day{daysVal !== 1 ? 's' : ''}
                        </UIText>
                      </div>
                    )
                  })()}
                  {/* Calendar grid - bidirectional with end-in-days */}
                  {(() => {
                    const monthStart = startOfMonth(openCallCalendarMonth)
                    const monthEnd = endOfMonth(monthStart)
                    const calendarStart = startOfWeek(monthStart)
                    const calendarEnd = endOfWeek(monthEnd)
                    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })
                    const today = startOfDay(new Date())
                    return (
                      <div className="mt-2">
                        <div className="flex items-center justify-between mb-2">
                          <button
                            type="button"
                            onClick={() => setOpenCallCalendarMonth(addMonths(openCallCalendarMonth, -1))}
                            className="p-1 rounded hover:bg-gray-100 text-gray-600"
                            aria-label="Previous month"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          <UIText as="span" className="text-sm font-medium text-gray-900">
                            {format(openCallCalendarMonth, 'MMMM yyyy')}
                          </UIText>
                          <button
                            type="button"
                            onClick={() => setOpenCallCalendarMonth(addMonths(openCallCalendarMonth, 1))}
                            className="p-1 rounded hover:bg-gray-100 text-gray-600"
                            aria-label="Next month"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>
                        <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
                          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                            <div key={d} className="py-1 text-gray-500 font-medium">
                              {d}
                            </div>
                          ))}
                          {days.map((day) => {
                            const isPast = isBefore(day, today)
                            const isSelected = openCallEndDate && isSameDay(day, openCallEndDate)
                            const isCurrentMonth = isSameMonth(day, monthStart)
                            return (
                              <button
                                key={day.toISOString()}
                                type="button"
                                disabled={isPast}
                                onClick={() => {
                                  if (isPast) return
                                  setOpenCallEndDate(day)
                                }}
                                className={`p-1.5 rounded text-sm ${
                                  isPast
                                    ? 'text-gray-300 cursor-not-allowed'
                                    : isSelected
                                      ? 'bg-blue-600 text-white'
                                      : isCurrentMonth
                                        ? 'text-gray-900 hover:bg-gray-100'
                                        : 'text-gray-400 hover:bg-gray-50'
                                }`}
                              >
                                {format(day, 'd')}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                  {/* Never ends selector */}
                  <button
                    type="button"
                    onClick={() => setOpenCallEndDate(null)}
                    className="w-full px-3 py-2 rounded-lg text-sm text-left bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    Never ends
                  </button>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" onClick={() => setShowEndDatePopup(false)}>
                <UIText>Cancel</UIText>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Assigned spaces: removable pills + persistent "+" pill */}
      <div className="flex items-center gap-2 flex-wrap">
        {selectedSpaceIds.map((spaceId, idx) => {
          const space = effectivePortfolios.find((p) => p.id === spaceId)
          if (!space || !isSpacePortfolio(space)) return null
          const basic = getPortfolioBasic(space)
          const meta = space.metadata as any
          const isPrimary = idx === 0
          return (
            <div
              key={space.id}
              className="inline-flex items-center gap-2 pl-2 pr-1 h-8 rounded-full bg-gray-100"
              title={basic.name}
            >
              <Link
                href={getPortfolioUrl(space)}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-2 min-w-0 hover:opacity-90 transition-opacity"
              >
                <StickerAvatar
                  src={basic.avatar}
                  alt={basic.name}
                  type={space.type}
                  size={24}
                  emoji={meta?.basic?.emoji}
                  name={basic.name}
                  variant="mini"
                />
                <UIText as="span" className="max-w-[160px] truncate text-gray-700">
                  {basic.name}
                </UIText>
                {isPrimary && (
                  <UIText as="span" className="text-gray-500">
                    Primary
                  </UIText>
                )}
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSelectedPortfolios((prev) => prev.filter((id) => id !== space.id))
                  if (userSelectedPortfolio?.id === space.id) {
                    setUserSelectedPortfolio(null)
                  }
                }}
                className="w-7 h-7 inline-flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-500"
                aria-label={`Remove ${basic.name}`}
                title="Remove"
              >
                <span className="leading-none">×</span>
              </button>
            </div>
          )
        })}

        <button
          type="button"
          onClick={() => setShowAssignPanel(true)}
          className="inline-flex items-center gap-2 px-3 h-8 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          title="Add space"
          aria-label="Add space"
        >
          <Plus className="w-4 h-4 text-gray-600" />
          <UIText as="span" className="text-gray-700">
            Add space
          </UIText>
        </button>
      </div>

      {/* Assign portfolio panel (project or activity) */}
      {showAssignPanel && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowAssignPanel(false)}
        >
          <div
            className="mx-4 flex max-h-[min(80vh,100dvh-2rem)] w-[min(100vw-2rem,42rem)] min-h-0 flex-col overflow-hidden rounded-xl bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <Card variant="default" padding="sm" className="flex min-h-0 flex-1 flex-col">
              <div className="mb-3 shrink-0">
                <UIText>Select a space to add</UIText>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                {assignableLoading ? (
                  <div className="py-8 text-center">
                    <UIText className="text-gray-500">Loading...</UIText>
                  </div>
                ) : (
                  <>
                  {assignableSpaces.length > 0 && (
                    <div className="mb-4">
                      {collaborators.length > 0 && (
                        <UIText as="p" className="mb-2 text-xs text-gray-500">
                          Only spaces where all collaborators can post are selectable.
                        </UIText>
                      )}
                      <div className="grid grid-cols-3 gap-x-4 gap-y-6">
                        {assignableSpaces.map((space) => {
                          const basic = getPortfolioBasic(space)
                          const metadata = space.metadata as { basic?: { emoji?: string } } | undefined
                          const canSelect =
                            collaborators.length === 0 || portfolioIdsAllCanCreate[space.id] === true
                          const isSelected = selectedPortfolios.includes(space.id)
                          return (
                            <button
                              key={space.id}
                              type="button"
                              disabled={!canSelect}
                              onClick={() => {
                                if (!canSelect) return
                                if (isSelected) return
                                setUserSelectedPortfolio(space)
                                setSelectedPortfolios((prev) => [...prev, space.id])
                                setShowAssignPanel(false)
                              }}
                              className={`relative flex flex-col items-center gap-2 py-4 px-3 transition-opacity ${
                                isSelected
                                  ? 'bg-gray-100'
                                  : ''
                              } ${
                                canSelect ? 'hover:opacity-80' : 'opacity-50 cursor-not-allowed grayscale'
                              }`}
                              title={
                                !canSelect ? 'Not available: not all collaborators can post here' : basic.name
                              }
                            >
                              {isSelected && (
                                <div className="absolute top-2 right-2">
                                  <CheckCircle2 className="w-5 h-5 text-gray-600" strokeWidth={2} />
                                </div>
                              )}
                              <StickerAvatar
                                src={basic.avatar}
                                alt={basic.name}
                                type="space"
                                size={72}
                                emoji={metadata?.basic?.emoji}
                                name={basic.name}
                              />
                              <UIText className="text-center max-w-[96px] truncate" title={basic.name}>
                                {basic.name}
                              </UIText>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {!assignableLoading &&
                    assignableSpaces.length === 0 && (
                      <UIText className="text-gray-500 py-4">
                        No spaces available.
                      </UIText>
                    )}
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Advanced settings: visibility, collections — collapsed by default */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
          aria-expanded={advancedOpen}
        >
          <UIText as="span" className="font-medium text-gray-900">
            Advanced settings
          </UIText>
          <svg
            className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {advancedOpen && (
          <div className="p-4 pt-2 space-y-4 border-t border-gray-200">
            {/* Visibility */}
            <div>
              <UIText as="label" className="block text-sm font-medium text-gray-700 mb-2">
                Visibility
              </UIText>
              <div className="flex flex-wrap gap-2">
                {selectedSpaceIds.length >= 1
                  ? (
                      [
                        { value: 'public' as const, label: 'Public' },
                        {
                          value: 'members' as const,
                          label: (() => {
                            if (selectedSpaceIds.length > 1) return `Members of ${selectedSpaceIds.length} spaces`
                            const onlyId = selectedSpaceIds[0]
                            const context = effectivePortfolios.find((p) => p.id === onlyId)
                            const name = context ? getPortfolioName(context) : 'this portfolio'
                            return `Members of ${name}`
                          })(),
                        },
                      ] satisfies Array<{ value: NoteVisibility; label: string }>
                    ).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setVisibility(value)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                          visibility === value
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))
                  : (
                      [
                        { value: 'public' as const, label: 'Public' },
                        { value: 'friends' as const, label: 'Friends' },
                        { value: 'private' as const, label: 'Private' },
                      ] satisfies Array<{ value: NoteVisibility; label: string }>
                    ).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setVisibility(value)}
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                          visibility === value
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
              </div>
              <UIText as="p" className="text-xs text-gray-500 mt-1">
                {selectedSpaceIds.length >= 1
                  ? 'Members-only notes are only visible to members of the assigned space(s).'
                  : 'Friends-only notes are only visible to your friends. Private notes are only visible to you.'}
              </UIText>
            </div>

            {/* Collection selection - only show if a context portfolio is selected (hidden for open call) */}
            {!isOpenCall && !isEffectiveResource && selectedContextId && (
              <div>
                <UIText as="label" className="block mb-2">
                  Collections (optional)
                </UIText>

                {loadingCollections ? (
                  <UIText className="text-gray-500">Loading collections...</UIText>
                ) : collections.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {collections.map((collection) => (
                      <button
                        key={collection.id}
                        type="button"
                        onClick={() => toggleCollection(collection.id)}
                        className={`px-3 py-1 rounded-full text-sm transition-colors ${
                          selectedCollectionIds.includes(collection.id)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {collection.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <UIText className="text-gray-500 mb-3">No collections yet. Create one below.</UIText>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleCreateCollection()
                      }
                    }}
                    placeholder="New collection name"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleCreateCollection}
                    disabled={!newCollectionName.trim() || isCreatingCollection}
                  >
                    <UIText>{isCreatingCollection ? 'Creating...' : 'Create'}</UIText>
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting || !text.trim()}
        >
          <UIText>
            {isSubmitting
              ? 'Creating...'
              : isOpenCall
                ? 'Create Open call'
                : isEffectiveResource
                  ? 'Create Resource'
                  : 'Create Note'}
          </UIText>
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
          >
            <UIText>Cancel</UIText>
          </Button>
        )}
      </div>
    </form>
  )
}
