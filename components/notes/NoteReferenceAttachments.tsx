'use client'

import {
  forwardRef,
  Fragment,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { Image as ImageIcon, Link2 } from 'lucide-react'
import { Button, UIText } from '@/components/ui'
import { getHostnameFromUrl, getFaviconUrl } from '@/lib/notes/url-helpers'
import { ensureBrowserCompatibleImage } from '@/lib/utils/heic-converter'
import { compressImage, createThumbnail } from '@/lib/notes/client-note-image-processing'

type ReferenceType = 'none' | 'image' | 'url'

export type NoteReferenceAttachmentsHandle = {
  appendToFormData: (formData: FormData) => void
  reset: () => void
}

export type NoteReferenceAttachmentsProps = {
  /** When true, blocks add/confirm/remove while parent is submitting (optional; create form omits this). */
  disabled?: boolean
  setError: Dispatch<SetStateAction<string | null>>
}

export const NoteReferenceAttachments = forwardRef<
  NoteReferenceAttachmentsHandle,
  NoteReferenceAttachmentsProps
>(function NoteReferenceAttachments({ disabled = false, setError }, ref) {
  const [referenceType, setReferenceType] = useState<ReferenceType>('none')
  const [urlInput, setUrlInput] = useState('')
  const [confirmedUrl, setConfirmedUrl] = useState<string | null>(null)
  const [images, setImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [isCompressing, setIsCompressing] = useState(false)
  const [compressionProgress, setCompressionProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const normalizeUrlForPreview = (raw: string): string => {
    const t = raw.trim()
    return t.match(/^https?:\/\//i) ? t : `https://${t}`
  }

  useImperativeHandle(
    ref,
    () => ({
      appendToFormData(formData: FormData) {
        if (referenceType === 'url' && confirmedUrl) {
          formData.append('url', confirmedUrl)
        }
        if (referenceType === 'image') {
          images.forEach((image, index) => {
            formData.append(`image_${index}`, image)
          })
        }
      },
      reset() {
        setReferenceType('none')
        setUrlInput('')
        setConfirmedUrl(null)
        setImages([])
        setImagePreviews((prev) => {
          prev.forEach((url) => URL.revokeObjectURL(url))
          return []
        })
        setDragIndex(null)
        setDropTargetIndex(null)
        setIsCompressing(false)
        setCompressionProgress(0)
      },
    }),
    [referenceType, confirmedUrl, images]
  )

  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [imagePreviews])

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])

    const MAX_FILE_SIZE = 50 * 1024 * 1024
    const oversizedFiles = files.filter((file) => file.size > MAX_FILE_SIZE)

    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map((f) => f.name).join(', ')
      setError(`The following images are too large (max 50MB): ${fileNames}. Please compress them before uploading.`)
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
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          if (errorMessage.includes('HEIC') || errorMessage.includes('convert')) {
            setError(`Failed to convert HEIC image "${file.name}": ${errorMessage}`)
            if (e.target) {
              e.target.value = ''
            }
            setIsCompressing(false)
            setCompressionProgress(0)
            return
          }
          compressedFiles.push(file)
        }
      }

      setImages((prev) => [...prev, ...compressedFiles])

      const createThumbnails = async () => {
        const thumbnailPromises = compressedFiles.map((file) => createThumbnail(file))
        try {
          const thumbnails = await Promise.all(thumbnailPromises)
          setImagePreviews((prev) => [...prev, ...thumbnails])
        } catch (error) {
          console.error('Error creating thumbnails:', error)
          const fallbackUrls = compressedFiles.map((file) => URL.createObjectURL(file))
          setImagePreviews((prev) => [...prev, ...fallbackUrls])
        }
      }

      if ('requestIdleCallback' in window) {
        ;(window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(
          () => {
            void createThumbnails()
          },
          { timeout: 2000 }
        )
      } else {
        setTimeout(() => {
          void createThumbnails()
        }, 0)
      }
    } catch (error: unknown) {
      console.error('Error compressing images:', error)
      setError(`Failed to compress images: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

  const imageControlsDisabled = isCompressing || disabled

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Add image"
          aria-label="Add image"
          onClick={() => setReferenceType(referenceType === 'image' ? 'none' : 'image')}
          className={`rounded-md p-2 transition-colors ${
            referenceType === 'image'
              ? 'bg-gray-300 text-gray-800 hover:bg-gray-400'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}
        >
          <ImageIcon className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          title="Add URL"
          aria-label="Add URL"
          onClick={() => {
            setReferenceType(referenceType === 'url' ? 'none' : 'url')
            if (referenceType === 'url') setConfirmedUrl(null)
          }}
          className={`rounded-md p-2 transition-colors ${
            referenceType === 'url'
              ? 'bg-gray-300 text-gray-800 hover:bg-gray-400'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}
        >
          <Link2 className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      {referenceType === 'url' && (
        <div>
          {!confirmedUrl ? (
            <div className="flex gap-2">
              <input
                type="text"
                id="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
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
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
              <img
                src={getFaviconUrl(getHostnameFromUrl(confirmedUrl))}
                alt=""
                className="h-5 w-5 rounded"
                onError={(ev) => {
                  ;(ev.target as HTMLImageElement).src = `https://www.google.com/s2/favicons?domain=${getHostnameFromUrl(confirmedUrl)}&sz=64`
                }}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                {getHostnameFromUrl(confirmedUrl)}
              </span>
              <button
                type="button"
                onClick={() => setConfirmedUrl(null)}
                className="rounded p-1 text-red-600 hover:bg-red-50"
                title="Remove URL"
                aria-label="Remove URL"
              >
                <UIText className="text-xs">Delete</UIText>
              </button>
            </div>
          )}
        </div>
      )}

      {referenceType === 'image' && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,.heic,.heif,image/*"
            multiple
            onChange={handleImageSelect}
            disabled={imageControlsDisabled}
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={imageControlsDisabled}
          >
            <UIText>
              {isCompressing ? `Compressing... ${Math.round(compressionProgress)}%` : 'Add Images'}
            </UIText>
          </Button>
          {isCompressing && (
            <div className="mt-2">
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${compressionProgress}%` }}
                />
              </div>
            </div>
          )}
          {images.length > 0 && (
            <div className="mt-2 flex flex-wrap items-start gap-2">
              {images.map((_image, index) => (
                <Fragment key={index}>
                  {dragIndex !== null && dropTargetIndex === index && (
                    <div
                      className="h-20 w-20 flex-shrink-0 rounded border-2 border-dashed border-gray-400 bg-gray-100"
                      onDragOver={(ev) => {
                        ev.preventDefault()
                        setDropTargetIndex(index)
                      }}
                      onDrop={handleImageDrop}
                    />
                  )}
                  <div
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(ev) => {
                      ev.preventDefault()
                      setDropTargetIndex(index)
                    }}
                    onDrop={handleImageDrop}
                    onDragEnd={() => {
                      setDragIndex(null)
                      setDropTargetIndex(null)
                    }}
                    className={`relative flex flex-shrink-0 cursor-grab flex-col items-center gap-1 active:cursor-grabbing ${
                      dragIndex === index ? 'opacity-50' : ''
                    }`}
                  >
                    {imagePreviews[index] ? (
                      <img
                        src={imagePreviews[index]}
                        alt={`Preview ${index + 1}`}
                        className="pointer-events-none h-20 w-20 rounded object-cover"
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded bg-gray-200">
                        <UIText className="text-xs text-gray-500">Loading...</UIText>
                      </div>
                    )}
                    <div className="flex items-center gap-0.5" onClick={(ev) => ev.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                        title="Remove"
                        aria-label="Remove"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </Fragment>
              ))}
              {dragIndex !== null && dropTargetIndex === images.length && (
                <div
                  className="h-20 w-20 flex-shrink-0 rounded border-2 border-dashed border-gray-400 bg-gray-100"
                  onDragOver={(ev) => {
                    ev.preventDefault()
                    setDropTargetIndex(images.length)
                  }}
                  onDrop={handleImageDrop}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
