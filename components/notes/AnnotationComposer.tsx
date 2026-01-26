'use client'

import { useState, useRef } from 'react'
import { createAnnotation } from '@/app/notes/actions'
import { UIText, Button } from '@/components/ui'
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
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setError(null)
    const previews: string[] = []

    for (const file of files) {
      try {
        const convertedFile = await ensureBrowserCompatibleImage(file)
        previews.push(URL.createObjectURL(convertedFile))
        setImages((prev) => [...prev, convertedFile])
      } catch (err) {
        console.error('Error converting image:', err)
        setError('Failed to process image')
      }
    }

    setImagePreviews((prev) => [...prev, ...previews])
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
    setImagePreviews((prev) => {
      const newPreviews = [...prev]
      URL.revokeObjectURL(newPreviews[index])
      return newPreviews.filter((_, i) => i !== index)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!text.trim() && images.length === 0) {
      setError('Please enter some text or add an image')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('text', text.trim())
      formData.append('mentioned_note_id', parentNoteId)
      
      if (parentAnnotationId) {
        formData.append('parent_note_id', parentAnnotationId)
      }

      if (referenceType === 'url' && url.trim()) {
        formData.append('reference_url', url.trim())
      }

      images.forEach((image) => {
        formData.append('images', image)
      })

      const result = await createAnnotation(parentNoteId, formData)

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
    } catch (err) {
      console.error('Error creating annotation:', err)
      setError('Failed to create annotation')
    } finally {
      setIsSubmitting(false)
    }
  }

  const containerClass = isMobile
    ? 'fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50'
    : 'space-y-3'

  return (
    <form onSubmit={handleSubmit} className={containerClass}>
      {replyToName && (
        <UIText className="text-gray-500 text-sm mb-2">
          Reply to {replyToName}:
        </UIText>
      )}
      
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a comment..."
        disabled={disabled || isSubmitting}
        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        rows={3}
      />

      {imagePreviews.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {imagePreviews.map((preview, index) => (
            <div key={index} className="relative">
              <img
                src={preview}
                alt={`Preview ${index + 1}`}
                className="w-20 h-20 object-cover rounded border border-gray-300"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                style={{ background: 'none', border: 'none', padding: 0 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isSubmitting}
          className="text-gray-600 hover:text-gray-900 text-sm"
          style={{ background: 'none', border: 'none', padding: 0 }}
        >
          <UIText>Add image</UIText>
        </button>
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageSelect}
          className="hidden"
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReferenceType(referenceType === 'url' ? 'none' : 'url')}
            disabled={disabled || isSubmitting}
            className={`text-sm ${
              referenceType === 'url' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
            }`}
            style={{ background: 'none', border: 'none', padding: 0 }}
          >
            <UIText>Add URL</UIText>
          </button>
        </div>
      </div>

      {referenceType === 'url' && (
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          disabled={disabled || isSubmitting}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      {error && (
        <UIText className="text-red-600 text-sm">{error}</UIText>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={disabled || isSubmitting || (!text.trim() && images.length === 0)}
        >
          <UIText>{isSubmitting ? 'Posting...' : 'Post'}</UIText>
        </Button>
        
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={disabled || isSubmitting}
          >
            <UIText>Cancel</UIText>
          </Button>
        )}
      </div>
    </form>
  )
}
