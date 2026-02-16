'use client'

import { useState, useRef, useEffect, Fragment } from 'react'
import { createAnnotation } from '@/app/notes/actions'
import { UIText, Button, Content } from '@/components/ui'
import { ensureBrowserCompatibleImage } from '@/lib/utils/heic-converter'
import { getHostnameFromUrl, getFaviconUrl } from '@/lib/notes/url-helpers'
import { Image as ImageIcon, Link2 } from 'lucide-react'

interface AnnotationComposerProps {
  parentNoteId: string
  parentAnnotationId?: string
  replyToName?: string
  /** One-line preview of the comment being replied to (mobile only). Shown as: Reply to [name]'s "[preview]". */
  replyToCommentPreview?: string
  onSuccess: () => void
  onCancel?: () => void
  disabled?: boolean
  isMobile?: boolean
  /** When disabled, used to show "log in" vs "no permission" message. */
  currentUserId?: string | null
  /** When true (desktop), do not add own border/bg so parent Card provides the same look as note/comment section. */
  embedInCard?: boolean
}

type ReferenceType = 'none' | 'image' | 'url'

export function AnnotationComposer({
  parentNoteId,
  parentAnnotationId,
  replyToName,
  replyToCommentPreview,
  onSuccess,
  onCancel,
  disabled = false,
  isMobile = false,
  currentUserId: currentUserIdProp,
  embedInCard = false,
}: AnnotationComposerProps) {
  const [text, setText] = useState('')
  const [referenceType, setReferenceType] = useState<ReferenceType>('none')
  const [urlInput, setUrlInput] = useState('')
  const [confirmedUrl, setConfirmedUrl] = useState<string | null>(null)
  const [images, setImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCompressing, setIsCompressing] = useState(false)
  const [compressionProgress, setCompressionProgress] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  /** Mobile only: collapsed (placeholder) vs activated (full bar). */
  const [mobileActivated, setMobileActivated] = useState(false)

  // Mobile: when user taps Reply, parent sets replyToName/parentAnnotationId → expand to activated
  useEffect(() => {
    if (isMobile && (parentAnnotationId || replyToName)) {
      setMobileActivated(true)
    }
  }, [isMobile, parentAnnotationId, replyToName])

  // Focus textarea on mount (desktop only)
  useEffect(() => {
    if (!isMobile && textareaRef.current && !disabled) {
      textareaRef.current.focus()
    }
  }, [isMobile, disabled])

  // Auto-grow textarea height (one line min, grow with content)
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.overflow = 'hidden'
    const lineHeight = 24
    const maxHeight = 200
    const h = Math.min(Math.max(el.scrollHeight, lineHeight), maxHeight)
    el.style.height = `${h}px`
    el.style.overflow = h >= maxHeight ? 'auto' : 'hidden'
  }, [text])

  // Compress image function (reused from CreateNoteForm)
  const compressImage = async (
    file: File,
    maxWidth: number = 1920,
    maxHeight: number = 1920,
    quality: number = 0.85
  ): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
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

          ctx.drawImage(img, 0, 0, width, height)

          const isPng = file.type === 'image/png'
          const outputFormat = isPng ? 'image/png' : 'image/jpeg'

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'))
                return
              }

              const compressedFile = new File(
                [blob],
                file.name.replace(/\.[^.]+$/, isPng ? '.png' : '.jpg'),
                {
                  type: outputFormat,
                  lastModified: Date.now(),
                }
              )

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

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
    const oversizedFiles = files.filter(file => file.size > MAX_FILE_SIZE)
    
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map(f => f.name).join(', ')
      setError(`The following images are too large (max 50MB): ${fileNames}`)
      if (e.target) {
        e.target.value = ''
      }
      return
    }
    
    setIsCompressing(true)
    setCompressionProgress(0)
    setError(null)
    
    try {
      const compressedFiles: File[] = []
      const totalFiles = files.length
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setCompressionProgress(((i + 0.5) / totalFiles) * 100)
        
        try {
          const compatibleFile = await ensureBrowserCompatibleImage(file)
          setCompressionProgress(((i + 1) / totalFiles) * 100)
          const compressedFile = await compressImage(compatibleFile, 1920, 1920, 0.85)
          compressedFiles.push(compressedFile)
        } catch (error) {
          console.error(`Failed to process ${file.name}:`, error)
          compressedFiles.push(file)
        }
      }
      
      setImages((prev) => [...prev, ...compressedFiles])
      
      // Create previews
      const previewPromises = compressedFiles.map((file) => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target?.result as string)
          reader.onerror = () => resolve('')
          reader.readAsDataURL(file)
        })
      })
      
      const previews = await Promise.all(previewPromises)
      setImagePreviews((prev) => [...prev, ...previews.filter(Boolean)])
    } catch (error: any) {
      console.error('Error compressing images:', error)
      setError(`Failed to compress images: ${error.message || 'Unknown error'}`)
      if (e.target) {
        e.target.value = ''
      }
    } finally {
      setIsCompressing(false)
      setCompressionProgress(0)
    }
  }

  const removeImage = (index: number) => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (disabled || isSubmitting || !text.trim()) return

    setError(null)
    setIsSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('text', text.trim())

      if (referenceType === 'url' && confirmedUrl) {
        formData.append('url', confirmedUrl)
      }

      if (referenceType === 'image') {
        images.forEach((image, index) => {
          formData.append(`image_${index}`, image)
        })
      }

      // Use parentAnnotationId if replying to annotation, otherwise use parentNoteId
      const targetId = parentAnnotationId || parentNoteId
      const result = await createAnnotation(targetId, formData)

      if (result.success) {
        setText('')
        setUrlInput('')
        setConfirmedUrl(null)
        setImages([])
        setImagePreviews([])
        setReferenceType('none')
        if (isMobile) setMobileActivated(false)
        onSuccess()
      } else {
        setError(result.error || 'Failed to create annotation')
      }
    } catch (err: any) {
      console.error('Error in handleSubmit:', err)
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const containerClasses = isMobile
    ? 'fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 pb-20 z-50'
    : embedInCard
      ? ''
      : 'rounded-lg border border-gray-200 bg-white p-4'

  if (disabled) {
    const message = currentUserIdProp
      ? 'You don\'t have permission to comment on this note.'
      : 'Please log in to comment'
    return (
      <div className={containerClasses}>
        <Content className="text-gray-500 text-center py-4">
          {message}
        </Content>
      </div>
    )
  }

  // Mobile collapsed: short bar with placeholder only; tap to expand
  if (isMobile && !mobileActivated) {
    return (
      <button
        type="button"
        onClick={() => setMobileActivated(true)}
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 pb-20 z-50 text-left"
      >
        <span className="text-gray-400 text-base">Write a comment...</span>
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className={containerClasses}>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          <UIText>{error}</UIText>
        </div>
      )}

      {replyToName && (
        <div className="mb-2">
          <UIText className="text-gray-600">
            {isMobile && replyToCommentPreview
              ? `Reply to ${replyToName}'s "${replyToCommentPreview}"`
              : `Reply to ${replyToName}:`}
          </UIText>
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a comment..."
        required
        rows={1}
        className="w-full min-h-[24px] px-0 py-2 bg-transparent focus:outline-none resize-none placeholder:text-gray-400 overflow-hidden"
        disabled={isSubmitting}
      />

      {/* Reference: Image and URL icon buttons (selected = darker) */}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          title="Add image"
          aria-label="Add image"
          disabled={isSubmitting}
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
          disabled={isSubmitting}
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
        <div className="mt-2">
          {!confirmedUrl ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                placeholder="example.com or https://example.com"
                disabled={isSubmitting}
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => urlInput.trim() && setConfirmedUrl(normalizeUrlForPreview(urlInput))}
                disabled={isSubmitting || !urlInput.trim()}
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
        <div className="mt-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,.heic,.heif,image/*"
            multiple
            onChange={handleImageSelect}
            disabled={isCompressing || isSubmitting}
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isCompressing || isSubmitting}
          >
            <UIText>{isCompressing ? `Compressing... ${Math.round(compressionProgress)}%` : 'Add Images'}</UIText>
          </Button>
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

      {/* Actions */}
      <div className="mt-4 flex gap-2 justify-end">
        {(onCancel || isMobile) && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              if (isMobile) setMobileActivated(false)
              onCancel?.()
            }}
            disabled={isSubmitting}
          >
            <UIText>Cancel</UIText>
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting || !text.trim()}
        >
          <UIText>{isSubmitting ? 'Posting...' : 'Post'}</UIText>
        </Button>
      </div>
    </form>
  )
}
