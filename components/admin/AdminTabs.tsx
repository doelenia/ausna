'use client'

import { useState } from 'react'
import { UsersTab } from './UsersTab'
import { NotesTab } from './NotesTab'
import { ProjectsTab } from './ProjectsTab'
import { CommunitiesTab } from './CommunitiesTab'

type Tab = 'users' | 'notes' | 'projects' | 'communities'

export function AdminTabs() {
  const [activeTab, setActiveTab] = useState<Tab>('users')

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'users', label: 'Users/Human' },
    { id: 'notes', label: 'Notes' },
    { id: 'projects', label: 'Projects' },
    { id: 'communities', label: 'Communities' },
  ]

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Tab Navigation */}
      <div className="p-6 pb-0">
        <nav className="flex gap-2" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={(e) => {
                e.preventDefault()
                setActiveTab(tab.id)
              }}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'notes' && <NotesTab />}
        {activeTab === 'projects' && <ProjectsTab />}
        {activeTab === 'communities' && <CommunitiesTab />}
      </div>
    </div>
  )
}


