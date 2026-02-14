'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { Title, Subtitle, Content, UIText, Card } from '@/components/ui'
import { SimpleBarChart } from './SimpleBarChart'
import { MatchSearchResults } from './MatchSearchResults'
import { MatchUserDetail } from './MatchUserDetail'
import { searchMatches, getAdminDemoPreference } from '@/app/admin/actions'
import {
  getDemoDisplayName,
  maskDescription,
  maskEmail,
} from '@/lib/admin/demoAnonymization'

interface User {
  id: string
  email: string
  username: string | null
  name: string | null
  created_at: string
  is_blocked: boolean
  human_portfolio_id: string | null
}

interface HumanPortfolio {
  id: string
  metadata: any
  created_at: string
  updated_at: string
}

interface Project {
  id: string
  name: string
  metadata: any
  created_at: string
  updated_at: string
  user_id: string
}

interface Note {
  id: string
  text: string
  created_at: string
  assigned_portfolios: string[]
}

interface MatchConsoleProps {
  user: User
  humanPortfolio?: HumanPortfolio
  projects: Project[]
  notes: Note[]
  searcherInterests?: Array<{ topicId: string; topicName: string; aggregateScore: number }>
}

type Tab = 'profile' | 'projects'

export function MatchConsole({ user, humanPortfolio, projects, notes, searcherInterests = [] }: MatchConsoleProps) {
  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<
    Array<{
      userId: string
      email: string
      username: string | null
      name: string | null
      score: number
      description: string | null
    }>
  >([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedUserSummary, setSelectedUserSummary] = useState<{
    userId: string
    email: string
    username: string | null
    name: string | null
  } | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [demoEnabled, setDemoEnabled] = useState(false)
  const [preferenceLoaded, setPreferenceLoaded] = useState(false)
  const [matchDetails, setMatchDetails] = useState<{
    forwardDetails?: Record<
      string,
      Array<{
        searchingAsk: string
        searchingAskId: string
        maxSimilarity: number
        matchedKnowledgeText: string
        matchedKnowledgeId: string
      }>
    >
    backwardDetails?: Record<
      string,
      Array<{
        searchingNonAsk: string
        searchingNonAskId: string
        maxSimilarity: number
        matchedAskText: string
        matchedKnowledgeId: string
      }>
    >
    topicDetails?: Record<
      string,
      Array<{
        searcherTopicId: string
        searcherTopicName: string
        targetTopicId: string
        targetTopicName: string
        similarity: number
        multiplier: number
      }>
    >
    specificDetails?: Record<
      string,
      Array<{
        searchingAsk: string
        maxSimilarity: number
        matchedKnowledgeText: string
        matchedKnowledgeId?: string
      }>
    >
  } | null>(null)

  // Load admin's demo anonymization preference first so list is censored from first paint
  useEffect(() => {
    let cancelled = false
    getAdminDemoPreference().then((res) => {
      if (!cancelled) {
        if (res.success && res.enabled !== undefined) {
          setDemoEnabled(res.enabled)
        }
        setPreferenceLoaded(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Avoid duplicate searches (e.g., React Strict Mode double effects or redundant calls)
  const lastSearchKeywordRef = useRef<string | null>(null)
  const inFlightKeywordRef = useRef<string | null>(null)
  const hasMountedRef = useRef(false)

  // Extract profile metadata for charts
  const profileMetadata = humanPortfolio?.metadata || {}
  const basic = profileMetadata.basic || {}
  const rawDescription =
    basic.description && typeof basic.description === 'string' && basic.description.trim()
      ? basic.description.trim()
      : null
  const description = demoEnabled ? maskDescription(rawDescription, true) : rawDescription
  const skills = profileMetadata.skills || []
  const experience = profileMetadata.experience || []
  const education = profileMetadata.education || []
  const properties = profileMetadata.properties || {}

  // Extract project metadata for charts
  const projectTypes: { [key: string]: number } = {}
  const projectStatuses: { [key: string]: number } = {}
  const technologies: { [key: string]: number } = {}
  const notesByProject: { [key: string]: number } = {}

  projects.forEach((project) => {
    const metadata = project.metadata || {}
    const projectType = metadata.project_type_specific || 'Unknown'
    const status = metadata.status || 'Unknown'
    const techs = metadata.technologies || []

    projectTypes[projectType] = (projectTypes[projectType] || 0) + 1
    projectStatuses[status] = (projectStatuses[status] || 0) + 1

    techs.forEach((tech: string) => {
      technologies[tech] = (technologies[tech] || 0) + 1
    })
  })

  // Count notes by project
  notes.forEach((note) => {
    note.assigned_portfolios.forEach((portfolioId) => {
      const project = projects.find((p) => p.id === portfolioId)
      if (project) {
        notesByProject[project.name] = (notesByProject[project.name] || 0) + 1
      }
    })
  })

  // Prepare chart data
  const skillsChartData = skills.map((skill: string) => ({
    label: skill,
    value: 1,
  }))

  const projectTypesChartData = Object.entries(projectTypes).map(([label, value]) => ({
    label,
    value,
  }))

  const projectStatusesChartData = Object.entries(projectStatuses).map(([label, value]) => ({
    label,
    value,
  }))

  const technologiesChartData = Object.entries(technologies)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, value]) => ({
      label,
      value,
    }))

  const notesByProjectChartData = Object.entries(notesByProject)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, value]) => ({
      label,
      value,
    }))

  // Debounced search function
  const performSearch = useCallback(
    async (keyword: string) => {
      const normalizedKeyword = keyword.trim()

      // If this is the same keyword as the last completed search, skip to avoid duplicate work
      if (lastSearchKeywordRef.current === normalizedKeyword) {
        return
      }

      // If there is already an in-flight search for this keyword (e.g. Strict Mode double call), skip
      if (inFlightKeywordRef.current === normalizedKeyword) {
        return
      }

      inFlightKeywordRef.current = normalizedKeyword
      setIsSearching(true)
      try {
        const result = await searchMatches(user.id, normalizedKeyword || undefined)
        if (result.success && result.matches) {
          setSearchResults(result.matches)
          // Store match details for use in detail view
          setMatchDetails({
            forwardDetails: result.matchDetails?.forwardDetails,
            backwardDetails: result.matchDetails?.backwardDetails,
            topicDetails: result.matchDetails?.topicDetails,
            specificDetails: result.specificDetails,
          })
        } else {
          setSearchResults([])
          setMatchDetails(null)
        }
      } catch (error) {
        console.error('Search error:', error)
        setSearchResults([])
        setMatchDetails(null)
      } finally {
        inFlightKeywordRef.current = null
        setIsSearching(false)
        setHasSearched(true)
        // Mark this keyword as the last completed search
        lastSearchKeywordRef.current = normalizedKeyword
      }
    },
    [user.id]
  )

  // Debounce search input (skip initial mount, rely on explicit initial search effect)
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }

    const timer = setTimeout(() => {
      performSearch(searchKeyword)
    }, 500) // 500ms debounce

    return () => clearTimeout(timer)
  }, [searchKeyword, performSearch])

  // Run initial search only after preference has loaded so displayed list uses correct demo mode
  useEffect(() => {
    if (!preferenceLoaded) return
    performSearch('')
  }, [preferenceLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Derive displayed list so it updates when demoEnabled loads (after getAdminDemoPreference)
  const displayedMatches = useMemo(
    () =>
      demoEnabled
        ? searchResults.map((m) => ({
            ...m,
            name: getDemoDisplayName(m.userId, false, true),
            email: maskEmail(m.email, true),
            description: maskDescription(m.description, true),
          }))
        : searchResults,
    [searchResults, demoEnabled]
  )

  const handleUserClick = (userId: string) => {
    const match = searchResults.find((r) => r.userId === userId)
    if (!match) return
    setSelectedUserSummary({
      userId: match.userId,
      email: demoEnabled ? maskEmail(match.email, true) : match.email,
      username: match.username,
      name: demoEnabled ? getDemoDisplayName(match.userId, false, true) : match.name,
    })
    setSelectedUserId(userId)
  }

  const handleCloseDetail = () => {
    setSelectedUserId(null)
    setSelectedUserSummary(null)
  }

  // If a user is selected, show detail view
  if (selectedUserId) {
    return (
      <MatchUserDetail
        searcherId={user.id}
        targetUserId={selectedUserId}
        searchKeyword={searchKeyword.trim() || undefined}
        matchDetails={matchDetails || undefined}
        targetUserSummary={selectedUserSummary}
        onClose={handleCloseDetail}
        demoEnabled={demoEnabled}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <Link
              href="/admin"
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              ← Back to Admin
            </Link>
          </div>
          <Title as="h1">Match Console</Title>
          <Content as="p" className="mt-2">
            {demoEnabled ? getDemoDisplayName(user.id, true, true) : user.name || user.username || user.email}
          </Content>
        </div>
      </div>

      {/* Description Card - Show searcher's description */}
      {description && (
        <Card variant="default">
          <Subtitle as="h3" className="mb-4">
            About
          </Subtitle>
          <Content>{description}</Content>
          {searcherInterests.length > 0 && (
            <div className="mt-4">
              <UIText className="text-gray-500 text-sm mb-2">Interests:</UIText>
              <div className="flex flex-wrap gap-2">
                {searcherInterests.map((interest) => (
                  <span
                    key={interest.topicId}
                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                    title={`Aggregate Score: ${interest.aggregateScore.toFixed(2)}`}
                  >
                    {interest.topicName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Basic Info Card */}
      <Card variant="default">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <UIText className="text-gray-500 mb-1">Email</UIText>
            <Content>{demoEnabled ? maskEmail(user.email, true) : user.email}</Content>
          </div>
          <div>
            <UIText className="text-gray-500 mb-1">Username</UIText>
            <Content>{demoEnabled ? '████████████' : user.username || '-'}</Content>
          </div>
          <div>
            <UIText className="text-gray-500 mb-1">Status</UIText>
            <Content>
              <span
                className={`px-2 py-1 text-xs font-medium rounded-full ${
                  user.is_blocked
                    ? 'bg-red-100 text-red-800'
                    : 'bg-green-100 text-green-800'
                }`}
              >
                {user.is_blocked ? 'Blocked' : 'Active'}
              </span>
            </Content>
          </div>
          <div>
            <UIText className="text-gray-500 mb-1">Created</UIText>
            <Content>{new Date(user.created_at).toLocaleDateString()}</Content>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 pb-0">
          <nav className="flex gap-2" aria-label="Tabs">
            <button
              onClick={(e) => {
                e.preventDefault()
                setActiveTab('profile')
              }}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                activeTab === 'profile'
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              Profile
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                setActiveTab('projects')
              }}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                activeTab === 'projects'
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              Projects Activities
            </button>
          </nav>
        </div>

        <div className="p-6">
          {/* Search Section */}
          <div className="mb-6">
            <Card variant="default">
              <Subtitle as="h3" className="mb-4">
                Find Matches
              </Subtitle>
              <div className="space-y-4">
                <div>
                  <label htmlFor="search-input" className="block mb-2">
                    <UIText>Search Keyword (optional)</UIText>
                  </label>
                  <input
                    id="search-input"
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="Enter keywords to find specific matches..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <UIText className="text-gray-500 mt-1 text-xs">
                    Leave empty to search based on all user's asks
                  </UIText>
                </div>
                <MatchSearchResults
                  matches={displayedMatches}
                  onUserClick={handleUserClick}
                  isLoading={isSearching}
                />
              </div>
            </Card>
          </div>

          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* Profile Metadata Charts */}
              {skills.length > 0 && (
                <Card variant="default">
                  <Subtitle as="h3" className="mb-4">Skills</Subtitle>
                  <SimpleBarChart data={skillsChartData} />
                </Card>
              )}

              {experience.length > 0 && (
                <Card variant="default">
                  <Subtitle as="h3" className="mb-4">Experience ({experience.length})</Subtitle>
                  <div className="space-y-2">
                    {experience.map((exp: any, idx: number) => (
                      <div key={idx} className="border-l-2 border-gray-300 pl-4">
                        <Content className="font-medium">{exp.title}</Content>
                        {exp.company && <UIText className="text-gray-500">{exp.company}</UIText>}
                        {exp.duration && <UIText className="text-gray-500">{exp.duration}</UIText>}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {education.length > 0 && (
                <Card variant="default">
                  <Subtitle as="h3" className="mb-4">Education ({education.length})</Subtitle>
                  <div className="space-y-2">
                    {education.map((edu: any, idx: number) => (
                      <div key={idx} className="border-l-2 border-gray-300 pl-4">
                        <Content className="font-medium">{edu.degree}</Content>
                        <UIText className="text-gray-500">{edu.institution}</UIText>
                        {edu.year && <UIText className="text-gray-500">{edu.year}</UIText>}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {Object.keys(properties).length > 0 && (
                <Card variant="default">
                  <Subtitle as="h3" className="mb-4">Properties</Subtitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {properties.current_location && (
                      <div>
                        <UIText className="text-gray-500 mb-1">Location</UIText>
                        <Content>{properties.current_location}</Content>
                      </div>
                    )}
                    {properties.availability && (
                      <div>
                        <UIText className="text-gray-500 mb-1">Availability</UIText>
                        <Content>{properties.availability}</Content>
                      </div>
                    )}
                    {properties.preferred_contact_method && (
                      <div>
                        <UIText className="text-gray-500 mb-1">Contact Method</UIText>
                        <Content>{properties.preferred_contact_method}</Content>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {skills.length === 0 && experience.length === 0 && education.length === 0 && Object.keys(properties).length === 0 && (
                <Card variant="default">
                  <Content className="text-gray-500">No profile metadata available</Content>
                </Card>
              )}
            </div>
          )}

          {activeTab === 'projects' && (
            <div className="space-y-6">
              {/* Projects Metadata Charts */}
              {projectTypesChartData.length > 0 && (
                <Card variant="default">
                  <Subtitle as="h3" className="mb-4">Project Types</Subtitle>
                  <SimpleBarChart data={projectTypesChartData} />
                </Card>
              )}

              {projectStatusesChartData.length > 0 && (
                <Card variant="default">
                  <Subtitle as="h3" className="mb-4">Project Statuses</Subtitle>
                  <SimpleBarChart data={projectStatusesChartData} />
                </Card>
              )}

              {technologiesChartData.length > 0 && (
                <Card variant="default">
                  <Subtitle as="h3" className="mb-4">Technologies (Top 10)</Subtitle>
                  <SimpleBarChart data={technologiesChartData} />
                </Card>
              )}

              {notesByProjectChartData.length > 0 && (
                <Card variant="default">
                  <Subtitle as="h3" className="mb-4">Notes by Project (Top 10)</Subtitle>
                  <SimpleBarChart data={notesByProjectChartData} />
                </Card>
              )}

              {/* Projects List */}
              <Card variant="default">
                <Subtitle as="h3" className="mb-4">Projects ({projects.length})</Subtitle>
                {projects.length === 0 ? (
                  <Content className="text-gray-500">No projects found</Content>
                ) : (
                  <div className="space-y-2">
                    {projects.map((project) => {
                      const metadata = project.metadata || {}
                      const basic = metadata.basic || {}
                      const projectType = metadata.project_type_specific || 'Unknown'
                      const status = metadata.status || 'Unknown'
                      const techs = metadata.technologies || []
                      const noteCount = notesByProject[project.name] || 0

                      return (
                        <div
                          key={project.id}
                          className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <Content className="font-medium">{basic.name || project.name}</Content>
                              {basic.description && (
                                <UIText className="text-gray-500 mt-1">{basic.description}</UIText>
                              )}
                              <div className="flex flex-wrap gap-2 mt-2">
                                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                                  {projectType}
                                </span>
                                <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">
                                  {status}
                                </span>
                                {noteCount > 0 && (
                                  <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                                    {noteCount} note{noteCount !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              {techs.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {techs.slice(0, 5).map((tech: string, idx: number) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded"
                                    >
                                      {tech}
                                    </span>
                                  ))}
                                  {techs.length > 5 && (
                                    <span className="px-2 py-1 text-xs text-gray-500">
                                      +{techs.length - 5} more
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="ml-4 text-right">
                              <UIText className="text-gray-500 text-xs">
                                {new Date(project.created_at).toLocaleDateString()}
                              </UIText>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

