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
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                py-4 px-6 text-sm font-medium border-b-2 transition-colors
                ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
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

