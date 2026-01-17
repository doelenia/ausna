'use client'

import { useState, useEffect } from 'react'
import { searchNotes, deleteNote } from '@/app/admin/actions'
import Link from 'next/link'

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
      <span className="text-xs text-gray-600 font-mono truncate max-w-[100px]">{id}</span>
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

interface Note {
  id: string
  text: string
  owner_account_id: string
  owner_name: string | null
  created_at: string
  assigned_portfolios: string[]
}

export function NotesTab() {
  const [notes, setNotes] = useState<Note[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)

  const loadNotes = async (currentPage: number = 1) => {
    setLoading(true)
    setError(null)
    try {
      const result = await searchNotes(searchQuery, currentPage, 10)
      if (result.success) {
        setNotes(result.notes || [])
        setTotal(result.total || 0)
        setTotalPages(result.totalPages || 0)
        setPage(currentPage)
      } else {
        setError(result.error || 'Failed to search notes')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    setPage(1)
    await loadNotes(1)
  }

  useEffect(() => {
    // Load all notes on mount
    loadNotes(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
      return
    }

    setActionLoading(noteId)
    try {
      const result = await deleteNote(noteId)
      if (result.success) {
        // Reload current page after deletion
        await loadNotes(page)
      } else {
        setError(result.error || 'Failed to delete note')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="flex gap-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search by creator name, content, or ID..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
        <button
          onClick={() => {
            setSearchQuery('')
            setPage(1)
            loadNotes(1)
          }}
          className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
        >
          Clear
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Notes {total > 0 && `(${total} total)`}
        </h2>
        {loading ? (
          <div className="text-gray-500">Loading notes...</div>
        ) : notes.length === 0 ? (
          <div className="text-gray-500">
            {searchQuery ? 'No notes found. Try a different search term.' : 'No notes found.'}
          </div>
        ) : (
          <>
            <div className="space-y-4 mb-6">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <IdCell id={note.id} />
                        <span className="text-gray-400">•</span>
                        <Link
                          href={`/notes/${note.id}`}
                          className="text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                          prefetch={true}
                        >
                          View Note
                        </Link>
                        <span className="text-gray-400">•</span>
                        <span className="text-sm text-gray-500">
                          {note.owner_name || 'Unknown'} • {new Date(note.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 line-clamp-3">{note.text}</p>
                      {note.assigned_portfolios.length > 0 && (
                        <div className="mt-2 text-xs text-gray-500">
                          Assigned to {note.assigned_portfolios.length} portfolio(s)
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(note.id)}
                      disabled={actionLoading === note.id}
                      className="ml-4 px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === note.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                <div className="text-sm text-gray-700">
                  Page {page} of {totalPages} ({total} total)
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadNotes(page - 1)}
                    disabled={page <= 1 || loading}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => loadNotes(page + 1)}
                    disabled={page >= totalPages || loading}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

