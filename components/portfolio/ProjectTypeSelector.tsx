'use client'

import { useState, useEffect } from 'react'
import { UIText, Button } from '@/components/ui'

interface ProjectTypeSelectorProps {
  generalCategory?: string
  specificType?: string
  onSelect: (general: string, specific: string) => void
  disabled?: boolean
}

// Project type categories and their specific types (all ≤2 words)
const PROJECT_TYPE_CATEGORIES: Record<string, string[]> = {
  'Knowledge & Thought': [
    'Research',
    'Writing',
    'Newsletter',
    'Podcast',
    'Course',
    'Study Group',
    'Knowledge Base',
    'Theory',
    'Framework',
  ],
  'Arts & Culture': [
    'Visual Art',
    'Film',
    'Photography',
    'Performance',
    'Theater',
    'Dance',
    'Music',
    'Poetry',
    'Creative Writing',
    'Zine',
    'Fashion',
    'Game Art',
  ],
  'Product & Building': [
    'Startup',
    'Indie Product',
    'Open Source',
    'Hardware',
    'App',
    'Tool',
    'Prototype',
    'Design System',
    'No Code',
  ],
  'Community & Social': [
    'Community Building',
    'Online Forum',
    'Local Community',
    'Mutual Aid',
    'DAO',
    'Peer Learning',
    'Support Group',
    'Cultural Collective',
  ],
  'Impact & Change': [
    'NGO',
    'Social Initiative',
    'Activism',
    'Policy Project',
    'Civic Tech',
    'Climate Action',
    'Sustainability',
    'Community Repair',
    'Education Access',
  ],
  'Events & Experiences': [
    'Conference',
    'Workshop',
    'Salon',
    'Meetup',
    'Festival',
    'Exhibition',
    'Hackathon',
    'Retreat',
    'Performance Event',
    'Pop Up',
  ],
  'Media & Content': [
    'YouTube Channel',
    'Short Form',
    'Documentary',
    'Web Publication',
    'Magazine',
    'Livestream',
    'Social Experiment',
  ],
  'Personal Growth': [
    'Learning Journey',
    'Skill Challenge',
    'Habit Experiment',
    'Fitness Plan',
    'Mental Health',
    'Spiritual Exploration',
    'Self Research',
    'Creative Practice',
  ],
  'Sports & Physical': [
    'Sports Team',
    'Training Program',
    'Competition Prep',
    'Dance Crew',
    'Martial Arts',
    'Outdoor Adventure',
    'Performance Conditioning',
  ],
  'Hobbies & Passion': [
    'Crafting',
    'DIY Project',
    'Cooking Experiment',
    'Gardening',
    'Travel Docs',
    'Language Learning',
    'Game Modding',
    'Collection Building',
  ],
  'Career & Professional': [
    'Career Transition',
    'Portfolio Building',
    'Freelance Practice',
    'Personal Brand',
    'Thought Leadership',
    'Consulting Practice',
    'Teaching Practice',
  ],
  'Economic & Collective': [
    'Cooperative',
    'Creator Collective',
    'Fund',
    'Resource Pool',
    'Micro Economy',
    'Marketplace Experiment',
  ],
  'Others': [], // Empty array - will require custom input
}

const GENERAL_CATEGORIES = Object.keys(PROJECT_TYPE_CATEGORIES)

function validateTwoWords(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  const words = trimmed.split(/\s+/)
  return words.length <= 2
}

export function ProjectTypeSelector({
  generalCategory,
  specificType,
  onSelect,
  disabled = false,
}: ProjectTypeSelectorProps) {
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
      const types = PROJECT_TYPE_CATEGORIES[generalCategory || ''] || []
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
    // Clear any previous selection when category changes
    // Don't call onSelect here - wait for specific type selection
  }

  const handleSpecificSelect = (type: string) => {
    if (!type) return // Don't process empty selection
    
    setSelectedSpecific(type)
    setCustomType('')
    setUseCustom(false)
    setError('')
    // Use selectedGeneral from state (which should be current) or fallback to prop
    // This ensures we always have the current general category even if state hasn't updated yet
    const currentGeneral = selectedGeneral || generalCategory
    if (currentGeneral && type) {
      onSelect(currentGeneral, type)
    } else {
      console.warn('ProjectTypeSelector: Cannot select specific type without general category', {
        selectedGeneral,
        generalCategory,
        type,
      })
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
      // Use selectedGeneral from state (which should be current) or fallback to prop
      const currentGeneral = selectedGeneral || generalCategory
      if (currentGeneral) {
        onSelect(currentGeneral, value.trim())
      }
    }
  }

  const handleUseCustomToggle = () => {
    setUseCustom(!useCustom)
    setSelectedSpecific('')
    setCustomType('')
    setError('')
  }

  const availableTypes = selectedGeneral ? PROJECT_TYPE_CATEGORIES[selectedGeneral] || [] : []

  return (
    <div className="space-y-4">
      {/* General Category Selection */}
      <div>
        <UIText as="label" className="block mb-2">
          General Category
        </UIText>
        <select
          value={selectedGeneral}
          onChange={(e) => handleGeneralSelect(e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            Specific Type
          </UIText>
          
          {!useCustom && availableTypes.length > 0 && (
            <>
              <select
                value={selectedSpecific}
                onChange={(e) => handleSpecificSelect(e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
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

