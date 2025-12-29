'use client'

import { useState, useRef } from 'react'
import { createNote } from '@/app/notes/actions'
import { Portfolio } from '@/types/portfolio'
import { useRouter } from 'next/navigation'
import { getPortfolioBasic } from '@/lib/portfolio/utils'

interface CreateNoteFormProps {
  portfolios: Portfolio[]
  defaultPortfolioIds?: string[]
  humanPortfolioId?: string
  mentionedNoteId?: string
  redirectUrl?: string
  onSuccess?: () => void
  onCancel?: () => void
}

type ReferenceType = 'none' | 'image' | 'url'

export function CreateNoteForm({
  portfolios,
  defaultPortfolioIds = [],
  humanPortfolioId,
  mentionedNoteId,
  redirectUrl,
  onSuccess,
  onCancel,
}: CreateNoteFormProps) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [referenceType, setReferenceType] = useState<ReferenceType>('none')
  const [url, setUrl] = useState('')
  const [selectedPortfolios, setSelectedPortfolios] = useState<string[]>(defaultPortfolioIds)
  const [images, setImages] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Filter out human portfolio from displayed portfolios
  const displayablePortfolios = portfolios.filter((p) => p.id !== humanPortfolioId)

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setImages((prev) => [...prev, ...files])
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const removePortfolio = (portfolioId: string) => {
    // Don't allow removing human portfolio
    if (portfolioId === humanPortfolioId) {
      return
    }
    setSelectedPortfolios((prev) => prev.filter((id) => id !== portfolioId))
  }

  const getPortfolioName = (portfolio: Portfolio): string => {
    const basic = getPortfolioBasic(portfolio)
    return basic.name || portfolio.slug
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('text', text.trim())
      
      // Handle reference based on type
      if (referenceType === 'url' && url.trim()) {
        formData.append('url', url.trim())
      }
      
      if (referenceType === 'image') {
        // Add image files
        images.forEach((image, index) => {
          formData.append(`image_${index}`, image)
        })
      }
      
      // Always include human portfolio in assigned portfolios
      const finalPortfolioIds = [...selectedPortfolios]
      if (humanPortfolioId && !finalPortfolioIds.includes(humanPortfolioId)) {
        finalPortfolioIds.push(humanPortfolioId)
      }
      
      if (finalPortfolioIds.length > 0) {
        formData.append('assigned_portfolios', JSON.stringify(finalPortfolioIds))
      }
      
      if (mentionedNoteId) {
        formData.append('mentioned_note_id', mentionedNoteId)
      }

      const result = await createNote(formData)

      if (result.success) {
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
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Reference Type Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Reference Type
        </label>
        <div className="flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="referenceType"
              value="none"
              checked={referenceType === 'none'}
              onChange={(e) => setReferenceType(e.target.value as ReferenceType)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">No Reference</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="referenceType"
              value="image"
              checked={referenceType === 'image'}
              onChange={(e) => setReferenceType(e.target.value as ReferenceType)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">Image</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="referenceType"
              value="url"
              checked={referenceType === 'url'}
              onChange={(e) => setReferenceType(e.target.value as ReferenceType)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">URL</span>
          </label>
        </div>
      </div>

      {/* Text input */}
      <div>
        <label htmlFor="text" className="block text-sm font-medium text-gray-700 mb-1">
          Note Text <span className="text-red-500">*</span>
        </label>
        <textarea
          id="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          placeholder="Write your note..."
        />
      </div>

      {/* URL input - only show when URL reference type selected */}
      {referenceType === 'url' && (
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
            URL Reference
          </label>
          <input
            type="text"
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="example.com or https://example.com"
          />
        </div>
      )}

      {/* Image upload - only show when Image reference type selected */}
      {referenceType === 'image' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Images
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            Add Images
          </button>
          {images.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {images.map((image, index) => (
                <div key={index} className="relative">
                  <img
                    src={URL.createObjectURL(image)}
                    alt={`Preview ${index + 1}`}
                    className="w-20 h-20 object-cover rounded"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Portfolio assignment - show as removable chips (excluding human portfolio) */}
      {displayablePortfolios.length > 0 && selectedPortfolios.some((id) => id !== humanPortfolioId) && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Assigned to Portfolios
          </label>
          <div className="flex flex-wrap gap-2">
            {selectedPortfolios
              .filter((portfolioId) => portfolioId !== humanPortfolioId)
              .map((portfolioId) => {
                const portfolio = portfolios.find((p) => p.id === portfolioId)
                if (!portfolio) return null
                return (
                  <span
                    key={portfolioId}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                  >
                    {getPortfolioName(portfolio)}
                    <button
                      type="button"
                      onClick={() => removePortfolio(portfolioId)}
                      className="text-blue-600 hover:text-blue-800 font-bold"
                    >
                      ×
                    </button>
                  </span>
                )
              })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting || !text.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Creating...' : 'Create Note'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
