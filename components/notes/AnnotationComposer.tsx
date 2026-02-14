'use client'

import { useState, useRef, useEffect } from 'react'
import { createAnnotation } from '@/app/notes/actions'
import { UIText, Button, Content } from '@/components/ui'
import { ensureBrowserCompatibleImage } from '@/lib/utils/heic-converter'

interface AnnotationComposerProps {
  parentNoteId: string
  parentAnnotationId?: string
  replyToName?: string
  onSuccess: () => void
  onCancel?: () => void
  disabled?: boolean
  isMobile?: boolean
}

type ReferenceType = 'none' | 'image' | 'url'

export function AnnotationComposer({
  parentNoteId,
  parentAnnotationId,
  replyToName,
  onSuccess,
  onCancel,
  disabled = false,
  isMobile = false,
}: AnnotationComposerProps) {
  const [text, setText] = useState('')
  const [referenceType, setReferenceType] = useState<ReferenceType>('none')
  const [url, setUrl] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCompressing, setIsCompressing] = useState(false)
  const [compressionProgress, setCompressionProgress] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea on mount (desktop only)
  useEffect(() => {
    if (!isMobile && textareaRef.current && !disabled) {
      textareaRef.current.focus()
    }
  }, [isMobile, disabled])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (disabled || isSubmitting || !text.trim()) return

    setError(null)
    setIsSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('text', text.trim())

      if (referenceType === 'url' && url.trim()) {
        formData.append('url', url.trim())
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
        setUrl('')
        setImages([])
        setImagePreviews([])
        setReferenceType('none')
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
    ? 'fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50'
    : 'rounded-lg border border-gray-200 bg-white p-4'

  if (disabled) {
    return (
      <div className={containerClasses}>
        <Content className="text-gray-500 text-center py-4">
          Please log in to comment
        </Content>
      </div>
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
          <UIText className="text-gray-600">Reply to {replyToName}:</UIText>
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a comment..."
        required
        rows={isMobile ? 3 : 4}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 resize-none"
        disabled={isSubmitting}
      />

      {/* Reference Type Selection */}
      <div className="mt-2 flex gap-4 text-sm">
        <label className="flex items-center">
          <input
            type="radio"
            name="referenceType"
            value="none"
            checked={referenceType === 'none'}
            onChange={(e) => setReferenceType(e.target.value as ReferenceType)}
            className="mr-2"
            disabled={isSubmitting}
          />
          <UIText>No Reference</UIText>
        </label>
        <label className="flex items-center">
          <input
            type="radio"
            name="referenceType"
            value="image"
            checked={referenceType === 'image'}
            onChange={(e) => setReferenceType(e.target.value as ReferenceType)}
            className="mr-2"
            disabled={isSubmitting}
          />
          <UIText>Image</UIText>
        </label>
        <label className="flex items-center">
          <input
            type="radio"
            name="referenceType"
            value="url"
            checked={referenceType === 'url'}
            onChange={(e) => setReferenceType(e.target.value as ReferenceType)}
            className="mr-2"
            disabled={isSubmitting}
          />
          <UIText>URL</UIText>
        </label>
      </div>

      {/* URL input */}
      {referenceType === 'url' && (
        <div className="mt-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="example.com or https://example.com"
            disabled={isSubmitting}
          />
        </div>
      )}

      {/* Image upload */}
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
            <div className="mt-2 flex flex-wrap gap-2">
              {images.map((image, index) => (
                <div key={index} className="relative">
                  {imagePreviews[index] ? (
                    <img
                      src={imagePreviews[index]}
                      alt={`Preview ${index + 1}`}
                      className="w-20 h-20 object-cover rounded"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-gray-200 rounded flex items-center justify-center">
                      <UIText className="text-xs text-gray-500">Loading...</UIText>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => removeImage(index)}
                    className="absolute top-0 right-0 w-5 h-5 min-w-0 p-0 rounded-full"
                  >
                    <UIText className="text-xs">×</UIText>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex gap-2 justify-end">
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
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
