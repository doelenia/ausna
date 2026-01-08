'use client'

import { useState, useRef, useEffect } from 'react'
import { createNote } from '@/app/notes/actions'
import { Portfolio, isProjectPortfolio } from '@/types/portfolio'
import { useRouter } from 'next/navigation'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { UIText, Button } from '@/components/ui'

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
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([])
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([])
  const [newCollectionName, setNewCollectionName] = useState('')
  const [isCreatingCollection, setIsCreatingCollection] = useState(false)
  const [loadingCollections, setLoadingCollections] = useState(false)

  // Filter to only show project portfolios (exclude human and community)
  const displayablePortfolios = portfolios.filter((p) => isProjectPortfolio(p))

  // Get the selected project portfolio ID
  const selectedProjectId = selectedPortfolios.find((id) => {
    const portfolio = portfolios.find((p) => p.id === id)
    return portfolio && isProjectPortfolio(portfolio)
  })

  // Fetch collections for the selected project
  useEffect(() => {
    const fetchCollections = async () => {
      if (!selectedProjectId) {
        setCollections([])
        return
      }

      setLoadingCollections(true)
      try {
        const response = await fetch(`/api/collections?portfolio_id=${selectedProjectId}`)
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
  }, [selectedProjectId])

  // Reset selected collections when project changes
  useEffect(() => {
    setSelectedCollectionIds([])
  }, [selectedProjectId])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setImages((prev) => [...prev, ...files])
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

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
    if (!newCollectionName.trim() || !selectedProjectId) return

    setIsCreatingCollection(true)
    try {
      const response = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio_id: selectedProjectId,
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
      
      // Only allow project portfolios - filter out any non-project portfolios
      const projectPortfolios = selectedPortfolios.filter((id) => {
        const portfolio = portfolios.find((p) => p.id === id)
        return portfolio && isProjectPortfolio(portfolio)
      })
      
      // Must have exactly one project assigned
      if (projectPortfolios.length !== 1) {
        setError('Note must be assigned to exactly one project')
        setIsSubmitting(false)
        return
      }
      
      formData.append('assigned_portfolios', JSON.stringify(projectPortfolios))
      
      if (mentionedNoteId) {
        formData.append('mentioned_note_id', mentionedNoteId)
      }

      if (selectedCollectionIds.length > 0) {
        formData.append('collection_ids', JSON.stringify(selectedCollectionIds))
      }

      const result = await createNote(formData)

      // Guard against undefined result
      if (!result) {
        console.error('createNote returned undefined')
        setError('An unexpected error occurred. Please try again.')
        return
      }

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
      console.error('Error in handleSubmit:', err)
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            <UIText>Add Images</UIText>
          </Button>
          {images.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {images.map((image, index) => (
                <div key={index} className="relative">
                  <img
                    src={URL.createObjectURL(image)}
                    alt={`Preview ${index + 1}`}
                    className="w-20 h-20 object-cover rounded"
                  />
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

      {/* Portfolio assignment - show assigned project (cannot be removed) */}
      {selectedPortfolios.length > 0 && (
        <div>
          <UIText as="label" className="block mb-2">
            Assigned to Project <span className="text-red-500">*</span>
          </UIText>
          <div className="flex flex-wrap gap-2">
            {selectedPortfolios
              .filter((portfolioId) => {
                const portfolio = portfolios.find((p) => p.id === portfolioId)
                return portfolio && isProjectPortfolio(portfolio)
              })
              .map((portfolioId) => {
                const portfolio = portfolios.find((p) => p.id === portfolioId)
                if (!portfolio) return null
                return (
                  <span
                    key={portfolioId}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                  >
                    {getPortfolioName(portfolio)}
                    {/* Disable removal - note must be assigned to exactly one project */}
                  </span>
                )
              })}
          </div>
          {selectedPortfolios.length === 0 && (
            <UIText as="p" className="text-red-600 mt-1">A project must be assigned to create a note</UIText>
          )}
        </div>
      )}

      {/* Collection selection - only show if a project is selected */}
      {selectedProjectId && (
        <div>
          <UIText as="label" className="block mb-2">
            Collections (optional)
          </UIText>
          
          {/* Existing collections */}
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

          {/* Create new collection */}
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

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting || !text.trim()}
        >
          <UIText>{isSubmitting ? 'Creating...' : 'Create Note'}</UIText>
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
