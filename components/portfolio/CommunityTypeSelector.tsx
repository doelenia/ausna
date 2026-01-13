'use client'

import { useState, useEffect } from 'react'
import { UIText, Button } from '@/components/ui'

interface CommunityTypeSelectorProps {
  generalCategory?: string
  specificType?: string
  onSelect: (general: string, specific: string) => void
  disabled?: boolean
}

// Community type categories and their specific types (all ≤2 words)
const COMMUNITY_TYPE_CATEGORIES: Record<string, string[]> = {
  'Social & Connection': [
    'Social Club',
    'Friend Group',
    'Interest Group',
    'Hobby Club',
    'Support Group',
    'Discussion Group',
    'Book Club',
    'Gaming Group',
    'Fitness Group',
    'Parenting Group',
  ],
  'Professional & Career': [
    'Professional Network',
    'Industry Group',
    'Career Community',
    'Mentorship Group',
    'Freelancer Collective',
    'Entrepreneur Circle',
    'Skill Exchange',
    'Job Network',
  ],
  'Learning & Education': [
    'Study Group',
    'Learning Circle',
    'Course Community',
    'Workshop Group',
    'Language Exchange',
    'Skill Sharing',
    'Book Discussion',
    'Research Group',
    'Peer Learning',
  ],
  'Creative & Arts': [
    'Art Collective',
    'Writing Group',
    'Music Community',
    'Film Club',
    'Photography Group',
    'Craft Circle',
    'Design Community',
    'Theater Group',
    'Dance Community',
  ],
  'Local & Regional': [
    'Local Community',
    'Neighborhood Group',
    'City Network',
    'Regional Hub',
    'Local Meetup',
    'Community Center',
    'Town Square',
    'Local Exchange',
  ],
  'Online & Digital': [
    'Online Forum',
    'Discord Server',
    'Virtual Community',
    'Digital Space',
    'Online Hub',
    'Virtual Meetup',
    'Digital Collective',
  ],
  'Activism & Change': [
    'Activist Group',
    'Advocacy Network',
    'Social Movement',
    'Change Initiative',
    'Civic Group',
    'Policy Network',
    'Climate Action',
    'Social Justice',
  ],
  'Wellness & Health': [
    'Wellness Group',
    'Health Community',
    'Mental Health',
    'Fitness Community',
    'Recovery Group',
    'Meditation Group',
    'Yoga Community',
    'Self Care',
  ],
  'Spiritual & Religious': [
    'Spiritual Community',
    'Religious Group',
    'Faith Community',
    'Meditation Circle',
    'Prayer Group',
    'Study Circle',
  ],
  'Economic & Mutual Aid': [
    'Mutual Aid',
    'Cooperative',
    'Resource Sharing',
    'Time Bank',
    'Skill Exchange',
    'Community Fund',
    'Local Economy',
  ],
  'Cultural & Identity': [
    'Cultural Center',
    'Heritage Group',
    'Identity Community',
    'Ethnic Group',
    'Cultural Exchange',
    'Diaspora Community',
  ],
  'Others': [], // Empty array - will require custom input
}

const GENERAL_CATEGORIES = Object.keys(COMMUNITY_TYPE_CATEGORIES)

function validateTwoWords(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  const words = trimmed.split(/\s+/)
  return words.length <= 2
}

export function CommunityTypeSelector({
  generalCategory,
  specificType,
  onSelect,
  disabled = false,
}: CommunityTypeSelectorProps) {
  const [selectedGeneral, setSelectedGeneral] = useState<string>(generalCategory || '')
  const [selectedSpecific, setSelectedSpecific] = useState<string>(specificType || '')
  const [customType, setCustomType] = useState<string>('')
  const [useCustom, setUseCustom] = useState<boolean>(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    if (generalCategory) {
      setSelectedGeneral(generalCategory)
    }
    if (specificType) {
      setSelectedSpecific(specificType)
      // Check if specific type is in the list for the general category
      const types = COMMUNITY_TYPE_CATEGORIES[generalCategory || ''] || []
      if (!types.includes(specificType)) {
        setCustomType(specificType)
        setUseCustom(true)
      }
    }
  }, [generalCategory, specificType])

  const handleGeneralSelect = (category: string) => {
    setSelectedGeneral(category)
    setSelectedSpecific('')
    setCustomType('')
    // If "Others" is selected, automatically use custom input (no predefined types)
    setUseCustom(category === 'Others')
    setError('')
  }

  const handleSpecificSelect = (type: string) => {
    setSelectedSpecific(type)
    setCustomType('')
    setUseCustom(false)
    setError('')
    if (selectedGeneral) {
      onSelect(selectedGeneral, type)
    }
  }

  const handleCustomInput = (value: string) => {
    setCustomType(value)
    setSelectedSpecific('')
    setError('')
    
    if (value.trim()) {
      if (!validateTwoWords(value)) {
        setError('Must be 2 words or less')
        return
      }
      if (selectedGeneral) {
        onSelect(selectedGeneral, value.trim())
      }
    }
  }

  const handleUseCustomToggle = () => {
    setUseCustom(!useCustom)
    setSelectedSpecific('')
    setCustomType('')
    setError('')
  }

  const availableTypes = selectedGeneral ? COMMUNITY_TYPE_CATEGORIES[selectedGeneral] || [] : []

  return (
    <div className="space-y-4">
      {/* General Category Selection */}
      <div>
        <UIText as="label" className="block mb-2">
          General Category <span className="text-red-500">*</span>
        </UIText>
        <select
          value={selectedGeneral}
          onChange={(e) => handleGeneralSelect(e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
        >
          <option value="">-- Select a category --</option>
          {GENERAL_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      {/* Specific Type Selection */}
      {selectedGeneral && (
        <div>
          <UIText as="label" className="block mb-2">
            Specific Type <span className="text-red-500">*</span>
          </UIText>
          
          {!useCustom && availableTypes.length > 0 && (
            <>
              <select
                value={selectedSpecific}
                onChange={(e) => handleSpecificSelect(e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
                required
              >
                <option value="">-- Select a type --</option>
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="text"
                onClick={handleUseCustomToggle}
                disabled={disabled}
              >
                <UIText>Or enter custom type</UIText>
              </Button>
            </>
          )}

          {useCustom && (
            <>
              <input
                type="text"
                value={customType}
                onChange={(e) => handleCustomInput(e.target.value)}
                disabled={disabled}
                placeholder="Enter custom type (max 2 words)"
                maxLength={50}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
                required
              />
              {error && (
                <UIText className="text-red-600 text-sm">{error}</UIText>
              )}
              <Button
                type="button"
                variant="text"
                onClick={handleUseCustomToggle}
                disabled={disabled}
              >
                <UIText>Or select from list</UIText>
              </Button>
            </>
          )}
        </div>
      )}

      {/* Display selected type */}
      {selectedGeneral && (selectedSpecific || customType) && (
        <div className="mt-2 p-2 bg-gray-50 rounded">
          <UIText>
            Selected: <strong>{selectedGeneral}</strong> →{' '}
            <strong>{selectedSpecific || customType}</strong>
          </UIText>
        </div>
      )}
    </div>
  )
}

