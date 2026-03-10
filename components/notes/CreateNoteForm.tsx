'use client'

import { useState, useRef, useEffect, Fragment, useMemo } from 'react'
import { createNote } from '@/app/notes/actions'
import {
  Portfolio,
  isProjectPortfolio,
  isActivityPortfolio,
  isCommunityPortfolio,
} from '@/types/portfolio'
import type { NoteVisibility } from '@/types/note'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { UIText, Button, Content, UIButtonText, Card, UserAvatar } from '@/components/ui'
import { StickerAvatar } from '@/components/portfolio/StickerAvatar'
import Link from 'next/link'
import { ensureBrowserCompatibleImage } from '@/lib/utils/heic-converter'
import { getHostnameFromUrl, getFaviconUrl } from '@/lib/notes/url-helpers'
import { Image as ImageIcon, Link2, Megaphone, Plus } from 'lucide-react'
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
}

type ReferenceType = 'none' | 'image' | 'url'

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
}: CreateNoteFormProps) {
  const router = useRouter()
  const [text, setText] = useState('')
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
  const [referenceType, setReferenceType] = useState<ReferenceType>('none')
  const [urlInput, setUrlInput] = useState('')
  const [confirmedUrl, setConfirmedUrl] = useState<string | null>(null)
  const [selectedPortfolios, setSelectedPortfolios] = useState<string[]>(defaultPortfolioIds)
  const [collaborators, setCollaborators] = useState<CollaboratorCandidate[]>([])
  const [showCollaboratorPopup, setShowCollaboratorPopup] = useState(false)
  const [collaboratorSearchQuery, setCollaboratorSearchQuery] = useState('')
  const [collaboratorCandidates, setCollaboratorCandidates] = useState<CollaboratorCandidate[]>([])
  const [collaboratorCandidatesLoading, setCollaboratorCandidatesLoading] = useState(false)
  const [images, setImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([]) // Thumbnail URLs for previews
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCompressing, setIsCompressing] = useState(false)
  const [compressionProgress, setCompressionProgress] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([])
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([])
  const [newCollectionName, setNewCollectionName] = useState('')
  const [isCreatingCollection, setIsCreatingCollection] = useState(false)
  const [loadingCollections, setLoadingCollections] = useState(false)
  const [shouldPin, setShouldPin] = useState(false)
  const [pinInfo, setPinInfo] = useState<{ count: number; max: number; canPin: boolean } | null>(null)
  const [loadingPinInfo, setLoadingPinInfo] = useState(false)
  const [annotationPrivacy, setAnnotationPrivacy] = useState<'authors' | 'friends' | 'everyone'>('everyone')
  const [visibility, setVisibility] = useState<NoteVisibility>('public')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [showAssignPanel, setShowAssignPanel] = useState(false)
  const [userSelectedPortfolio, setUserSelectedPortfolio] = useState<Portfolio | null>(null)
  const [assignableProjects, setAssignableProjects] = useState<Portfolio[]>([])
  const [assignableActivities, setAssignableActivities] = useState<Portfolio[]>([])
  const [assignableCommunities, setAssignableCommunities] = useState<Portfolio[]>([])
  const [assignableLoading, setAssignableLoading] = useState(false)
  /** When collaborators are added: portfolio id -> true if all (owner + collaborators) can create there */
  const [portfolioIdsAllCanCreate, setPortfolioIdsAllCanCreate] = useState<Record<string, boolean>>({})
  const [portfolioIdsAllCanCreateLoading, setPortfolioIdsAllCanCreateLoading] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  // Effective list: props portfolios + portfolio selected from assign panel (for display and submit)
  const effectivePortfolios = useMemo(() => {
    const list = [...portfolios]
    if (userSelectedPortfolio && !list.some((p) => p.id === userSelectedPortfolio.id)) {
      list.push(userSelectedPortfolio)
    }
    return list
  }, [portfolios, userSelectedPortfolio])

  // Filter to show portfolios passed in (currently projects/activities/communities)
  const displayablePortfolios = effectivePortfolios

  // Get the selected context portfolio ID (project, activity, or community)
  const selectedContextId = selectedPortfolios.find((id) => {
    const portfolio = effectivePortfolios.find((p) => p.id === id)
    return (
      portfolio &&
      (isProjectPortfolio(portfolio) ||
        isActivityPortfolio(portfolio) ||
        isCommunityPortfolio(portfolio))
    )
  })

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

  // Fetch pin info for the selected project or activity
  useEffect(() => {
    const fetchPinInfo = async () => {
      if (!selectedContextId) {
        setPinInfo(null)
        setShouldPin(false)
        return
      }

      setLoadingPinInfo(true)
      try {
        const response = await fetch(`/api/portfolios/${selectedContextId}/pin-info`)
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setPinInfo({
              count: data.pinCount || 0,
              max: 9,
              canPin: data.canPin || false,
            })
            // Reset pin selection if can't pin
            if (!data.canPin) {
              setShouldPin(false)
            }
          } else {
            setPinInfo(null)
            setShouldPin(false)
          }
        } else {
          setPinInfo(null)
          setShouldPin(false)
        }
      } catch (error) {
        console.error('Error fetching pin info:', error)
        setPinInfo(null)
        setShouldPin(false)
      } finally {
        setLoadingPinInfo(false)
      }
    }

    fetchPinInfo()
  }, [selectedContextId])

  // Reset selected collections when context portfolio changes
  useEffect(() => {
    setSelectedCollectionIds([])
  }, [selectedContextId])

  // Keep visibility valid when assignment changes (unassigned: public/friends/private; assigned: public/members)
  useEffect(() => {
    if (selectedContextId) {
      if (visibility === 'friends' || visibility === 'private') {
        setVisibility('members')
      }
    } else {
      if (visibility === 'members') {
        setVisibility('public')
      }
    }
  }, [selectedContextId, visibility])

  // Fetch assignable projects and activities when assign panel opens
  useEffect(() => {
    if (!showAssignPanel) return

    const fetchAssignable = async () => {
      setAssignableLoading(true)
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (!authUser) {
          setAssignableProjects([])
          setAssignableActivities([])
          return
        }

        const { data: allProjects } = await supabase
          .from('portfolios')
          .select('*')
          .eq('type', 'projects')
          .order('created_at', { ascending: false })

        const { data: allActivities } = await supabase
          .from('portfolios')
          .select('*')
          .eq('type', 'activities')
          .order('created_at', { ascending: false })

        const { data: allCommunities } = await supabase
          .from('portfolios')
          .select('*')
          .eq('type', 'community')
          .order('created_at', { ascending: false })

        const projects = (allProjects || [])
          .filter((p: any) => {
            const metadata = p.metadata as any
            const managers = metadata?.managers || []
            const members = metadata?.members || []
            const status = (metadata?.status as string | undefined) || null
            const isMemberOrManager =
              p.user_id === authUser.id ||
              (Array.isArray(managers) && managers.includes(authUser.id)) ||
              (Array.isArray(members) && members.includes(authUser.id))
            const isActive = status !== 'archived'
            return isMemberOrManager && isActive
          })
          .map((p: any) => ({ ...p, type: 'projects' as const } as Portfolio))

        const projectNameById = new Map<string, string>()
        ;(allProjects || []).forEach((p: any) => {
          const meta = p.metadata as any
          const basic = meta?.basic || {}
          projectNameById.set(p.id, (basic.name as string) || 'Project')
        })

        const now = new Date()
        const activities = (allActivities || [])
          .filter((p: any) => {
            const metadata = p.metadata as any
            const managers: string[] = metadata?.managers || []
            const members: string[] = metadata?.members || []
            const isOwner = p.user_id === authUser.id
            const isManager = Array.isArray(managers) && managers.includes(authUser.id)
            const isMember = Array.isArray(members) && members.includes(authUser.id)
            if (!isOwner && !isManager && !isMember) return false
            const props = metadata?.properties || {}
            const activity = props.activity_datetime as { start?: string; end?: string | null } | undefined
            if (!activity?.start) return false
            const start = new Date(activity.start)
            if (Number.isNaN(start.getTime())) return false
            let end: Date | null = null
            if (activity.end) {
              const parsedEnd = new Date(activity.end)
              end = Number.isNaN(parsedEnd.getTime()) ? null : parsedEnd
            }
            const effectiveEnd = end ?? start
            return effectiveEnd >= now
          })
          .map((p: any) => ({ ...p, type: 'activities' as const } as Portfolio))

        const communities = (allCommunities || [])
          .filter((p: any) => {
            const metadata = p.metadata as any
            const managers: string[] = metadata?.managers || []
            const members: string[] = metadata?.members || []
            const isOwner = p.user_id === authUser.id
            const isManager = Array.isArray(managers) && managers.includes(authUser.id)
            const isMember = Array.isArray(members) && members.includes(authUser.id)
            return isOwner || isManager || isMember
          })
          .map((p: any) => ({ ...p, type: 'community' as const } as Portfolio))

        setAssignableProjects(projects)
        setAssignableActivities(activities)
        setAssignableCommunities(communities)
      } catch (err) {
        console.error('Failed to fetch assignable portfolios:', err)
        setAssignableProjects([])
        setAssignableActivities([])
        setAssignableCommunities([])
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
    const portfolioIds = [
      ...assignableProjects.map((p) => p.id),
      ...assignableActivities.map((p) => p.id),
      ...assignableCommunities.map((p) => p.id),
    ]
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
  }, [collaborators, currentUserId, assignableProjects, assignableActivities, assignableCommunities])

  // If a portfolio is selected and collaborators are added such that not all can post there, clear the selection
  useEffect(() => {
    if (collaborators.length === 0 || !selectedPortfolios.length) return
    const id = selectedPortfolios[0]
    if (portfolioIdsAllCanCreate[id] === false) {
      setSelectedPortfolios([])
      setUserSelectedPortfolio(null)
    }
  }, [collaborators.length, portfolioIdsAllCanCreate, selectedPortfolios])

  /**
   * Read EXIF orientation from image file
   * Returns orientation value (1-8) or null if not found
   */
  const getExifOrientation = (file: File): Promise<number | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const view = new DataView(e.target?.result as ArrayBuffer)
        
        // Check for JPEG markers
        if (view.getUint16(0, false) !== 0xFFD8) {
          resolve(null)
          return
        }
        
        const length = view.byteLength
        let offset = 2
        
        while (offset < length) {
          if (view.getUint16(offset, false) !== 0xFFE1) {
            offset += 2
            if (offset >= length) break
            const markerLength = view.getUint16(offset, false)
            offset += 2 + markerLength
            continue
          }
          
          // Found EXIF marker
          offset += 2
          if (view.getUint32(offset, false) !== 0x45786966) { // "Exif"
            resolve(null)
            return
          }
          
          offset += 6
          const tiffOffset = offset
          const isLittleEndian = view.getUint16(tiffOffset, false) === 0x4949
          
          if (view.getUint16(tiffOffset + 2, !isLittleEndian) !== 0x002A) {
            resolve(null)
            return
          }
          
          const ifdOffset = view.getUint32(tiffOffset + 4, !isLittleEndian)
          const ifdStart = tiffOffset + ifdOffset
          const entryCount = view.getUint16(ifdStart, !isLittleEndian)
          
          for (let i = 0; i < entryCount; i++) {
            const entryOffset = ifdStart + 2 + (i * 12)
            const tag = view.getUint16(entryOffset, !isLittleEndian)
            
            if (tag === 0x0112) { // Orientation tag
              const type = view.getUint16(entryOffset + 2, !isLittleEndian)
              if (type === 3) {
                resolve(view.getUint16(entryOffset + 8, !isLittleEndian))
                return
              }
            }
          }
          
          resolve(null)
          return
        }
        
        resolve(null)
      }
      reader.onerror = () => resolve(null)
      reader.readAsArrayBuffer(file)
    })
  }

  /**
   * Apply EXIF orientation transformation to canvas context
   * This function should be called BEFORE drawing the image
   * Returns the final dimensions after transformation (may be swapped for rotations)
   */
  const applyExifOrientation = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    orientation: number,
    imgWidth: number,
    imgHeight: number
  ): { width: number; height: number } => {
    switch (orientation) {
      case 2:
        // Horizontal flip
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
        return { width: canvas.width, height: canvas.height }
      case 3:
        // 180° rotation
        ctx.translate(canvas.width, canvas.height)
        ctx.rotate(Math.PI)
        return { width: canvas.width, height: canvas.height }
      case 4:
        // Vertical flip
        ctx.translate(0, canvas.height)
        ctx.scale(1, -1)
        return { width: canvas.width, height: canvas.height }
      case 5:
        // 90° counter-clockwise + horizontal flip
        canvas.width = imgHeight
        canvas.height = imgWidth
        ctx.translate(imgHeight, 0)
        ctx.rotate(Math.PI / 2)
        ctx.scale(-1, 1)
        return { width: imgHeight, height: imgWidth }
      case 6:
        // 90° clockwise (most common for portrait photos)
        canvas.width = imgHeight
        canvas.height = imgWidth
        ctx.translate(imgHeight, 0)
        ctx.rotate(Math.PI / 2)
        return { width: imgHeight, height: imgWidth }
      case 7:
        // 90° clockwise + horizontal flip
        canvas.width = imgHeight
        canvas.height = imgWidth
        ctx.translate(imgHeight, 0)
        ctx.rotate(Math.PI / 2)
        ctx.scale(-1, 1)
        return { width: imgHeight, height: imgWidth }
      case 8:
        // 90° counter-clockwise
        canvas.width = imgHeight
        canvas.height = imgWidth
        ctx.translate(0, imgWidth)
        ctx.rotate(-Math.PI / 2)
        return { width: imgHeight, height: imgWidth }
      default:
        // Orientation 1 or unknown - no transformation needed
        return { width: canvas.width, height: canvas.height }
    }
  }

  /**
   * Compress an image file on the client side before upload
   * Uses Canvas API to resize and compress images
   * Handles EXIF orientation to prevent rotation issues
   * Skips compression if image is already small enough
   */
  const compressImage = async (
    file: File,
    maxWidth: number = 1920,
    maxHeight: number = 1920,
    quality: number = 0.85,
    maxFileSizeMB: number = 2 // Skip compression if file is already smaller than this
  ): Promise<File> => {
    // Skip compression if file is already small enough
    const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024
    if (file.size <= maxFileSizeBytes) {
      // Still check dimensions - if image is very large, we should resize even if file size is small
      return new Promise(async (resolve, reject) => {
        // Read EXIF orientation
        const orientation = await getExifOrientation(file)
        
        const reader = new FileReader()
        reader.onload = (e) => {
          const img = new Image()
          img.onload = () => {
            // If dimensions are within limits, return original file
            if (img.width <= maxWidth && img.height <= maxHeight) {
              resolve(file)
              return
            }
            
            // Otherwise, resize but keep original quality if file is small
            // This handles cases where image dimensions are large but file is compressed
            const aspectRatio = img.width / img.height
            let width = img.width
            let height = img.height

            if (width > maxWidth || height > maxHeight) {
              if (width > height) {
                width = Math.min(width, maxWidth)
                height = width / aspectRatio
              } else {
                height = Math.min(height, maxHeight)
                width = height * aspectRatio
              }
            }

            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')

            if (!ctx) {
              reject(new Error('Could not get canvas context'))
              return
            }

            // Apply EXIF orientation if needed (before drawing)
            if (orientation && orientation > 1) {
              // For rotated images (5-8), we need to use the calculated dimensions
              const { width: finalWidth, height: finalHeight } = applyExifOrientation(ctx, canvas, orientation, width, height)
              // Draw with the calculated dimensions
              ctx.drawImage(img, 0, 0, width, height)
              width = finalWidth
              height = finalHeight
            } else {
              ctx.drawImage(img, 0, 0, width, height)
            }

            const isPng = file.type === 'image/png'
            const outputFormat = isPng ? 'image/png' : 'image/jpeg'

            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Failed to resize image'))
                  return
                }

                const resizedFile = new File(
                  [blob],
                  file.name.replace(/\.[^.]+$/, isPng ? '.png' : '.jpg'),
                  {
                    type: outputFormat,
                    lastModified: Date.now(),
                  }
                )

                resolve(resizedFile)
              },
              outputFormat,
              isPng ? undefined : 0.95 // Higher quality since file is already small
            )
          }
          img.onerror = () => reject(new Error('Failed to load image'))
          img.src = e.target?.result as string
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
      })
    }

    // Full compression for larger files
    return new Promise(async (resolve, reject) => {
      // Read EXIF orientation
      const orientation = await getExifOrientation(file)
      
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          // Calculate new dimensions while maintaining aspect ratio
          // Note: We need to account for orientation - if image is rotated 90/270,
          // we need to swap width/height for dimension calculations
          let width = img.width
          let height = img.height
          
          // For 90/270 degree rotations, swap dimensions for calculation
          const isRotated = orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8
          if (isRotated) {
            [width, height] = [height, width]
          }

          if (width > maxWidth || height > maxHeight) {
            const aspectRatio = width / height
            if (width > height) {
              width = Math.min(width, maxWidth)
              height = width / aspectRatio
            } else {
              height = Math.min(height, maxHeight)
              width = height * aspectRatio
            }
          }
          
          // Swap back for canvas dimensions if rotated
          if (isRotated) {
            [width, height] = [height, width]
          }

          // Create canvas
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')

          if (!ctx) {
            reject(new Error('Could not get canvas context'))
            return
          }

          // Apply EXIF orientation transformation before drawing
          if (orientation && orientation > 1) {
            // Apply transformation - this may swap canvas dimensions for rotations
            const { width: finalWidth, height: finalHeight } = applyExifOrientation(ctx, canvas, orientation, width, height)
            // Draw with the calculated dimensions
            ctx.drawImage(img, 0, 0, width, height)
            width = finalWidth
            height = finalHeight
          } else {
            // Draw resized image normally
            ctx.drawImage(img, 0, 0, width, height)
          }

          // Determine output format - preserve PNG for transparency, convert others to JPEG
          const isPng = file.type === 'image/png'
          const outputFormat = isPng ? 'image/png' : 'image/jpeg'

          // Convert to blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'))
                return
              }

              // Create a new File object with the compressed blob
              const compressedFile = new File(
                [blob],
                file.name.replace(/\.[^.]+$/, isPng ? '.png' : '.jpg'),
                {
                  type: outputFormat,
                  lastModified: Date.now(),
                }
              )

              console.log(`Compressed ${file.name}: ${(file.size / 1024 / 1024).toFixed(2)}MB -> ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`)
              resolve(compressedFile)
            },
            outputFormat,
            isPng ? undefined : quality
          )
        }
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = e.target?.result as string
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  // Create a small thumbnail for preview (max 200x200px) to avoid memory issues
  const createThumbnail = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          // Create canvas for thumbnail
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('Could not get canvas context'))
            return
          }

          // Calculate thumbnail size (max 200x200, maintain aspect ratio)
          const maxSize = 200
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > maxSize) {
              height = (height * maxSize) / width
              width = maxSize
            }
          } else {
            if (height > maxSize) {
              width = (width * maxSize) / height
              height = maxSize
            }
          }

          canvas.width = width
          canvas.height = height

          // Draw resized image
          ctx.drawImage(img, 0, 0, width, height)

          // Convert to blob URL (much smaller than original)
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const thumbnailUrl = URL.createObjectURL(blob)
                resolve(thumbnailUrl)
              } else {
                reject(new Error('Failed to create thumbnail blob'))
              }
            },
            'image/jpeg',
            0.85 // Quality for thumbnail
          )
        }
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = e.target?.result as string
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    
    // Validate file sizes (max 50MB per file before compression)
    const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
    const oversizedFiles = files.filter(file => file.size > MAX_FILE_SIZE)
    
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map(f => f.name).join(', ')
      setError(`The following images are too large (max 50MB): ${fileNames}. Please compress them before uploading.`)
      // Clear the input
      if (e.target) {
        e.target.value = ''
      }
      return
    }
    
    // Compress images on client side before storing
    setIsCompressing(true)
    setCompressionProgress(0)
    setError(null)
    
    try {
      const compressedFiles: File[] = []
      const totalFiles = files.length
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setCompressionProgress(((i + 0.5) / totalFiles) * 100) // First half for conversion
        
        try {
          // Convert HEIC to JPEG if needed (before compression)
          const compatibleFile = await ensureBrowserCompatibleImage(file)
          
          setCompressionProgress(((i + 1) / totalFiles) * 100) // Second half for compression
          
          // Compress image: max 1920x1920, quality 0.85
          const compressedFile = await compressImage(compatibleFile, 1920, 1920, 0.85)
          compressedFiles.push(compressedFile)
        } catch (error) {
          console.error(`Failed to process ${file.name}:`, error)
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          // If HEIC conversion fails, show specific error
          if (errorMessage.includes('HEIC') || errorMessage.includes('convert')) {
            setError(`Failed to convert HEIC image "${file.name}": ${errorMessage}`)
            // Clear the input on error
            if (e.target) {
              e.target.value = ''
            }
            setIsCompressing(false)
            setCompressionProgress(0)
            return
          }
          // If compression fails, use original file (server will compress it)
          compressedFiles.push(file)
        }
      }
      
      // Store compressed files
      setImages((prev) => [...prev, ...compressedFiles])
      
      // Create thumbnails asynchronously to avoid blocking UI
      // Use requestIdleCallback if available, otherwise setTimeout
      const createThumbnails = async () => {
        const thumbnailPromises = compressedFiles.map((file) => createThumbnail(file))
        try {
          const thumbnails = await Promise.all(thumbnailPromises)
          setImagePreviews((prev) => [...prev, ...thumbnails])
        } catch (error) {
          console.error('Error creating thumbnails:', error)
          // Fallback: use object URLs if thumbnail creation fails
          const fallbackUrls = compressedFiles.map((file) => URL.createObjectURL(file))
          setImagePreviews((prev) => [...prev, ...fallbackUrls])
        }
      }

      // Defer thumbnail creation to avoid blocking typing
      if ('requestIdleCallback' in window) {
        ;(window as any).requestIdleCallback(createThumbnails, { timeout: 2000 })
      } else {
        setTimeout(createThumbnails, 0)
      }
    } catch (error: any) {
      console.error('Error compressing images:', error)
      setError(`Failed to compress images: ${error.message || 'Unknown error'}`)
      // Clear the input on error
      if (e.target) {
        e.target.value = ''
      }
    } finally {
      setIsCompressing(false)
      setCompressionProgress(0)
    }
  }

  const removeImage = (index: number) => {
    if (imagePreviews[index]) {
      URL.revokeObjectURL(imagePreviews[index])
    }
    setImages((prev) => prev.filter((_, i) => i !== index))
    setImagePreviews((prev) => prev.filter((_, i) => i !== index))
  }

  const reorderImages = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    setImages((prev) => {
      const arr = [...prev]
      const [item] = arr.splice(fromIndex, 1)
      arr.splice(toIndex, 0, item)
      return arr
    })
    setImagePreviews((prev) => {
      const arr = [...prev]
      const [item] = arr.splice(fromIndex, 1)
      arr.splice(toIndex, 0, item)
      return arr
    })
  }

  const handleImageDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (dragIndex === null || dropTargetIndex === null) return
    const toIndex = dropTargetIndex > dragIndex ? dropTargetIndex - 1 : dropTargetIndex
    if (toIndex !== dragIndex) reorderImages(dragIndex, toIndex)
    setDragIndex(null)
    setDropTargetIndex(null)
  }

  const normalizeUrlForPreview = (raw: string): string => {
    const t = raw.trim()
    return t.match(/^https?:\/\//i) ? t : `https://${t}`
  }

  // Clean up all object URLs on unmount
  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [imagePreviews])

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
      
      // Handle reference based on type
      if (referenceType === 'url' && confirmedUrl) {
        formData.append('url', confirmedUrl)
      }
      
      if (referenceType === 'image') {
        // Add image files
        images.forEach((image, index) => {
          formData.append(`image_${index}`, image)
        })
      }
      
      // Only allow IDs that correspond to portfolios we know about (props + user-selected)
      const contextPortfolios = selectedPortfolios.filter((id) =>
        effectivePortfolios.some((p) => p.id === id)
      )
      // Allow zero or one portfolio (assignment is optional)
      if (contextPortfolios.length > 1) {
        setError('Note can be assigned to at most one portfolio')
        setIsSubmitting(false)
        return
      }
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
          formData.append('annotation_privacy', annotationPrivacy)
        }
        if (selectedCollectionIds.length > 0) {
          formData.append('collection_ids', JSON.stringify(selectedCollectionIds))
        }
      }

      // Visibility: public/friends/private (unassigned) or public/members (assigned)
      formData.append('visibility', visibility)

      // Add pin preference if user wants to pin
      if (shouldPin && pinInfo?.canPin) {
        formData.append('should_pin', 'true')
      }

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
        setReferenceType('none')
        setUrlInput('')
        setConfirmedUrl(null)
        setCollaborators([])
        setImages([])
        imagePreviews.forEach((url) => URL.revokeObjectURL(url))
        setImagePreviews([])
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
  const ownerUrl = currentUserId ? getPortfolioUrl('human', ownerPortfolio?.id ?? '') : '#'

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
        <div className="flex items-center gap-2 flex-wrap mb-2">
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

      {/* Reference: Image and URL icon buttons below text (selected = darker) */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Add image"
          aria-label="Add image"
          onClick={() => setReferenceType(referenceType === 'image' ? 'none' : 'image')}
          className={`p-2 rounded-md transition-colors ${
            referenceType === 'image'
              ? 'bg-gray-300 text-gray-800 hover:bg-gray-400'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <ImageIcon className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          title="Add URL"
          aria-label="Add URL"
          onClick={() => {
            setReferenceType(referenceType === 'url' ? 'none' : 'url')
            if (referenceType === 'url') setConfirmedUrl(null)
          }}
          className={`p-2 rounded-md transition-colors ${
            referenceType === 'url'
              ? 'bg-gray-300 text-gray-800 hover:bg-gray-400'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Link2 className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* URL: input + confirm, then preview with delete */}
      {referenceType === 'url' && (
        <div>
          {!confirmedUrl ? (
            <div className="flex gap-2">
              <input
                type="text"
                id="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                placeholder="example.com or https://example.com"
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => urlInput.trim() && setConfirmedUrl(normalizeUrlForPreview(urlInput))}
                disabled={!urlInput.trim()}
              >
                <UIText>Confirm</UIText>
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-gray-50">
              <img
                src={getFaviconUrl(getHostnameFromUrl(confirmedUrl))}
                alt=""
                className="w-5 h-5 rounded"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://www.google.com/s2/favicons?domain=${getHostnameFromUrl(confirmedUrl)}&sz=64`
                }}
              />
              <span className="text-sm text-gray-700 truncate flex-1 min-w-0">{getHostnameFromUrl(confirmedUrl)}</span>
              <button
                type="button"
                onClick={() => setConfirmedUrl(null)}
                className="p-1 rounded text-red-600 hover:bg-red-50"
                title="Remove URL"
                aria-label="Remove URL"
              >
                <UIText className="text-xs">Delete</UIText>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Image: add + list with reorder and delete */}
      {referenceType === 'image' && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,.heic,.heif,image/*"
            multiple
            onChange={handleImageSelect}
            disabled={isCompressing}
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isCompressing}
          >
            <UIText>{isCompressing ? `Compressing... ${Math.round(compressionProgress)}%` : 'Add Images'}</UIText>
          </Button>
          {isCompressing && (
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${compressionProgress}%` }}
                />
              </div>
            </div>
          )}
          {images.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 items-start">
              {images.map((image, index) => (
                <Fragment key={index}>
                  {dragIndex !== null && dropTargetIndex === index && (
                    <div
                      className="w-20 h-20 rounded border-2 border-dashed border-gray-400 bg-gray-100 flex-shrink-0"
                      onDragOver={(e) => { e.preventDefault(); setDropTargetIndex(index) }}
                      onDrop={handleImageDrop}
                    />
                  )}
                  <div
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => { e.preventDefault(); setDropTargetIndex(index) }}
                    onDrop={handleImageDrop}
                    onDragEnd={() => { setDragIndex(null); setDropTargetIndex(null) }}
                    className={`relative flex flex-col items-center gap-1 flex-shrink-0 cursor-grab active:cursor-grabbing ${dragIndex === index ? 'opacity-50' : ''}`}
                  >
                    {imagePreviews[index] ? (
                      <img
                        src={imagePreviews[index]}
                        alt={`Preview ${index + 1}`}
                        className="w-20 h-20 object-cover rounded pointer-events-none"
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-20 h-20 bg-gray-200 rounded flex items-center justify-center">
                        <UIText className="text-xs text-gray-500">Loading...</UIText>
                      </div>
                    )}
                    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="p-1 rounded text-red-600 hover:bg-red-50"
                        title="Remove"
                        aria-label="Remove"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                </Fragment>
              ))}
              {dragIndex !== null && dropTargetIndex === images.length && (
                <div
                  className="w-20 h-20 rounded border-2 border-dashed border-gray-400 bg-gray-100 flex-shrink-0"
                  onDragOver={(e) => { e.preventDefault(); setDropTargetIndex(images.length) }}
                  onDrop={handleImageDrop}
                />
              )}
            </div>
          )}
        </div>
      )}

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

      {/* Assigned portfolio: badge or "Assign to" placeholder */}
      {selectedContextId ? (() => {
        const context = effectivePortfolios.find(
          (p) =>
            p.id === selectedContextId &&
            (isProjectPortfolio(p) ||
              isActivityPortfolio(p) ||
              isCommunityPortfolio(p))
        )
        if (!context) return null
        const basic = getPortfolioBasic(context)
        const metadata = context.metadata as {
          basic?: { emoji?: string }
          project_type_specific?: string
        } | undefined
        const emoji = metadata?.basic?.emoji
        const projectType = metadata?.project_type_specific ?? null
        const description = basic.description
        const canClear = !!userSelectedPortfolio && userSelectedPortfolio.id === selectedContextId
        return (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-100">
            <Link
              href={getPortfolioUrl(context.type, context.id)}
              className="flex items-start gap-3 flex-1 min-w-0 overflow-hidden"
            >
              <div className="flex-shrink-0">
                <StickerAvatar
                  src={basic.avatar}
                  alt={basic.name}
                  type={context.type}
                  size={48}
                  emoji={emoji}
                  name={basic.name}
                />
              </div>
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="flex items-baseline gap-2 mb-0.5 min-w-0">
                  <Content className="truncate min-w-0">{basic.name}</Content>
                  {projectType && (
                    <UIButtonText className="text-gray-500 flex-shrink-0">{projectType}</UIButtonText>
                  )}
                </div>
                {description && (
                  <div className="min-w-0 overflow-hidden">
                    <UIText className="text-gray-500 truncate block w-full">{description}</UIText>
                  </div>
                )}
              </div>
            </Link>
            {canClear && (
              <button
                type="button"
                onClick={() => {
                  setUserSelectedPortfolio(null)
                  setSelectedPortfolios([])
                }}
                className="p-1.5 rounded text-gray-500 hover:bg-gray-200 flex-shrink-0"
                title="Remove assignment"
                aria-label="Remove assignment"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )
      })() : (
        <button
          type="button"
          onClick={() => setShowAssignPanel(true)}
          className="flex items-center justify-center gap-2 w-full p-3 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors text-left"
        >
          <Plus className="w-5 h-5 text-gray-500 flex-shrink-0" />
          <UIText as="span" className="font-medium text-gray-700">Assign to</UIText>
        </button>
      )}

      {/* Assign portfolio panel (project or activity) */}
      {showAssignPanel && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowAssignPanel(false)}
        >
          <div
            className="bg-white rounded-xl w-auto mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <Card variant="default" padding="sm">
              <div className="mb-4">
                <UIText>
                  Choose a project, activity, or community to assign this note to
                </UIText>
              </div>
              {assignableLoading ? (
                <div className="py-8 text-center">
                  <UIText className="text-gray-500">Loading...</UIText>
                </div>
              ) : (
                <>
                  {assignableProjects.length > 0 && (
                    <div className="mb-4">
                      <UIText as="p" className="mb-2 font-medium text-gray-700">Projects</UIText>
                      {collaborators.length > 0 && (
                        <UIText as="p" className="mb-2 text-xs text-gray-500">
                          Only projects where all collaborators can post are selectable.
                        </UIText>
                      )}
                      <div className="grid grid-cols-3 gap-x-4 gap-y-6">
                        {assignableProjects.map((project) => {
                          const basic = getPortfolioBasic(project)
                          const metadata = project.metadata as { basic?: { emoji?: string } } | undefined
                          const canSelect = collaborators.length === 0 || portfolioIdsAllCanCreate[project.id] === true
                          return (
                            <button
                              key={project.id}
                              type="button"
                              disabled={!canSelect}
                              onClick={() => {
                                if (!canSelect) return
                                setUserSelectedPortfolio(project)
                                setSelectedPortfolios([project.id])
                                setShowAssignPanel(false)
                              }}
                              className={`flex flex-col items-center gap-2 py-4 px-3 transition-opacity ${
                                canSelect
                                  ? 'hover:opacity-80'
                                  : 'opacity-50 cursor-not-allowed grayscale'
                              }`}
                              title={!canSelect ? 'Not available: not all collaborators can post here' : basic.name}
                            >
                              <StickerAvatar
                                src={basic.avatar}
                                alt={basic.name}
                                type="projects"
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
                  {assignableActivities.length > 0 && (
                    <div className="mb-4">
                      <UIText as="p" className="mb-2 font-medium text-gray-700">Activities</UIText>
                      {collaborators.length > 0 && (
                        <UIText as="p" className="mb-2 text-xs text-gray-500">
                          Only activities where all collaborators can post are selectable.
                        </UIText>
                      )}
                      <div className="grid grid-cols-3 gap-x-4 gap-y-6">
                        {assignableActivities.map((activity) => {
                          const basic = getPortfolioBasic(activity)
                          const metadata = activity.metadata as { basic?: { emoji?: string } } | undefined
                          const canSelect = collaborators.length === 0 || portfolioIdsAllCanCreate[activity.id] === true
                          return (
                            <button
                              key={activity.id}
                              type="button"
                              disabled={!canSelect}
                              onClick={() => {
                                if (!canSelect) return
                                setUserSelectedPortfolio(activity)
                                setSelectedPortfolios([activity.id])
                                setShowAssignPanel(false)
                              }}
                              className={`flex flex-col items-center gap-2 py-4 px-3 transition-opacity ${
                                canSelect
                                  ? 'hover:opacity-80'
                                  : 'opacity-50 cursor-not-allowed grayscale'
                              }`}
                              title={!canSelect ? 'Not available: not all collaborators can post here' : basic.name}
                            >
                              <StickerAvatar
                                src={basic.avatar}
                                alt={basic.name}
                                type="activities"
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
                  {assignableCommunities.length > 0 && (
                    <div className="mb-4">
                      <UIText as="p" className="mb-2 font-medium text-gray-700">
                        Communities
                      </UIText>
                      {collaborators.length > 0 && (
                        <UIText as="p" className="mb-2 text-xs text-gray-500">
                          Only communities where all collaborators can post are selectable.
                        </UIText>
                      )}
                      <div className="grid grid-cols-3 gap-x-4 gap-y-6">
                        {assignableCommunities.map((community) => {
                          const basic = getPortfolioBasic(community)
                          const metadata =
                            (community.metadata as { basic?: { emoji?: string } }) || undefined
                          const canSelect =
                            collaborators.length === 0 ||
                            portfolioIdsAllCanCreate[community.id] === true
                          return (
                            <button
                              key={community.id}
                              type="button"
                              disabled={!canSelect}
                              onClick={() => {
                                if (!canSelect) return
                                setUserSelectedPortfolio(community)
                                setSelectedPortfolios([community.id])
                                setShowAssignPanel(false)
                              }}
                              className={`flex flex-col items-center gap-2 py-4 px-3 transition-opacity ${
                                canSelect
                                  ? 'hover:opacity-80'
                                  : 'opacity-50 cursor-not-allowed grayscale'
                              }`}
                              title={
                                !canSelect
                                  ? 'Not available: not all collaborators can post here'
                                  : basic.name
                              }
                            >
                              <StickerAvatar
                                src={basic.avatar}
                                alt={basic.name}
                                type="community"
                                size={72}
                                emoji={metadata?.basic?.emoji}
                                name={basic.name}
                              />
                              <UIText
                                className="text-center max-w-[96px] truncate"
                                title={basic.name}
                              >
                                {basic.name}
                              </UIText>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {!assignableLoading &&
                    assignableProjects.length === 0 &&
                    assignableActivities.length === 0 &&
                    assignableCommunities.length === 0 && (
                      <UIText className="text-gray-500 py-4">
                        No projects, activities, or communities available.
                      </UIText>
                    )}
                </>
              )}
              <div className="flex justify-end mt-4">
                <Button variant="secondary" onClick={() => setShowAssignPanel(false)}>
                  <UIText>Cancel</UIText>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Pin option - only show if user is owner and there's space */}
      {selectedContextId && pinInfo?.canPin && (
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={shouldPin}
              onChange={(e) => setShouldPin(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
              <UIText as="span">
                Pin to portfolio ({pinInfo.count}/{pinInfo.max} pinned)
              </UIText>
          </label>
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
                {selectedContextId
                  ? (
                      [
                        { value: 'public' as const, label: 'Public' },
                        {
                          value: 'members' as const,
                          label: (() => {
                            const context = effectivePortfolios.find((p) => p.id === selectedContextId)
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
                {selectedContextId
                  ? 'Members-only notes are only visible to members of the assigned portfolio.'
                  : 'Friends-only notes are only visible to your friends. Private notes are only visible to you.'}
              </UIText>
            </div>

            {/* Collection selection - only show if a context portfolio is selected (hidden for open call) */}
            {!isOpenCall && selectedContextId && (
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
          <UIText>{isSubmitting ? 'Creating...' : isOpenCall ? 'Create Open call' : 'Create Note'}</UIText>
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
