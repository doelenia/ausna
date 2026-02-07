'use client'

import { useState } from 'react'
import { Button, Card, Title, Subtitle, Content, UIText } from '@/components/ui'
import { createHumanPortfolioWithProjects } from '@/app/admin/actions'
import { ProjectTypeSelector } from '@/components/portfolio/ProjectTypeSelector'

interface ProjectMember {
  name: string
  email?: string
  role?: string
  is_pseudo?: boolean // Default to true
}

interface Project {
  name: string
  description?: string
  project_type_general: string
  project_type_specific: string
  is_pseudo: boolean
  members: ProjectMember[]
  properties?: {
    goals?: string
    timelines?: string
    asks?: Array<{ title: string; description: string }>
  }
}

export function CreateHumanPortfolioForm({
  onSuccess,
  onCancel,
}: {
  onSuccess?: () => void
  onCancel?: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [description, setDescription] = useState('')
  const [joinedCommunity, setJoinedCommunity] = useState('9f4fc0af-8997-494e-945c-d2831eaf258a')
  const [isPseudo, setIsPseudo] = useState(true)
  const [humanProperties, setHumanProperties] = useState({
    current_location: '',
    availability: '',
    social_preferences: '',
    preferred_contact_method: '',
  })
  const [projects, setProjects] = useState<Project[]>([
    {
      name: '',
      description: '',
      project_type_general: '',
      project_type_specific: '',
      is_pseudo: true,
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

  const addProject = () => {
    setProjects([
      ...projects,
      {
        name: '',
        description: '',
        project_type_general: '',
        project_type_specific: '',
        is_pseudo: true,
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
      is_pseudo: true, // Default to pseudo
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
      setProjects(updatedProjects)
    }
  }

  const updateAsk = (projectIndex: number, askIndex: number, updates: Partial<{ title: string; description: string }>) => {
    const updatedProjects = [...projects]
    if (updatedProjects[projectIndex].properties?.asks) {
      updatedProjects[projectIndex].properties!.asks![askIndex] = {
        ...updatedProjects[projectIndex].properties!.asks![askIndex],
        ...updates,
      }
      setProjects(updatedProjects)
    }
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

    // Validate projects (only if they exist and have content)
    for (let i = 0; i < projects.length; i++) {
      const project = projects[i]
      // Only validate if project has a name (meaning user started filling it)
      if (project.name.trim()) {
        // Validate member roles (max 2 words)
        for (let j = 0; j < project.members.length; j++) {
          const member = project.members[j]
          if (member.name.trim() && member.role) {
            const words = member.role.trim().split(/\s+/)
            if (words.length > 2) {
              return `Project ${i + 1}, Member ${j + 1}: Role must be 2 words or less`
            }
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
      // Build properties object only if there are any values
      const propertiesEntries: Record<string, string> = {}
      if (humanProperties.current_location.trim()) {
        propertiesEntries.current_location = humanProperties.current_location.trim()
      }
      if (humanProperties.availability.trim()) {
        propertiesEntries.availability = humanProperties.availability.trim()
      }
      if (humanProperties.social_preferences.trim()) {
        propertiesEntries.social_preferences = humanProperties.social_preferences.trim()
      }
      if (humanProperties.preferred_contact_method.trim()) {
        propertiesEntries.preferred_contact_method = humanProperties.preferred_contact_method.trim()
      }

      // Filter out empty projects and build projects array
      const validProjects = projects
        .filter((p) => p.name.trim()) // Only include projects with a name
        .map((p) => ({
          name: p.name.trim(),
          description: p.description?.trim() || undefined,
          project_type_general: p.project_type_general.trim() || undefined,
          project_type_specific: p.project_type_specific.trim() || undefined,
          is_pseudo: p.is_pseudo,
          members: p.members
            .filter((m) => m.name.trim())
            .map((m) => ({
              name: m.name.trim(),
              email: m.email?.trim() || undefined,
              role: m.role?.trim() || undefined,
              is_pseudo: m.is_pseudo !== false, // Default to true
            })),
          properties: p.properties
            ? {
                goals: p.properties.goals?.trim() || undefined,
                timelines: p.properties.timelines?.trim() || undefined,
                asks: p.properties.asks && p.properties.asks.filter((a) => a.title.trim() || a.description.trim()).length > 0
                  ? p.properties.asks.filter((a) => a.title.trim() || a.description.trim()).map((a) => ({
                      title: a.title.trim(),
                      description: a.description.trim(),
                    }))
                  : undefined,
              }
            : undefined,
        }))

      const result = await createHumanPortfolioWithProjects({
        name: name.trim(),
        email: email.trim(),
        description: description.trim() || undefined,
        joined_community: joinedCommunity.trim() || undefined,
        is_pseudo: isPseudo,
        properties: Object.keys(propertiesEntries).length > 0 ? propertiesEntries : undefined,
        projects: validProjects.length > 0 ? validProjects : undefined,
      })

      if (result.success) {
        if (onSuccess) {
          onSuccess()
        }
      } else {
        setError(result.error || 'Failed to create human portfolio')
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card variant="default">
        <div className="space-y-4">
          <div>
            <Title>Human Portfolio</Title>
            <UIText className="mt-1">Create or update a human portfolio with associated projects</UIText>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <UIText className="text-red-700">{error}</UIText>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block mb-1">
                <UIText>Name *</UIText>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Full name"
              />
            </div>

            <div>
              <label htmlFor="email" className="block mb-1">
                <UIText>Email *</UIText>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="email@example.com"
              />
            </div>

            <div>
              <label htmlFor="description" className="block mb-1">
                <UIText>Description</UIText>
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Human portfolio description"
              />
            </div>

            <div>
              <label htmlFor="joined_community" className="block mb-1">
                <UIText>Joined Community (Portfolio ID)</UIText>
              </label>
              <input
                id="joined_community"
                type="text"
                value={joinedCommunity}
                onChange={(e) => setJoinedCommunity(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Community portfolio ID (optional)"
              />
            </div>

            <div className="border-t pt-4">
              <Subtitle className="mb-3">Properties</Subtitle>
              <div className="space-y-4">
                <div>
                  <label htmlFor="current_location" className="block mb-1">
                    <UIText>Current Location</UIText>
                  </label>
                  <input
                    id="current_location"
                    type="text"
                    value={humanProperties.current_location}
                    onChange={(e) =>
                      setHumanProperties({ ...humanProperties, current_location: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Current location"
                  />
                </div>
                <div>
                  <label htmlFor="availability" className="block mb-1">
                    <UIText>Availability</UIText>
                  </label>
                  <input
                    id="availability"
                    type="text"
                    value={humanProperties.availability}
                    onChange={(e) =>
                      setHumanProperties({ ...humanProperties, availability: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Availability"
                  />
                </div>
                <div>
                  <label htmlFor="social_preferences" className="block mb-1">
                    <UIText>Social Preferences</UIText>
                  </label>
                  <input
                    id="social_preferences"
                    type="text"
                    value={humanProperties.social_preferences}
                    onChange={(e) =>
                      setHumanProperties({ ...humanProperties, social_preferences: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Social preferences"
                  />
                </div>
                <div>
                  <label htmlFor="preferred_contact_method" className="block mb-1">
                    <UIText>Preferred Contact Method</UIText>
                  </label>
                  <input
                    id="preferred_contact_method"
                    type="text"
                    value={humanProperties.preferred_contact_method}
                    onChange={(e) =>
                      setHumanProperties({ ...humanProperties, preferred_contact_method: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Preferred contact method"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center">
              <input
                id="is_pseudo"
                type="checkbox"
                checked={isPseudo}
                onChange={(e) => setIsPseudo(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="is_pseudo" className="ml-2">
                <UIText>Pseudo Status (hidden from customer search)</UIText>
              </label>
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Subtitle>Projects</Subtitle>
            <UIText className="mt-1">Add projects owned by this human portfolio</UIText>
          </div>
          <Button type="button" variant="secondary" onClick={addProject}>
            Add Project
          </Button>
        </div>

        {projects.map((project, projectIndex) => (
          <Card key={projectIndex} variant="default">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Subtitle>Project {projectIndex + 1}</Subtitle>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => removeProject(projectIndex)}
                >
                  Remove
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block mb-1">
                    <UIText>Project Name</UIText>
                  </label>
                  <input
                    type="text"
                    value={project.name}
                    onChange={(e) => updateProject(projectIndex, { name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Project name (optional)"
                  />
                </div>

                <div>
                  <label className="block mb-1">
                    <UIText>Description</UIText>
                  </label>
                  <textarea
                    value={project.description || ''}
                    onChange={(e) => updateProject(projectIndex, { description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Project description"
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

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={project.is_pseudo}
                    onChange={(e) =>
                      updateProject(projectIndex, { is_pseudo: e.target.checked })
                    }
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label className="ml-2">
                    <UIText>Pseudo Status</UIText>
                  </label>
                </div>

                <div className="border-t pt-4">
                  <Subtitle className="mb-3">Properties</Subtitle>
                  <div className="space-y-4">
                    <div>
                      <label className="block mb-1">
                        <UIText>Goals</UIText>
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Project goals"
                      />
                    </div>
                    <div>
                      <label className="block mb-1">
                        <UIText>Timelines</UIText>
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Project timelines"
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
                                <UIText>Title</UIText>
                              </label>
                              <input
                                type="text"
                                value={ask.title}
                                onChange={(e) => updateAsk(projectIndex, askIndex, { title: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Ask title"
                              />
                            </div>
                            <div>
                              <label className="block mb-1">
                                <UIText>Description</UIText>
                              </label>
                              <textarea
                                value={ask.description}
                                onChange={(e) => updateAsk(projectIndex, askIndex, { description: e.target.value })}
                                rows={2}
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Ask description"
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
                            <UIText>Name</UIText>
                          </label>
                          <input
                            type="text"
                            value={member.name}
                            onChange={(e) =>
                              updateMember(projectIndex, memberIndex, { name: e.target.value })
                            }
                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Member name (optional)"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">
                            <UIText>Email (optional)</UIText>
                          </label>
                          <input
                            type="email"
                            value={member.email || ''}
                            onChange={(e) =>
                              updateMember(projectIndex, memberIndex, { email: e.target.value })
                            }
                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="member@example.com"
                          />
                        </div>
                        <div>
                          <label className="block mb-1">
                            <UIText>Role (optional, max 2 words)</UIText>
                          </label>
                          <input
                            type="text"
                            value={member.role || ''}
                            onChange={(e) =>
                              updateMember(projectIndex, memberIndex, { role: e.target.value })
                            }
                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g., Lead Developer"
                          />
                        </div>
                        {member.email && (
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={member.is_pseudo !== false} // Default to true
                              onChange={(e) =>
                                updateMember(projectIndex, memberIndex, { is_pseudo: e.target.checked })
                              }
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <label className="ml-2">
                              <UIText>Pseudo Status (hidden from customer search)</UIText>
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex gap-4 justify-end">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? 'Creating...' : 'Create Human Portfolio'}
        </Button>
      </div>
    </form>
  )
}

