'use client'

import { useState } from 'react'
import { Button, Card, Title, Subtitle, Content, UIText } from '@/components/ui'
import { PublicUploadFormSubmission } from '@/types/public-upload-form'
import { CreateHumanPortfolioInput } from '@/app/admin/actions'
import { ProjectTypeSelector } from '@/components/portfolio/ProjectTypeSelector'

interface FormSubmissionViewProps {
  submission: PublicUploadFormSubmission
  onApprove: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReprocess?: (id: string) => Promise<void>
  onUpdate: () => Promise<void>
  onClose: () => void
  actionLoading: string | null
}

export function FormSubmissionView({
  submission,
  onApprove,
  onDelete,
  onReprocess,
  onUpdate,
  onClose,
  actionLoading,
}: FormSubmissionViewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedData, setEditedData] = useState<CreateHumanPortfolioInput>(submission.submission_data)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/public-upload-forms/${submission.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_data: editedData }),
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to update submission')
      }

      await onUpdate()
      setIsEditing(false)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const handleApproveClick = async () => {
    if (isEditing) {
      await handleSave()
    }
    await onApprove(submission.id)
  }

  const data = isEditing ? editedData : submission.submission_data

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <UIText className="text-red-700">{error}</UIText>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <Title>Submission Details</Title>
          <UIText className="mt-1">
            Status: <span className="font-semibold">{submission.status}</span>
          </UIText>
          <UIText className="text-sm text-gray-500">
            Submitted: {new Date(submission.submitted_at).toLocaleString()}
          </UIText>
          {submission.approved_at && (
            <UIText className="text-sm text-gray-500">
              Approved: {new Date(submission.approved_at).toLocaleString()}
            </UIText>
          )}
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <Button variant="secondary" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => {
                setIsEditing(false)
                setEditedData(submission.submission_data)
                setError(null)
              }}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          )}
        </div>
      </div>

      <Card variant="default">
        <div className="space-y-4">
          <Subtitle>Human Portfolio</Subtitle>
          <div className="space-y-4">
            <div>
              <label className="block mb-1">
                <UIText>Name *</UIText>
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={data.name}
                  onChange={(e) => setEditedData({ ...editedData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <Content>{data.name}</Content>
              )}
            </div>

            <div>
              <label className="block mb-1">
                <UIText>Email *</UIText>
              </label>
              {isEditing ? (
                <input
                  type="email"
                  value={data.email}
                  onChange={(e) => setEditedData({ ...editedData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <Content>{data.email}</Content>
              )}
            </div>

            <div>
              <label className="block mb-1">
                <UIText>Description</UIText>
              </label>
              {isEditing ? (
                <textarea
                  value={data.description || ''}
                  onChange={(e) => setEditedData({ ...editedData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <Content>{data.description || '-'}</Content>
              )}
            </div>

            {data.properties && (
              <div className="border-t pt-4">
                <Subtitle className="mb-3">Properties</Subtitle>
                <div className="space-y-2">
                  <div>
                    <UIText className="font-semibold">Current Location:</UIText>
                    {isEditing ? (
                      <input
                        type="text"
                        value={data.properties.current_location || ''}
                        onChange={(e) =>
                          setEditedData({
                            ...editedData,
                            properties: { ...data.properties, current_location: e.target.value },
                          })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                      />
                    ) : (
                      <Content>{data.properties.current_location || '-'}</Content>
                    )}
                  </div>
                  <div>
                    <UIText className="font-semibold">Availability:</UIText>
                    {isEditing ? (
                      <input
                        type="text"
                        value={data.properties.availability || ''}
                        onChange={(e) =>
                          setEditedData({
                            ...editedData,
                            properties: { ...data.properties, availability: e.target.value },
                          })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                      />
                    ) : (
                      <Content>{data.properties.availability || '-'}</Content>
                    )}
                  </div>
                  <div>
                    <UIText className="font-semibold">Social Preferences:</UIText>
                    {isEditing ? (
                      <input
                        type="text"
                        value={data.properties.social_preferences || ''}
                        onChange={(e) =>
                          setEditedData({
                            ...editedData,
                            properties: { ...data.properties, social_preferences: e.target.value },
                          })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                      />
                    ) : (
                      <Content>{data.properties.social_preferences || '-'}</Content>
                    )}
                  </div>
                  <div>
                    <UIText className="font-semibold">Preferred Contact Method:</UIText>
                    {isEditing ? (
                      <input
                        type="text"
                        value={data.properties.preferred_contact_method || ''}
                        onChange={(e) =>
                          setEditedData({
                            ...editedData,
                            properties: { ...data.properties, preferred_contact_method: e.target.value },
                          })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                      />
                    ) : (
                      <Content>{data.properties.preferred_contact_method || '-'}</Content>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <Subtitle>Projects ({data.projects?.length || 0})</Subtitle>
        {(data.projects || []).map((project, projectIndex) => (
          <Card key={projectIndex} variant="default">
            <div className="space-y-4">
              <Subtitle>Project {projectIndex + 1}</Subtitle>
              <div className="space-y-2">
                <div>
                  <UIText className="font-semibold">Name:</UIText>
                  {isEditing ? (
                    <input
                      type="text"
                      value={project.name}
                      onChange={(e) => {
                        const updatedProjects = [...(editedData.projects || [])]
                        updatedProjects[projectIndex] = { ...project, name: e.target.value }
                        setEditedData({ ...editedData, projects: updatedProjects })
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                    />
                  ) : (
                    <Content>{project.name}</Content>
                  )}
                </div>
                <div>
                  <UIText className="font-semibold">Description:</UIText>
                  {isEditing ? (
                    <textarea
                      value={project.description || ''}
                      onChange={(e) => {
                        const updatedProjects = [...(editedData.projects || [])]
                        updatedProjects[projectIndex] = { ...project, description: e.target.value }
                        setEditedData({ ...editedData, projects: updatedProjects })
                      }}
                      rows={2}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                    />
                  ) : (
                    <Content>{project.description || '-'}</Content>
                  )}
                </div>
                <div>
                  <UIText className="font-semibold">Type:</UIText>
                  {isEditing ? (
                    <div className="mt-1">
                      <ProjectTypeSelector
                        generalCategory={project.project_type_general}
                        specificType={project.project_type_specific}
                        onSelect={(general, specific) => {
                          const updatedProjects = [...(editedData.projects || [])]
                          updatedProjects[projectIndex] = {
                            ...project,
                            project_type_general: general,
                            project_type_specific: specific,
                          }
                          setEditedData({ ...editedData, projects: updatedProjects })
                        }}
                        disabled={false}
                      />
                    </div>
                  ) : (
                    <Content>
                      {project.project_type_general} → {project.project_type_specific}
                    </Content>
                  )}
                </div>
                {project.properties && (
                  <div>
                    <UIText className="font-semibold">Goals:</UIText>
                    {isEditing ? (
                      <input
                        type="text"
                        value={project.properties.goals || ''}
                        onChange={(e) => {
                          const updatedProjects = [...(editedData.projects || [])]
                          updatedProjects[projectIndex] = {
                            ...project,
                            properties: { ...project.properties, goals: e.target.value },
                          }
                          setEditedData({ ...editedData, projects: updatedProjects })
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                      />
                    ) : (
                      <Content>{project.properties.goals || '-'}</Content>
                    )}
                  </div>
                )}
                <div>
                  <UIText className="font-semibold">Members ({(project.members || []).length}):</UIText>
                  <div className="mt-2 space-y-2">
                    {(project.members || []).map((member, memberIndex) => (
                      <div key={memberIndex} className="p-2 bg-gray-50 rounded">
                        <Content>
                          {member.name} {member.role && `(${member.role})`} {member.email && `- ${member.email}`}
                        </Content>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {submission.notes && (
        <Card variant="default">
          <Subtitle>Admin Notes</Subtitle>
          <Content>{submission.notes}</Content>
        </Card>
      )}

      <div className="flex gap-4 justify-end pt-4 border-t">
        {submission.status === 'pending' && (
          <>
            <Button
              variant="danger"
              onClick={() => onDelete(submission.id)}
              disabled={actionLoading === submission.id}
            >
              {actionLoading === submission.id ? 'Deleting...' : 'Delete'}
            </Button>
            <Button
              variant="primary"
              onClick={handleApproveClick}
              disabled={actionLoading === submission.id || saving}
            >
              {actionLoading === submission.id ? 'Approving...' : 'Approve & Process'}
            </Button>
          </>
        )}
        {submission.status === 'approved' && onReprocess && (
          <Button
            variant="secondary"
            onClick={() => onReprocess(submission.id)}
            disabled={actionLoading === submission.id}
          >
            {actionLoading === submission.id ? 'Reprocessing...' : 'Reprocess'}
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}

