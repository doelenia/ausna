'use client'

import { useState, useEffect } from 'react'
import { Button, Card, Title, Subtitle, Content, UIText } from '@/components/ui'
import { CreateHumanPortfolioForm } from './CreateHumanPortfolioForm'
import { FormSubmissionView } from './FormSubmissionView'
import { FormConfigEditor } from './FormConfigEditor'
import { PublicUploadFormSubmission } from '@/types/public-upload-form'

function IdCell({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="group relative flex items-center gap-2">
      <span className="text-sm text-gray-600 font-mono truncate max-w-[120px]">{id}</span>
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
        title="Copy ID"
      >
        {copied ? '✓' : '📋'}
      </button>
    </div>
  )
}

export function UploadFormsTab() {
  const [submissions, setSubmissions] = useState<PublicUploadFormSubmission[]>([])
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showConfigEditor, setShowConfigEditor] = useState(false)
  const [selectedSubmission, setSelectedSubmission] = useState<PublicUploadFormSubmission | null>(null)

  const loadSubmissions = async () => {
    setLoading(true)
    setError(null)
    try {
      const statusParam = filterStatus === 'all' ? '' : `?status=${filterStatus}`
      const response = await fetch(`/api/public-upload-forms${statusParam}`)

      if (!response.ok) {
        let errorMessage = 'Failed to load submissions'
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage
        }
        throw new Error(errorMessage)
      }

      const data = await response.json()
      // Ensure we always have an array, even if the response is null/undefined
      const submissionsArray = Array.isArray(data) ? data : []
      setSubmissions(submissionsArray)
      // Clear error if we successfully got data (even if empty)
      setError(null)
    } catch (err: any) {
      console.error('Error loading submissions:', err)
      setError(err.message || 'An error occurred while loading submissions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSubmissions()
  }, [filterStatus])

  const handleApprove = async (submissionId: string) => {
    setActionLoading(submissionId)
    try {
      const response = await fetch(`/api/public-upload-forms/${submissionId}/approve`, {
        method: 'POST',
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to approve submission')
      }

      await loadSubmissions()
      if (selectedSubmission?.id === submissionId) {
        setSelectedSubmission(null)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (submissionId: string) => {
    if (
      !confirm(
        'Delete this submission? This action cannot be undone.'
      )
    ) {
      return
    }

    setActionLoading(submissionId)
    setError(null)
    try {
      const response = await fetch(`/api/public-upload-forms/${submissionId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to delete submission')
      }

      await loadSubmissions()
      if (selectedSubmission?.id === submissionId) {
        setSelectedSubmission(null)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setActionLoading(null)
    }
  }

  const getSubmissionName = (submission: PublicUploadFormSubmission) => {
    return submission.submission_data.name || 'Unknown'
  }

  const getSubmissionEmail = (submission: PublicUploadFormSubmission) => {
    return submission.submission_data.email || 'Unknown'
  }

  return (
    <div className="space-y-6">
      {/* Header with buttons */}
      <div className="flex justify-between items-center">
        <div>
          <Title>Upload Forms</Title>
          <UIText className="mt-1">
            Manage public form submissions and create human portfolios.{' '}
            <a
              href="/public-upload-form-minerva"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              View public form
            </a>
          </UIText>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowConfigEditor(true)}>
            Edit Form
          </Button>
          <Button variant="primary" onClick={() => setShowCreateForm(true)}>
            Create Human Portfolio
          </Button>
        </div>
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <Title>Create Human Portfolio</Title>
              <button
                onClick={() => setShowCreateForm(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <CreateHumanPortfolioForm
              onSuccess={() => {
                setShowCreateForm(false)
                loadSubmissions()
              }}
              onCancel={() => setShowCreateForm(false)}
            />
          </div>
        </div>
      )}

      {/* Form Config Editor Modal */}
      {showConfigEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <Title>Edit Form Configuration</Title>
              <button
                onClick={() => setShowConfigEditor(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <FormConfigEditor
              onSuccess={() => {
                setShowConfigEditor(false)
              }}
              onCancel={() => setShowConfigEditor(false)}
            />
          </div>
        </div>
      )}

      {/* Submission Viewer Modal */}
      {selectedSubmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <Title>View Submission</Title>
              <button
                onClick={() => setSelectedSubmission(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <FormSubmissionView
              submission={selectedSubmission}
              onApprove={handleApprove}
              onDelete={handleDelete}
              onUpdate={loadSubmissions}
              onClose={() => setSelectedSubmission(null)}
              actionLoading={actionLoading}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Status Filter */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilterStatus('all')}
          className={`px-4 py-2 rounded-lg text-sm transition-colors ${
            filterStatus === 'all'
              ? 'bg-gray-200 text-gray-700'
              : 'text-gray-700 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilterStatus('pending')}
          className={`px-4 py-2 rounded-lg text-sm transition-colors ${
            filterStatus === 'pending'
              ? 'bg-gray-200 text-gray-700'
              : 'text-gray-700 hover:bg-gray-200'
          }`}
        >
          Pending
        </button>
        <button
          onClick={() => setFilterStatus('approved')}
          className={`px-4 py-2 rounded-lg text-sm transition-colors ${
            filterStatus === 'approved'
              ? 'bg-gray-200 text-gray-700'
              : 'text-gray-700 hover:bg-gray-200'
          }`}
        >
          Approved
        </button>
        <button
          onClick={() => setFilterStatus('rejected')}
          className={`px-4 py-2 rounded-lg text-sm transition-colors ${
            filterStatus === 'rejected'
              ? 'bg-gray-200 text-gray-700'
              : 'text-gray-700 hover:bg-gray-200'
          }`}
        >
          Rejected
        </button>
      </div>

      {/* Submissions Table */}
      <div>
        <Subtitle className="mb-4">
          Submissions ({submissions.length})
        </Subtitle>
        {loading ? (
          <div className="text-gray-500">Loading submissions...</div>
        ) : submissions.length === 0 ? (
          <div className="text-gray-500">No submissions found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Submitted
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {submissions.map((submission) => (
                  <tr
                    key={submission.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedSubmission(submission)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <IdCell id={submission.id} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {getSubmissionEmail(submission)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {getSubmissionName(submission)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          submission.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : submission.status === 'rejected'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {submission.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(submission.submitted_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedSubmission(submission)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View
                      </button>
                      {submission.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(submission.id)}
                            disabled={actionLoading === submission.id}
                            className="text-green-600 hover:text-green-800 disabled:opacity-50"
                          >
                            {actionLoading === submission.id ? 'Approving...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleDelete(submission.id)}
                            disabled={actionLoading === submission.id}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            {actionLoading === submission.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

