'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Button, Card, Title, Subtitle, Content, UIText } from '@/components/ui'
import { MarkdownText, MarkdownContent } from '@/components/ui/MarkdownText'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { ProjectTypeSelector } from '@/components/portfolio/ProjectTypeSelector'
import { CreateHumanPortfolioInput } from '@/app/admin/actions'
import { PublicUploadFormConfig, EmailCheckResponse } from '@/types/public-upload-form'
import { createClient } from '@/lib/supabase/client'
import { getPortfolioUrl } from '@/lib/portfolio/routes'

interface ProjectMember {
  name: string
  email?: string
  role?: string
}

interface Project {
  name: string
  description?: string
  project_type_general: string
  project_type_specific: string
  members: ProjectMember[]
  properties?: {
    goals?: string
    timelines?: string
    asks?: Array<{ title: string; description: string }>
  }
}

interface PublicUploadFormProps {
  config: PublicUploadFormConfig
}

export function PublicUploadForm({ config }: PublicUploadFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [emailCheckResult, setEmailCheckResult] = useState<EmailCheckResponse | null>(null)
  const [checkingEmail, setCheckingEmail] = useState(false)
  const [description, setDescription] = useState('')
  const [humanProperties, setHumanProperties] = useState({
    current_location: '',
    availability: '',
    social_preferences: '',
    preferred_contact_method: '',
  })
  // Store multiple choice answers (for multi-select fields)
  const [multipleChoiceAnswers, setMultipleChoiceAnswers] = useState<Record<string, string | string[]>>({})
  // Store "other" custom values for multiple choice questions
  const [otherValues, setOtherValues] = useState<Record<string, string>>({})
  const [projects, setProjects] = useState<Project[]>([
    {
      name: '',
      description: '',
      project_type_general: '',
      project_type_specific: '',
      members: [],
      properties: {
        goals: '',
        timelines: '',
        asks: [],
      },
    },
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState<'main' | 'activities'>('main')
  
  // Project members state
  const [projectMembers, setProjectMembers] = useState<Array<{
    id: string
    name: string | null
    avatar: string | null
  }>>([])
  const [projectMembersLoading, setProjectMembersLoading] = useState(true)
  
  // Legal agreement state
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false)
  const [termsVersion, setTermsVersion] = useState<number | null>(null)
  const [privacyVersion, setPrivacyVersion] = useState<number | null>(null)
  
  // Project ID for this form
  const PROJECT_ID = 'a1b40e33-1d1a-4150-bedf-ef472de1e64b'
  
  // Ref for form element to scroll to top
  const formRef = useRef<HTMLFormElement>(null)

  // Debounced email check
  const checkEmail = useCallback(
    async (emailValue: string) => {
      if (!emailValue || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
        setEmailCheckResult(null)
        return
      }

      setCheckingEmail(true)
      try {
        const response = await fetch('/api/public-upload-forms/check-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailValue }),
        })

        if (response.ok) {
          const data = await response.json()
          setEmailCheckResult(data)
        } else {
          setEmailCheckResult(null)
        }
      } catch (err) {
        console.error('Error checking email:', err)
        setEmailCheckResult(null)
      } finally {
        setCheckingEmail(false)
      }
    },
    []
  )

  // Debounce email check
  useEffect(() => {
    const timer = setTimeout(() => {
      if (email) {
        checkEmail(email)
      } else {
        setEmailCheckResult(null)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [email, checkEmail])

  // Fetch project members
  useEffect(() => {
    const fetchProjectMembers = async () => {
      setProjectMembersLoading(true)
      try {
        const supabase = createClient()
        
        // Fetch project portfolio
        const { data: project, error: projectError } = await supabase
          .from('portfolios')
          .select('id, user_id, metadata')
          .eq('id', PROJECT_ID)
          .eq('type', 'projects')
          .maybeSingle()

        if (projectError || !project) {
          console.error('Failed to fetch project:', projectError)
          setProjectMembers([])
          return
        }

        const metadata = project.metadata as any
        const creatorId = project.user_id
        const managerIds = metadata?.managers || []
        const memberIds = metadata?.members || []
        
        // Combine all member IDs (removing duplicates)
        const allMemberIds = [
          creatorId,
          ...managerIds,
          ...memberIds,
        ]
        const uniqueMemberIds = Array.from(new Set(allMemberIds))
        
        if (uniqueMemberIds.length === 0) {
          setProjectMembers([])
          return
        }

        // Fetch human portfolios for all members
        const { data: memberPortfolios } = await supabase
          .from('portfolios')
          .select('user_id, metadata')
          .eq('type', 'human')
          .in('user_id', uniqueMemberIds)

        // Map members with their role information
        const membersWithRoles = (memberPortfolios || []).map((p: any) => {
          const memberMetadata = p.metadata as any
          const memberBasic = memberMetadata?.basic || {}
          const userId = p.user_id
          
          // Determine role priority: 0 = creator, 1 = manager, 2 = member
          let rolePriority = 2 // default to member
          if (userId === creatorId) {
            rolePriority = 0 // creator
          } else if (managerIds.includes(userId)) {
            rolePriority = 1 // manager
          }
          
          return {
            id: userId,
            avatar: memberBasic.avatar || memberMetadata?.avatar_url || null,
            name: memberBasic.name || memberMetadata?.username || null,
            rolePriority,
          }
        })

        // Sort by role priority: creator (0), then managers (1), then members (2)
        const sortedMembers = membersWithRoles.sort((a: { rolePriority: number; name: string | null }, b: { rolePriority: number; name: string | null }) => {
          if (a.rolePriority !== b.rolePriority) {
            return a.rolePriority - b.rolePriority
          }
          // If same role, maintain original order (by name for consistency)
          return (a.name || '').localeCompare(b.name || '')
        })

        // Remove rolePriority from final result
        const members = sortedMembers.map(
          ({ rolePriority, ...member }: { rolePriority: number; name: string | null }) => member
        )

        setProjectMembers(members)
      } catch (error) {
        console.error('Failed to fetch project members:', error)
        setProjectMembers([])
      } finally {
        setProjectMembersLoading(false)
      }
    }

    fetchProjectMembers()
  }, [])

  // Load active legal documents
  useEffect(() => {
    const loadActiveDocuments = async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('legal_documents')
          .select('type, version')
          .eq('is_active', true)

        if (error || !data) {
          console.error('Error loading legal documents:', error)
          return
        }

        for (const doc of data as Array<{ type: 'terms' | 'privacy'; version: number }>) {
          if (doc.type === 'terms') {
            setTermsVersion(doc.version)
          } else if (doc.type === 'privacy') {
            setPrivacyVersion(doc.version)
          }
        }
      } catch (err) {
        console.error('Failed to load legal documents:', err)
      }
    }

    loadActiveDocuments()
  }, [])

  // Scroll to top of form when page changes to activities
  useEffect(() => {
    if (currentPage === 'activities' && formRef.current) {
      // Use setTimeout to ensure DOM has updated after React re-render
      setTimeout(() => {
        const formElement = formRef.current
        if (formElement) {
          // Scroll the form element into view at the top
          formElement.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' })
        }
      }, 150)
    }
  }, [currentPage])

  const addProject = () => {
    setProjects([
      ...projects,
      {
        name: '',
        description: '',
        project_type_general: '',
        project_type_specific: '',
        members: [],
        properties: {
          goals: '',
          timelines: '',
          asks: [],
        },
      },
    ])
  }

  const removeProject = (index: number) => {
    setProjects(projects.filter((_, i) => i !== index))
  }

  const updateProject = (index: number, updates: Partial<Project>) => {
    setProjects(projects.map((p, i) => (i === index ? { ...p, ...updates } : p)))
  }

  const addMember = (projectIndex: number) => {
    const updatedProjects = [...projects]
    updatedProjects[projectIndex].members.push({
      name: '',
      email: '',
      role: '',
    })
    setProjects(updatedProjects)
  }

  const removeMember = (projectIndex: number, memberIndex: number) => {
    const updatedProjects = [...projects]
    updatedProjects[projectIndex].members = updatedProjects[projectIndex].members.filter(
      (_, i) => i !== memberIndex
    )
    setProjects(updatedProjects)
  }

  const updateMember = (
    projectIndex: number,
    memberIndex: number,
    updates: Partial<ProjectMember>
  ) => {
    const updatedProjects = [...projects]
    updatedProjects[projectIndex].members[memberIndex] = {
      ...updatedProjects[projectIndex].members[memberIndex],
      ...updates,
    }
    setProjects(updatedProjects)
  }

  const addAsk = (projectIndex: number) => {
    const updatedProjects = [...projects]
    if (!updatedProjects[projectIndex].properties) {
      updatedProjects[projectIndex].properties = { goals: '', timelines: '', asks: [] }
    }
    updatedProjects[projectIndex].properties!.asks = [
      ...(updatedProjects[projectIndex].properties!.asks || []),
      { title: '', description: '' },
    ]
    setProjects(updatedProjects)
  }

  const removeAsk = (projectIndex: number, askIndex: number) => {
    const updatedProjects = [...projects]
    if (updatedProjects[projectIndex].properties?.asks) {
      updatedProjects[projectIndex].properties!.asks = updatedProjects[projectIndex].properties!.asks!.filter(
        (_, i) => i !== askIndex
      )
    }
    setProjects(updatedProjects)
  }

  const updateAsk = (projectIndex: number, askIndex: number, updates: Partial<{ title: string; description: string }>) => {
    const updatedProjects = [...projects]
    if (updatedProjects[projectIndex].properties?.asks) {
      updatedProjects[projectIndex].properties!.asks![askIndex] = {
        ...updatedProjects[projectIndex].properties!.asks![askIndex],
        ...updates,
      }
    }
    setProjects(updatedProjects)
  }

  const getQuestionConfig = (fieldKey: string) => {
    return config.question_configs.find((q) => q.field_key === fieldKey)
  }

  // Helper function to render form field based on question type
  const renderFormField = (
    fieldKey: string,
    questionConfig: { label: string; placeholder?: string; type?: 'string' | 'single-select' | 'multi-select'; options?: string[]; allowOther?: boolean } | undefined,
    value: string,
    onChange: (value: string) => void,
    required: boolean = false,
    isTextarea: boolean = false
  ) => {
    const questionType = questionConfig?.type || 'string'
    const options = questionConfig?.options || []
    const allowOther = questionConfig?.allowOther || false

    if (questionType === 'single-select' && options.length > 0) {
      const currentValue = multipleChoiceAnswers[fieldKey] as string || ''
      const isOtherSelected = currentValue === '__other__'
      const otherValue = otherValues[fieldKey] || ''
      
      return (
        <div className="space-y-2">
          {options.map((option, index) => {
            const isSelected = currentValue === option
            return (
              <label key={index} className={`flex items-center gap-2 cursor-pointer ${isSelected ? 'text-blue-600' : ''}`}>
                <input
                  type="radio"
                  name={fieldKey}
                  value={option}
                  checked={isSelected}
                  onChange={(e) => {
                    const newAnswers = { ...multipleChoiceAnswers, [fieldKey]: e.target.value }
                    setMultipleChoiceAnswers(newAnswers)
                    onChange(e.target.value)
                    // Ensure DOM updates immediately for visual feedback
                    requestAnimationFrame(() => {
                      const radio = e.target as HTMLInputElement
                      if (radio && !radio.checked) {
                        radio.checked = true
                      }
                    })
                  }}
                  required={required && !isOtherSelected}
                  className={`w-4 h-4 text-blue-600 border-gray-300 cursor-pointer ${isSelected ? 'checked' : ''}`}
                />
                <UIText className={isSelected ? 'font-medium' : ''}>{option}</UIText>
              </label>
            )
          })}
          {allowOther && (
            <>
              <label key={`${fieldKey}-other`} className={`flex items-center gap-2 cursor-pointer ${isOtherSelected ? 'text-blue-600' : ''}`}>
                <input
                  type="radio"
                  name={fieldKey}
                  value="__other__"
                  checked={isOtherSelected}
                  onChange={(e) => {
                    // Update state immediately
                    const newAnswers = { ...multipleChoiceAnswers, [fieldKey]: '__other__' }
                    setMultipleChoiceAnswers(newAnswers)
                    onChange(otherValues[fieldKey] || '')
                    // Force a re-render by updating a dummy state to ensure DOM updates
                    requestAnimationFrame(() => {
                      const radio = document.querySelector(`input[name="${fieldKey}"][value="__other__"]`) as HTMLInputElement
                      if (radio && !radio.checked) {
                        radio.checked = true
                        radio.dispatchEvent(new Event('change', { bubbles: true }))
                      }
                    })
                  }}
                  required={required}
                  className={`w-4 h-4 text-blue-600 border-gray-300 cursor-pointer ${isOtherSelected ? 'checked' : ''}`}
                  style={isOtherSelected ? { borderColor: 'rgb(37, 99, 235)' } : {}}
                />
                <UIText className={isOtherSelected ? 'font-medium' : ''}>Other</UIText>
              </label>
              {isOtherSelected && (
                <div className="ml-6 mt-2">
                  <input
                    type="text"
                    value={otherValue}
                    onChange={(e) => {
                      const newValue = e.target.value
                      setOtherValues({ ...otherValues, [fieldKey]: newValue })
                      onChange(newValue)
                    }}
                    required={required}
                    maxLength={1000}
                    placeholder="Please specify"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )
    }

    if (questionType === 'multi-select' && options.length > 0) {
      const currentValues = (multipleChoiceAnswers[fieldKey] as string[]) || []
      const isOtherSelected = currentValues.includes('__other__')
      const otherValue = otherValues[fieldKey] || ''
      
      return (
        <div className="space-y-2">
          {options.map((option, index) => (
            <label key={index} className={`flex items-center gap-2 cursor-pointer ${currentValues.includes(option) ? 'text-blue-600' : ''}`}>
              <input
                type="checkbox"
                value={option}
                checked={currentValues.includes(option)}
                onChange={(e) => {
                  const newValues = e.target.checked
                    ? [...currentValues.filter(v => v !== '__other__'), option]
                    : currentValues.filter(v => v !== option)
                  
                  setMultipleChoiceAnswers({ ...multipleChoiceAnswers, [fieldKey]: newValues })
                  // Build display value: regular options + other value if selected
                  const regularOptions = newValues.filter(v => v !== '__other__')
                  const displayValue = isOtherSelected && otherValue
                    ? [...regularOptions, otherValue].join(', ')
                    : regularOptions.join(', ')
                  onChange(displayValue)
                }}
                className="w-4 h-4 text-blue-600 border-gray-300 cursor-pointer rounded"
              />
              <UIText className={currentValues.includes(option) ? 'font-medium' : ''}>{option}</UIText>
            </label>
          ))}
          {allowOther && (
            <>
              <label className={`flex items-center gap-2 cursor-pointer ${isOtherSelected ? 'text-blue-600' : ''}`}>
                <input
                  type="checkbox"
                  value="__other__"
                  checked={isOtherSelected}
                  onChange={(e) => {
                    const newValues = e.target.checked
                      ? [...currentValues.filter(v => v !== '__other__'), '__other__']
                      : currentValues.filter(v => v !== '__other__')
                    
                    if (!e.target.checked) {
                      setOtherValues({ ...otherValues, [fieldKey]: '' })
                    }
                    
                    setMultipleChoiceAnswers({ ...multipleChoiceAnswers, [fieldKey]: newValues })
                    // Build display value
                    const regularOptions = newValues.filter(v => v !== '__other__')
                    const displayValue = e.target.checked && otherValue
                      ? [...regularOptions, otherValue].join(', ')
                      : regularOptions.join(', ')
                    onChange(displayValue)
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 cursor-pointer rounded"
                />
                <UIText className={isOtherSelected ? 'font-medium' : ''}>Other</UIText>
              </label>
              {isOtherSelected && (
                <div className="ml-6 mt-2">
                  <input
                    type="text"
                    value={otherValue}
                    onChange={(e) => {
                      const newValue = e.target.value
                      setOtherValues({ ...otherValues, [fieldKey]: newValue })
                      // Build display value with updated other value
                      const regularOptions = currentValues.filter(v => v !== '__other__')
                      const displayValue = newValue
                        ? [...regularOptions, newValue].join(', ')
                        : regularOptions.join(', ')
                      onChange(displayValue)
                    }}
                    placeholder="Please specify"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )
    }

    // Default: text input or textarea
    if (isTextarea) {
      return (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          required={required}
          maxLength={1000}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={questionConfig?.placeholder || ''}
        />
      )
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        maxLength={1000}
        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder={questionConfig?.placeholder || ''}
      />
    )
  }

  const validateForm = (): string | null => {
    if (!name.trim()) {
      return 'Name is required'
    }
    if (!email.trim()) {
      return 'Email is required'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return 'Invalid email format'
    }
    if (!description.trim()) {
      return 'Description is required'
    }
    if (!agreedToTerms || !agreedToPrivacy) {
      return 'You must agree to the Terms & Conditions and Privacy Policy to submit this form.'
    }

    // Validate activities
    for (let i = 0; i < projects.length; i++) {
      const project = projects[i]
      if (!project.name.trim()) {
        return `Activity ${i + 1}: Name is required`
      }
      if (!project.description || !project.description.trim()) {
        return `Activity ${i + 1}: Description is required`
      }

      // Validate member roles (max 2 words)
      for (let j = 0; j < project.members.length; j++) {
        const member = project.members[j]
        if (!member.name.trim()) {
          return `Project ${i + 1}, Member ${j + 1}: Name is required`
        }
        if (member.role) {
          const words = member.role.trim().split(/\s+/)
          if (words.length > 2) {
            return `Activity ${i + 1}, Member ${j + 1}: Role must be 2 words or less`
          }
        }
      }
    }

    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      const submissionData: CreateHumanPortfolioInput = {
        name: name.trim(),
        email: email.trim(),
        description: description.trim(),
        joined_community: '9f4fc0af-8997-494e-945c-d2831eaf258a', // Default admin community
        is_pseudo: true, // Enforced
        properties: {
          current_location: humanProperties.current_location.trim() || undefined,
          availability: humanProperties.availability.trim() || undefined,
          social_preferences: humanProperties.social_preferences.trim() || undefined,
          preferred_contact_method: humanProperties.preferred_contact_method.trim() || undefined,
          // Include multiple choice answers (replace __other__ with actual other value)
          ...Object.fromEntries(
            Object.entries(multipleChoiceAnswers).map(([key, value]) => {
              if (Array.isArray(value)) {
                const processedValues = value.map(v => v === '__other__' ? otherValues[key] || '' : v).filter(v => v)
                return [key, processedValues.join(', ')]
              } else {
                const processedValue = value === '__other__' ? otherValues[key] || '' : value
                return [key, processedValue]
              }
            })
          ),
        },
        projects: projects.map((p) => ({
          name: p.name.trim(),
          description: p.description!.trim(), // Validated to exist above
          project_type_general: p.project_type_general.trim(),
          project_type_specific: p.project_type_specific.trim(),
          is_pseudo: true, // Enforced
          members: p.members
            .filter((m) => m.name.trim())
            .map((m) => ({
              name: m.name.trim(),
              email: m.email?.trim() || undefined,
              role: m.role?.trim() || undefined,
              is_pseudo: true, // Enforced
            })),
          properties: p.properties
            ? {
                goals: p.properties.goals?.trim() || undefined,
                timelines: p.properties.timelines?.trim() || undefined,
                asks: p.properties.asks?.filter((a) => a.title.trim() || a.description.trim()).map((a) => ({
                  title: a.title.trim(),
                  description: a.description.trim(),
                })),
              }
            : undefined,
        })),
      }

      const response = await fetch('/api/public-upload-forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to submit form')
        return
      }

      setSubmissionId(result.id)
      
      // Scroll to top to show success message
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Show success message if submission was successful
  if (submissionId) {
    return (
      <Card variant="default">
        <div className="space-y-4">
          <Title>Submission Successful!</Title>
          <Content>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
              <UIText className="font-semibold mb-2">Your submission ID is:</UIText>
              <div className="font-mono text-lg mb-4 break-all">{submissionId}</div>
              <UIText>Please save this ID for reference. We will contact you to confirm.</UIText>
            </div>
          </Content>
        </div>
      </Card>
    )
  }

  const nameConfig = getQuestionConfig('name')
  const emailConfig = getQuestionConfig('email')
  const descriptionConfig = getQuestionConfig('description')
  const locationConfig = getQuestionConfig('current_location')
  const availabilityConfig = getQuestionConfig('availability')
  const socialConfig = getQuestionConfig('social_preferences')
  const contactConfig = getQuestionConfig('preferred_contact_method')

  // Extract main form content to reuse in mobile and desktop
  const mainFormContent = (
    <div className="space-y-4">
      <div>
        <MarkdownContent className="mt-2">{config.intro_paragraph}</MarkdownContent>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <UIText className="text-red-700">{error}</UIText>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="name" className="block mb-1">
            <MarkdownText>{nameConfig?.label || 'Name'}</MarkdownText>
            <UIText> *</UIText>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={1000}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={nameConfig?.placeholder || 'Full name'}
          />
        </div>

        <div>
          <label htmlFor="email" className="block mb-1">
            <MarkdownText>{emailConfig?.label || 'Email'}</MarkdownText>
            <UIText> *</UIText>
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={emailConfig?.placeholder || 'email@example.com'}
          />
          {checkingEmail && (
            <UIText className="text-sm text-gray-500 mt-1">Checking...</UIText>
          )}
          {emailCheckResult?.exists && !checkingEmail && (
            <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
              <UIText className="text-green-700">
                Welcome back, {emailCheckResult.name}! You can update your portfolio information below.
              </UIText>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="description" className="block mb-1">
            <MarkdownText>{descriptionConfig?.label || 'Description'}</MarkdownText>
            <UIText> *</UIText>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            required
            maxLength={1000}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={descriptionConfig?.placeholder || 'Tell us about yourself...'}
          />
        </div>

        <div>
          <label htmlFor="current_location" className="block mb-1">
            <MarkdownText>{locationConfig?.label || 'Current Location'}</MarkdownText>
          </label>
          {renderFormField(
            'current_location',
            locationConfig,
            humanProperties.current_location,
            (value) => setHumanProperties({ ...humanProperties, current_location: value })
          )}
        </div>
        <div>
          <label htmlFor="availability" className="block mb-1">
            <MarkdownText>{availabilityConfig?.label || 'Availability'}</MarkdownText>
          </label>
          {renderFormField(
            'availability',
            availabilityConfig,
            humanProperties.availability,
            (value) => setHumanProperties({ ...humanProperties, availability: value })
          )}
        </div>
        <div>
          <label htmlFor="social_preferences" className="block mb-1">
            <MarkdownText>{socialConfig?.label || 'Social Preferences'}</MarkdownText>
          </label>
          {renderFormField(
            'social_preferences',
            socialConfig,
            humanProperties.social_preferences,
            (value) => setHumanProperties({ ...humanProperties, social_preferences: value })
          )}
        </div>
        <div>
          <label htmlFor="preferred_contact_method" className="block mb-1">
            <MarkdownText>{contactConfig?.label || 'Preferred Contact Method'}</MarkdownText>
          </label>
          {renderFormField(
            'preferred_contact_method',
            contactConfig,
            humanProperties.preferred_contact_method,
            (value) => setHumanProperties({ ...humanProperties, preferred_contact_method: value })
          )}
        </div>
      </div>
    </div>
  );

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {currentPage === 'main' ? (
        <>
          {/* Title - above the card */}
          <div className="w-full md:max-w-xl md:mx-auto">
            {/* Mobile: proper padding */}
            <div className="md:hidden px-4 pt-6 pb-0">
              <Title>{config.title}</Title>
              {/* Project Members */}
              {!projectMembersLoading && projectMembers.length > 0 && (
                <Link
                  href={getPortfolioUrl('projects', PROJECT_ID)}
                  className="inline-flex items-center gap-2 mt-3 px-2 py-1 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <div className="flex -space-x-2">
                    {projectMembers.slice(0, 5).map((member, index) => (
                      <div
                        key={member.id}
                        className="relative"
                        style={{ zIndex: Math.min(projectMembers.length, 5) - index }}
                      >
                        <UserAvatar
                          userId={member.id}
                          name={member.name}
                          avatar={member.avatar}
                          size={32}
                          showLink={false}
                        />
                      </div>
                    ))}
                  </div>
                  <UIText className="text-gray-600">
                    {(() => {
                      const memberNames = projectMembers.map(m => m.name).filter(Boolean) as string[]
                      if (memberNames.length === 0) return null
                      if (memberNames.length === 1) return memberNames[0]
                      // Join all names with " and ", but if too many, show first few and "..."
                      if (memberNames.length <= 3) {
                        return memberNames.join(' and ')
                      }
                      // For more than 3, show first 2 and indicate more
                      return `${memberNames[0]} and ${memberNames[1]} and ...`
                    })()}
                  </UIText>
                </Link>
              )}
            </div>
            {/* Desktop: transparent card with same padding */}
            <div className="hidden md:block">
              <div className="bg-transparent rounded-xl px-6 pt-6 pb-0">
                <Title>{config.title}</Title>
                {/* Project Members */}
                {!projectMembersLoading && projectMembers.length > 0 && (
                  <Link
                    href={getPortfolioUrl('projects', PROJECT_ID)}
                    className="inline-flex items-center gap-2 mt-3 px-2 py-1 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex -space-x-2">
                      {projectMembers.slice(0, 5).map((member, index) => (
                        <div
                          key={member.id}
                          className="relative"
                          style={{ zIndex: Math.min(projectMembers.length, 5) - index }}
                        >
                          <UserAvatar
                            userId={member.id}
                            name={member.name}
                            avatar={member.avatar}
                            size={32}
                            showLink={false}
                          />
                        </div>
                      ))}
                    </div>
                    <UIText className="text-gray-600">
                      {(() => {
                        const memberNames = projectMembers.map(m => m.name).filter(Boolean) as string[]
                        if (memberNames.length === 0) return null
                        if (memberNames.length === 1) return memberNames[0]
                        // Join all names with " and ", but if too many, show first few and "..."
                        if (memberNames.length <= 3) {
                          return memberNames.join(' and ')
                        }
                        // For more than 3, show first 2 and indicate more
                        return `${memberNames[0]} and ${memberNames[1]} and ...`
                      })()}
                    </UIText>
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Main Information Card - Flat on mobile, card on desktop */}
          <div className="w-full md:max-w-xl md:mx-auto">
            {/* Mobile: flat layout (no card) */}
            <div className="md:hidden px-4 pt-0 pb-6">
              {mainFormContent}
            </div>

            {/* Desktop: keep card */}
            <div className="hidden md:block -mt-2">
              <Card variant="default">
                {mainFormContent}
              </Card>
            </div>
          </div>

          {/* Next button - with proper margins matching sections above */}
          <div className="w-full md:max-w-xl md:mx-auto">
            {/* Mobile: proper padding */}
            <div className="md:hidden px-4 pb-12">
              <div className="flex gap-4 justify-end">
                <Button 
                  type="button" 
                  variant="primary" 
                  onClick={() => {
                    // Validate main form fields before proceeding
                    if (!name.trim() || !email.trim()) {
                      setError('Name and email are required')
                      return
                    }
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                      setError('Invalid email format')
                      return
                    }
                    setError(null)
                    setCurrentPage('activities')
                  }}
                >
                  Next
                </Button>
              </div>
            </div>
            {/* Desktop: transparent card with same padding */}
            <div className="hidden md:block mb-12">
              <div className="bg-transparent rounded-xl p-6">
                <div className="flex gap-4 justify-end">
                  <Button 
                    type="button" 
                    variant="primary" 
                    onClick={() => {
                      // Validate main form fields before proceeding
                      if (!name.trim() || !email.trim()) {
                        setError('Name and email are required')
                        return
                      }
                      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                        setError('Invalid email format')
                        return
                      }
                      setError(null)
                      setCurrentPage('activities')
                      // Scroll to top of form after state update
                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          if (formRef.current) {
                            const formTop = formRef.current.getBoundingClientRect().top + window.pageYOffset
                            window.scrollTo({ top: formTop, behavior: 'smooth' })
                          }
                        })
                      })
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Back button */}
          <div className="w-full md:max-w-xl md:mx-auto">
            {/* Mobile: proper padding */}
            <div className="md:hidden px-4 pt-6">
              <div className="flex gap-4 justify-start mb-4">
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={() => {
                    setCurrentPage('main')
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                >
                  Back
                </Button>
              </div>
            </div>
            {/* Desktop: transparent card with same padding */}
            <div className="hidden md:block">
              <div className="bg-transparent rounded-xl p-6">
                <div className="flex gap-4 justify-start mb-4">
                  <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={() => {
                      setCurrentPage('main')
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                  >
                    Back
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Activities section - with proper margins */}
      <div className="w-full md:max-w-xl md:mx-auto space-y-2">
        {/* Activities header */}
        <div className="md:hidden px-4 pt-2 pb-1">
          <div>
            <Subtitle>Activities</Subtitle>
          </div>
        </div>
        <div className="hidden md:block">
          <div className="bg-transparent rounded-xl px-6 pt-2 pb-1">
            <div>
              <Subtitle>Activities</Subtitle>
            </div>
          </div>
        </div>
        
        {/* Activities paragraph - transparent card for consistency */}
        <div>
          {/* Mobile: subtle background to distinguish from activity cards */}
          <div className="md:hidden px-4 pt-2 pb-2 bg-gray-50/50">
            <MarkdownContent>{config.activities_section_paragraph}</MarkdownContent>
          </div>
          {/* Desktop: transparent card with same padding */}
          <div className="hidden md:block">
            <div className="bg-transparent rounded-xl px-6 pt-2 pb-2">
              <MarkdownContent>{config.activities_section_paragraph}</MarkdownContent>
            </div>
          </div>
        </div>

        {projects.map((project, projectIndex) => {
          const projectNameConfig = getQuestionConfig('project_name')
          const projectDescConfig = getQuestionConfig('project_description')
          const goalsConfig = getQuestionConfig('project_goals')
          const timelinesConfig = getQuestionConfig('project_timelines')
          const askTitleConfig = getQuestionConfig('ask_title')
          const askDescConfig = getQuestionConfig('ask_description')
          const memberNameConfig = getQuestionConfig('member_name')
          const memberEmailConfig = getQuestionConfig('member_email')
          const memberRoleConfig = getQuestionConfig('member_role')

          // Extract project card content to reuse in mobile and desktop
          const projectCardContent = (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Subtitle>Activity {projectIndex + 1}</Subtitle>
                  {projects.length > 1 && (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => removeProject(projectIndex)}
                    >
                      Remove
                    </Button>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block mb-1">
                      <MarkdownText>{projectNameConfig?.label || 'Activity Name'}</MarkdownText>
                      <UIText> *</UIText>
                    </label>
                    <input
                      type="text"
                      value={project.name}
                      onChange={(e) => updateProject(projectIndex, { name: e.target.value })}
                      required
                      maxLength={1000}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={projectNameConfig?.placeholder || 'Project name'}
                    />
                  </div>

                  <div>
                    <label className="block mb-1">
                      <MarkdownText>{projectDescConfig?.label || 'Description'}</MarkdownText>
                      <UIText> *</UIText>
                    </label>
                    <textarea
                      value={project.description || ''}
                      onChange={(e) => updateProject(projectIndex, { description: e.target.value })}
                      rows={3}
                      required
                      maxLength={1000}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={projectDescConfig?.placeholder || 'Activity description'}
                    />
                  </div>

                  <div>
                    <ProjectTypeSelector
                      generalCategory={project.project_type_general}
                      specificType={project.project_type_specific}
                      onSelect={(general, specific) =>
                        updateProject(projectIndex, {
                          project_type_general: general,
                          project_type_specific: specific,
                        })
                      }
                      disabled={false}
                    />
                  </div>

                  <div className="space-y-4">
                      <div>
                        <label className="block mb-1">
                          <MarkdownText>{goalsConfig?.label || 'Goals'}</MarkdownText>
                        </label>
                        <input
                          type="text"
                          value={project.properties?.goals || ''}
                          onChange={(e) =>
                            updateProject(projectIndex, {
                              properties: {
                                ...(project.properties || { goals: '', timelines: '', asks: [] }),
                                goals: e.target.value,
                              },
                            })
                          }
                          maxLength={1000}
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder={goalsConfig?.placeholder || 'Activity goals'}
                        />
                      </div>
                      <div>
                        <label className="block mb-1">
                          <MarkdownText>{timelinesConfig?.label || 'Timelines'}</MarkdownText>
                        </label>
                        <input
                          type="text"
                          value={project.properties?.timelines || ''}
                          onChange={(e) =>
                            updateProject(projectIndex, {
                              properties: {
                                ...(project.properties || { goals: '', timelines: '', asks: [] }),
                                timelines: e.target.value,
                              },
                            })
                          }
                          maxLength={1000}
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder={timelinesConfig?.placeholder || 'Activity timelines'}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <UIText>Asks</UIText>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => addAsk(projectIndex)}
                          >
                            Add Ask
                          </Button>
                        </div>
                        <MarkdownContent className="text-sm text-gray-600 mb-2">{config.asks_section_paragraph}</MarkdownContent>
                        {project.properties?.asks?.map((ask, askIndex) => (
                          <div key={askIndex} className="mb-4 p-4 bg-gray-50 rounded-md">
                            <div className="flex items-center justify-between mb-2">
                              <UIText>Ask {askIndex + 1}</UIText>
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                onClick={() => removeAsk(projectIndex, askIndex)}
                              >
                                Remove
                              </Button>
                            </div>
                            <div className="space-y-2">
                              <div>
                                <label className="block mb-1">
                                  <MarkdownText>{askTitleConfig?.label || 'Title'}</MarkdownText>
                                </label>
                                <input
                                  type="text"
                                  value={ask.title}
                                  onChange={(e) => updateAsk(projectIndex, askIndex, { title: e.target.value })}
                                  maxLength={1000}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder={askTitleConfig?.placeholder || 'Ask title'}
                                />
                              </div>
                              <div>
                                <label className="block mb-1">
                                  <MarkdownText>{askDescConfig?.label || 'Description'}</MarkdownText>
                                </label>
                                <textarea
                                  value={ask.description}
                                  onChange={(e) => updateAsk(projectIndex, askIndex, { description: e.target.value })}
                                  rows={2}
                                  maxLength={1000}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder={askDescConfig?.placeholder || 'Ask description'}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <UIText>Members</UIText>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => addMember(projectIndex)}
                      >
                        Add Member
                      </Button>
                    </div>
                    <MarkdownContent className="text-sm text-gray-600 mb-2">{config.members_section_paragraph}</MarkdownContent>

                    {project.members.map((member, memberIndex) => (
                      <div key={memberIndex} className="mb-4 p-4 bg-gray-50 rounded-md">
                        <div className="flex items-center justify-between mb-2">
                          <UIText>Member {memberIndex + 1}</UIText>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => removeMember(projectIndex, memberIndex)}
                          >
                            Remove
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className="block mb-1">
                              <MarkdownText>{memberNameConfig?.label || 'Name'}</MarkdownText>
                              <UIText> *</UIText>
                            </label>
                            <input
                              type="text"
                              value={member.name}
                              onChange={(e) =>
                                updateMember(projectIndex, memberIndex, { name: e.target.value })
                              }
                              required
                              maxLength={1000}
                              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder={memberNameConfig?.placeholder || 'Member name'}
                            />
                          </div>
                          <div>
                            <label className="block mb-1">
                              <MarkdownText>{memberEmailConfig?.label || 'Email (optional)'}</MarkdownText>
                            </label>
                            <input
                              type="email"
                              value={member.email || ''}
                              onChange={(e) =>
                                updateMember(projectIndex, memberIndex, { email: e.target.value })
                              }
                              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder={memberEmailConfig?.placeholder || 'member@example.com'}
                            />
                          </div>
                          <div>
                            <label className="block mb-1">
                              <MarkdownText>{memberRoleConfig?.label || 'Role (optional, max 2 words)'}</MarkdownText>
                            </label>
                            <input
                              type="text"
                              value={member.role || ''}
                              onChange={(e) =>
                                updateMember(projectIndex, memberIndex, { role: e.target.value })
                              }
                              maxLength={1000}
                              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder={memberRoleConfig?.placeholder || 'e.g., Lead Developer'}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
            </div>
          )

          return (
            <div key={projectIndex} className="w-full md:max-w-xl md:mx-auto">
              {/* Mobile: flat layout (no card) */}
              <div className="md:hidden px-4 py-6">
                {projectCardContent}
              </div>

              {/* Desktop: keep card */}
              <div className="hidden md:block">
                <Card variant="default">
                  {projectCardContent}
                </Card>
              </div>
            </div>
          )
        })}

        {/* Add Activity button - at the end of activities list */}
        <div className="w-full md:max-w-xl md:mx-auto">
          {/* Mobile: proper padding */}
          <div className="md:hidden px-4">
            <Button type="button" variant="secondary" onClick={addProject} fullWidth>
              Add More Activities
            </Button>
          </div>
          {/* Desktop: transparent card with same padding */}
          <div className="hidden md:block">
            <div className="bg-transparent rounded-xl p-6">
              <Button type="button" variant="secondary" onClick={addProject} fullWidth>
                Add More Activities
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Closing paragraph - transparent card for consistency */}
      <div className="w-full md:max-w-xl md:mx-auto mt-6">
        {/* Mobile: subtle background to distinguish from activity cards */}
        <div className="md:hidden px-4 py-6 bg-gray-50/50">
          <MarkdownContent>{config.outro_paragraph}</MarkdownContent>
        </div>
        {/* Desktop: transparent card with same padding */}
        <div className="hidden md:block">
          <div className="bg-transparent rounded-xl p-6">
            <MarkdownContent>{config.outro_paragraph}</MarkdownContent>
          </div>
        </div>
      </div>

      {/* Terms and Privacy Agreement */}
      <div className="w-full md:max-w-xl md:mx-auto">
        {/* Mobile: proper padding */}
        <div className="md:hidden px-4 py-4">
          <UIText as="p" className="mb-3">
            Before submitting, please review and agree to the following:
          </UIText>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(event) => setAgreedToTerms(event.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                required
              />
              <UIText as="span" className="text-sm">
                I have read and agree to the{' '}
                <Link 
                  href="/legal/terms" 
                  className="text-blue-600 hover:text-blue-500 underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Terms &amp; Conditions
                </Link>
                .
              </UIText>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={agreedToPrivacy}
                onChange={(event) => setAgreedToPrivacy(event.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                required
              />
              <UIText as="span" className="text-sm">
                I have read and understand the{' '}
                <Link 
                  href="/legal/privacy" 
                  className="text-blue-600 hover:text-blue-500 underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </Link>
                .
              </UIText>
            </label>
          </div>
        </div>
        {/* Desktop: transparent card with same padding */}
        <div className="hidden md:block">
          <div className="bg-transparent rounded-xl px-6 py-4">
            <UIText as="p" className="mb-3">
              Before submitting, please review and agree to the following:
            </UIText>
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(event) => setAgreedToTerms(event.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  required
                />
                <UIText as="span" className="text-sm">
                  I have read and agree to the{' '}
                  <Link 
                    href="/legal/terms" 
                    className="text-blue-600 hover:text-blue-500 underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Terms &amp; Conditions
                  </Link>
                  .
                </UIText>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={agreedToPrivacy}
                  onChange={(event) => setAgreedToPrivacy(event.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  required
                />
                <UIText as="span" className="text-sm">
                  I have read and understand the{' '}
                  <Link 
                    href="/legal/privacy" 
                    className="text-blue-600 hover:text-blue-500 underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Privacy Policy
                  </Link>
                  .
                </UIText>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Submit button - with proper margins matching sections above */}
      <div className="w-full md:max-w-xl md:mx-auto">
        {/* Mobile: proper padding */}
        <div className="md:hidden px-4 pb-12">
          <div className="flex gap-4 justify-end">
            <Button 
              type="submit" 
              variant="primary" 
              disabled={loading || !agreedToTerms || !agreedToPrivacy}
            >
              {loading ? 'Submitting...' : 'Submit Form'}
            </Button>
          </div>
        </div>
        {/* Desktop: transparent card with same padding */}
        <div className="hidden md:block mb-12">
          <div className="bg-transparent rounded-xl p-6">
            <div className="flex gap-4 justify-end">
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? 'Submitting...' : 'Submit Form'}
              </Button>
            </div>
          </div>
        </div>
      </div>
        </>
      )}
    </form>
  )
}

