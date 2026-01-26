'use client'

import { useState, useEffect } from 'react'
import { Button, Card, Title, Subtitle, Content, UIText } from '@/components/ui'
import { PublicUploadFormConfig, QuestionConfig } from '@/types/public-upload-form'

interface FormConfigEditorProps {
  onSuccess?: () => void
  onCancel?: () => void
}

export function FormConfigEditor({ onSuccess, onCancel }: FormConfigEditorProps) {
  const [config, setConfig] = useState<PublicUploadFormConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/public-upload-form-config')
      if (!response.ok) {
        throw new Error('Failed to load form config')
      }
      const data = await response.json()
      setConfig(data)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!config) return

    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/public-upload-form-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: config.title,
          intro_paragraph: config.intro_paragraph,
          outro_paragraph: config.outro_paragraph,
          activities_section_paragraph: config.activities_section_paragraph,
          asks_section_paragraph: config.asks_section_paragraph,
          members_section_paragraph: config.members_section_paragraph,
          question_configs: config.question_configs,
        }),
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to update form config')
      }

      if (onSuccess) {
        onSuccess()
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const updateQuestionConfig = (index: number, updates: Partial<QuestionConfig>) => {
    if (!config) return
    const updated = [...config.question_configs]
    const current = updated[index]
    
    // If changing from multiple choice to string, remove options
    if (updates.type === 'string' && current.type !== 'string') {
      updates.options = undefined
    }
    
    // If changing to multiple choice and no options exist, initialize empty array
    if ((updates.type === 'single-select' || updates.type === 'multi-select') && !current.options) {
      updates.options = ['']
    }
    
    updated[index] = { ...current, ...updates }
    setConfig({ ...config, question_configs: updated })
  }

  const addOption = (questionIndex: number) => {
    if (!config) return
    const updated = [...config.question_configs]
    const question = updated[questionIndex]
    const currentOptions = question.options || []
    updated[questionIndex] = {
      ...question,
      options: [...currentOptions, '']
    }
    setConfig({ ...config, question_configs: updated })
  }

  const removeOption = (questionIndex: number, optionIndex: number) => {
    if (!config) return
    const updated = [...config.question_configs]
    const question = updated[questionIndex]
    const currentOptions = question.options || []
    updated[questionIndex] = {
      ...question,
      options: currentOptions.filter((_, i) => i !== optionIndex)
    }
    setConfig({ ...config, question_configs: updated })
  }

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    if (!config) return
    const updated = [...config.question_configs]
    const question = updated[questionIndex]
    const currentOptions = [...(question.options || [])]
    currentOptions[optionIndex] = value
    updated[questionIndex] = {
      ...question,
      options: currentOptions
    }
    setConfig({ ...config, question_configs: updated })
  }

  if (loading) {
    return <div className="text-gray-500">Loading form configuration...</div>
  }

  if (!config) {
    return <div className="text-red-500">Failed to load form configuration</div>
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <UIText className="text-red-700">{error}</UIText>
        </div>
      )}

      <Card variant="default">
        <div className="space-y-4">
          <div>
            <label className="block mb-1">
              <UIText>Form Title *</UIText>
            </label>
            <input
              type="text"
              value={config.title}
              onChange={(e) => setConfig({ ...config, title: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Portfolio Submission Form"
            />
          </div>

          <div>
            <label className="block mb-1">
              <UIText>Introduction Paragraph * (Markdown supported)</UIText>
            </label>
            <textarea
              value={config.intro_paragraph}
              onChange={(e) => setConfig({ ...config, intro_paragraph: e.target.value })}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Please fill out this form... (Use **bold** or *italic* for formatting)"
            />
          </div>

          <div>
            <label className="block mb-1">
              <UIText>Closing Paragraph * (Markdown supported)</UIText>
            </label>
            <textarea
              value={config.outro_paragraph}
              onChange={(e) => setConfig({ ...config, outro_paragraph: e.target.value })}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Thank you for your submission... (Use **bold** or *italic* for formatting)"
            />
          </div>
          <div>
            <label className="block mb-1">
              <UIText>Activities Section Paragraph * (Markdown supported)</UIText>
            </label>
            <textarea
              value={config.activities_section_paragraph}
              onChange={(e) => setConfig({ ...config, activities_section_paragraph: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Add activities owned by this portfolio... (Use **bold** or *italic* for formatting)"
            />
          </div>
          <div>
            <label className="block mb-1">
              <UIText>Asks Section Paragraph * (Markdown supported)</UIText>
            </label>
            <textarea
              value={config.asks_section_paragraph}
              onChange={(e) => setConfig({ ...config, asks_section_paragraph: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="List what you are asking for or need help with... (Use **bold** or *italic* for formatting)"
            />
          </div>
          <div>
            <label className="block mb-1">
              <UIText>Members Section Paragraph * (Markdown supported)</UIText>
            </label>
            <textarea
              value={config.members_section_paragraph}
              onChange={(e) => setConfig({ ...config, members_section_paragraph: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Add members who are part of this activity... (Use **bold** or *italic* for formatting)"
            />
          </div>
        </div>
      </Card>

      <Card variant="default">
        <div className="space-y-4">
          <div>
            <Subtitle>Question Configurations</Subtitle>
            <UIText className="text-sm text-gray-600">
              Edit the label for each form field. The description is shown for reference to help you understand what each question is intended to ask.
            </UIText>
          </div>

          <div className="space-y-4">
            {config.question_configs.map((question, index) => {
              const questionType = question.type || 'string'
              const isMultipleChoice = questionType === 'single-select' || questionType === 'multi-select'
              
              return (
                <div key={index} className="p-4 border border-gray-200 rounded-md">
                  <div className="space-y-3">
                    <div>
                      <UIText className="font-semibold">{question.field_key}</UIText>
                      <div className="mt-1 w-full px-4 py-2 border border-gray-200 bg-gray-50 rounded-md">
                        <Content className="text-gray-700 text-sm">{question.description}</Content>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block mb-1">
                        <UIText>Question Type</UIText>
                      </label>
                      <select
                        value={questionType}
                        onChange={(e) => updateQuestionConfig(index, { type: e.target.value as 'string' | 'single-select' | 'multi-select' })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="string">Text Input</option>
                        <option value="single-select">Single Select (Multiple Choice)</option>
                        <option value="multi-select">Multi Select (Multiple Choice)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block mb-1">
                        <UIText>Label (Markdown supported)</UIText>
                      </label>
                      <textarea
                        value={question.label}
                        onChange={(e) => updateQuestionConfig(index, { label: e.target.value })}
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                        placeholder="Supports markdown: **bold**, *italic*, line breaks, etc."
                      />
                      <UIText className="text-xs text-gray-500 mt-1">
                        Preview: {question.label || '(empty)'}
                      </UIText>
                    </div>

                    {!isMultipleChoice && (
                      <div>
                        <label className="block mb-1">
                          <UIText>Placeholder (optional)</UIText>
                        </label>
                        <input
                          type="text"
                          value={question.placeholder || ''}
                          onChange={(e) => updateQuestionConfig(index, { placeholder: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter placeholder text"
                        />
                      </div>
                    )}

                    {isMultipleChoice && (
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="block">
                              <UIText>Options *</UIText>
                            </label>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => addOption(index)}
                            >
                              Add Option
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {(question.options || []).map((option, optionIndex) => (
                              <div key={optionIndex} className="flex gap-2 items-center">
                                <input
                                  type="text"
                                  value={option}
                                  onChange={(e) => updateOption(index, optionIndex, e.target.value)}
                                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder={`Option ${optionIndex + 1}`}
                                />
                                {(question.options || []).length > 1 && (
                                  <Button
                                    type="button"
                                    variant="danger"
                                    size="sm"
                                    onClick={() => removeOption(index, optionIndex)}
                                  >
                                    Remove
                                  </Button>
                                )}
                              </div>
                            ))}
                            {(!question.options || question.options.length === 0) && (
                              <UIText className="text-sm text-gray-500">
                                No options yet. Click "Add Option" to add choices.
                              </UIText>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={question.allowOther || false}
                              onChange={(e) => updateQuestionConfig(index, { allowOther: e.target.checked })}
                              className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 rounded"
                            />
                            <UIText>Allow "Other" option with custom text input</UIText>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      <div className="flex gap-4 justify-end pt-4 border-t">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>
    </div>
  )
}

