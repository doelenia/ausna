'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, Title, Subtitle, Content, UIText } from '@/components/ui'
import { getMatchExplanation, getMatchData, getMatchBreakdown, getUserInterests } from '@/app/admin/actions'
import { SimpleBarChart } from './SimpleBarChart'
import {
  getDemoDisplayName,
  maskDescription,
} from '@/lib/admin/demoAnonymization'

interface MatchUserDetailProps {
  searcherId: string
  targetUserId: string
  searchKeyword?: string
  targetUserSummary?: {
    userId: string
    email: string
    username: string | null
    name: string | null
  } | null
  matchDetails?: {
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
    specificDetails?: Record<
      string,
      Array<{
        searchingAsk: string
        maxSimilarity: number
        matchedKnowledgeText: string
        matchedKnowledgeId?: string
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
  }
  onClose: () => void
  /** When true, names and descriptions are anonymized (demo mode). Stored in admin user metadata. */
  demoEnabled?: boolean
}

type Tab = 'forward' | 'backward' | 'specific' | 'topic' | 'profile' | 'projects'

interface MatchActivitySuggestion {
  title: string
  description: string
}

interface SubjectMatchAnalysis {
  subjectName: string
  otherPersonName: string
  paragraph: string
  activities: MatchActivitySuggestion[]
}

interface MatchExplanation {
  matcher: SubjectMatchAnalysis
  matchee: SubjectMatchAnalysis
}

export function MatchUserDetail({
  searcherId,
  targetUserId,
  searchKeyword,
  targetUserSummary,
  matchDetails,
  onClose,
  demoEnabled = false,
}: MatchUserDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>('forward')
  const [explanation, setExplanation] = useState<MatchExplanation | null>(null)
  const [activeAnalysisSubject, setActiveAnalysisSubject] = useState<'matcher' | 'matchee'>(
    'matcher'
  )
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false)
  const [targetUserData, setTargetUserData] = useState<{
    user: any
    humanPortfolio?: any
    projects: any[]
  } | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [targetUserInterests, setTargetUserInterests] = useState<
    Array<{ topicId: string; topicName: string; aggregateScore: number }>
  >([])
  const [matchBreakdown, setMatchBreakdown] = useState<{
    forwardMatches?: Array<{
      searchingAsk: string
      maxSimilarity: number
      matchedKnowledgeText: string
      searchingProject?: {
        id: string
        name: string | null
        description: string | null
      }
      matchedProject?: {
        id: string
        name: string | null
        description: string | null
      }
      projects?: Array<{
        id: string
        name: string | null
        description: string | null
      }>
    }>
    backwardMatches?: Array<{
      searchingNonAsk: string
      maxSimilarity: number
      matchedAskText: string
      searchingProject?: {
        id: string
        name: string | null
        description: string | null
      }
      matchedProject?: {
        id: string
        name: string | null
        description: string | null
      }
      projects?: Array<{
        id: string
        name: string | null
        description: string | null
      }>
    }>
    specificMatches?: Array<{
      searchingAsk: string
      maxSimilarity: number
      matchedKnowledgeText: string
      matchedProject?: {
        id: string
        name: string | null
        description: string | null
      }
      projects?: Array<{
        id: string
        name: string | null
        description: string | null
      }>
    }>
    topicMatches?: Array<{
      searcherTopicId: string
      searcherTopicName: string
      targetTopicId: string
      targetTopicName: string
      similarity: number
      multiplier: number
    }>
  } | null>(null)

  // Avoid duplicate explanation generation for the same (searcher, target, keyword) combination
  const explanationKeyRef = useRef<string | null>(null)
  // Track if enrichment has been completed to prevent multiple calls
  const enrichmentCompletedRef = useRef<string | null>(null)

  // Step 1: Load match breakdown immediately from cached details (instant display)
  useEffect(() => {
    if (matchDetails) {
      const forwardDetails = matchDetails.forwardDetails?.[targetUserId] || []
      const backwardDetails = matchDetails.backwardDetails?.[targetUserId] || []
      const specificDetails = searchKeyword
        ? matchDetails.specificDetails?.[targetUserId] || []
        : undefined
      const topicDetails = matchDetails.topicDetails?.[targetUserId] || []

      setMatchBreakdown({
        forwardMatches: forwardDetails
          .slice()
          .sort((a, b) => b.maxSimilarity - a.maxSimilarity),
        backwardMatches: backwardDetails
          .slice()
          .sort((a, b) => b.maxSimilarity - a.maxSimilarity),
        specificMatches:
          specificDetails && specificDetails.length > 0
            ? specificDetails.slice().sort((a, b) => b.maxSimilarity - a.maxSimilarity)
            : undefined,
        topicMatches: topicDetails.slice().sort((a, b) => b.similarity - a.similarity),
      })
    }
  }, [matchDetails, targetUserId, searchKeyword])

  // Step 2: Load user data first (portfolio, projects, interests) - must complete before enriching matches
  useEffect(() => {
    async function loadUserData() {
      setIsLoadingData(true)
      const [userDataResult, interestsResult] = await Promise.all([
        getMatchData(targetUserId),
        getUserInterests(targetUserId),
      ])
      
      if (userDataResult.success && userDataResult.user) {
        setTargetUserData({
          user: userDataResult.user,
          humanPortfolio: userDataResult.humanPortfolio,
          projects: userDataResult.projects || [],
        })
      }
      
      if (interestsResult.success && interestsResult.interests) {
        setTargetUserInterests(interestsResult.interests)
      }
      
      setIsLoadingData(false)
    }
    loadUserData()
  }, [targetUserId])

  // Step 3: Load enriched match breakdown AFTER user data is loaded (reuses projects from Step 2)
  useEffect(() => {
    // Wait for user data to be loaded before enriching
    if (isLoadingData || !targetUserData || !matchDetails) return

    // Create a unique key for this enrichment request
    const enrichmentKey = `${searcherId}:${targetUserId}:${searchKeyword || ''}`
    
    // Skip if already enriched for this combination
    if (enrichmentCompletedRef.current === enrichmentKey) {
      return
    }

    async function fetchEnrichedBreakdown() {
      // Pass projects and matchDetails from already-loaded data to avoid DB calls and rerunning match
      const projects = targetUserData?.projects || []
      const breakdownResult = await getMatchBreakdown(
        searcherId,
        targetUserId,
        searchKeyword,
        projects,
        matchDetails // Pass cached match details to avoid rerunning the match
      )
      
      if (breakdownResult.success) {
        // Mark as completed
        enrichmentCompletedRef.current = enrichmentKey
        // Update with enriched data (includes project info)
        setMatchBreakdown({
          forwardMatches: breakdownResult.forwardMatches
            ? breakdownResult.forwardMatches.slice().sort((a, b) => b.maxSimilarity - a.maxSimilarity)
            : undefined,
          backwardMatches: breakdownResult.backwardMatches
            ? breakdownResult.backwardMatches.slice().sort((a, b) => b.maxSimilarity - a.maxSimilarity)
            : undefined,
          specificMatches: breakdownResult.specificMatches
            ? breakdownResult.specificMatches.slice().sort((a, b) => b.maxSimilarity - a.maxSimilarity)
            : undefined,
          topicMatches: breakdownResult.topicMatches
            ? breakdownResult.topicMatches.slice().sort((a, b) => b.similarity - a.similarity)
            : undefined,
        })
      }
    }
    
    fetchEnrichedBreakdown()
  }, [searcherId, targetUserId, searchKeyword, matchDetails, isLoadingData, targetUserData])

  // Load AI explanation separately in the background
  useEffect(() => {
    const key = `${searcherId}:${targetUserId}:${searchKeyword?.trim() || ''}`
    if (explanationKeyRef.current === key) {
      return
    }
    explanationKeyRef.current = key

    async function loadExplanation() {
      setIsLoadingExplanation(true)
      
      // Generate asks from keyword if provided
      let specificAsks: string[] | undefined
      if (searchKeyword && searchKeyword.trim().length > 0) {
        try {
          const { generateAsksFromKeyword } = await import('@/lib/indexing/match-search')
          specificAsks = await generateAsksFromKeyword(searchKeyword.trim())
        } catch (error) {
          console.error('Failed to generate asks from keyword:', error)
        }
      }

      // Load match explanation
      const explanationResult = await getMatchExplanation(searcherId, targetUserId, specificAsks)
      if (explanationResult.success && explanationResult.explanation) {
        setExplanation(explanationResult.explanation)
      }
      setIsLoadingExplanation(false)
    }
    loadExplanation()
  }, [searcherId, targetUserId, searchKeyword])

  // Show content immediately - don't block on loading states
  // Match breakdown is already available from matchDetails
  // User data and explanation will appear when ready

  const user = targetUserData?.user
  const displayName = user
    ? user.name || user.username || user.email
    : targetUserSummary
      ? targetUserSummary.name || targetUserSummary.username || targetUserSummary.email
      : 'Loading...'
  const humanPortfolio = targetUserData?.humanPortfolio
  const projects = targetUserData?.projects || []
  const profileMetadata = humanPortfolio?.metadata || {}
  const basic = profileMetadata.basic || {}
  // Extract description - check both string and ensure it's not just whitespace
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

  const anonymizedDisplayName = demoEnabled ? getDemoDisplayName(targetUserId, false, true) : displayName

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onClose}
            className="text-blue-600 hover:text-blue-800 text-sm mb-2"
          >
            ← Back to Results
          </button>
          <Title as="h2">Match Details</Title>
          <Content as="p" className="mt-2">
            {anonymizedDisplayName}
          </Content>
        </div>
      </div>

      {/* Description - Show early, before AI analysis */}
      {description && (
        <Card variant="default">
          <Subtitle as="h3" className="mb-4">
            About
          </Subtitle>
          <Content>{description}</Content>
          {targetUserInterests.length > 0 && (
            <div className="mt-4">
              <UIText className="text-gray-500 text-sm mb-2">Interests:</UIText>
              <div className="flex flex-wrap gap-2">
                {targetUserInterests.map((interest) => (
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

      {/* Match Explanation */}
      {isLoadingExplanation ? (
        <Card variant="default">
          <Content className="text-gray-500">Generating match explanation...</Content>
        </Card>
      ) : explanation ? (
        <Card variant="default">
          <Subtitle as="h3" className="mb-4">
            Why This is a Good Match
          </Subtitle>
          {/* Subject toggle tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={(e) => {
                e.preventDefault()
                setActiveAnalysisSubject('matcher')
              }}
              className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                activeAnalysisSubject === 'matcher'
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              For {demoEnabled ? getDemoDisplayName(searcherId, true, true) : explanation.matcher.subjectName}
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                setActiveAnalysisSubject('matchee')
              }}
              className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                activeAnalysisSubject === 'matchee'
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              For {anonymizedDisplayName}
            </button>
          </div>

          {/* Current subject analysis */}
          {(() => {
            const current =
              activeAnalysisSubject === 'matcher' ? explanation.matcher : explanation.matchee

            return (
              <div className="space-y-4">
                <Content className="mb-2">{current.paragraph}</Content>

                {current.activities && current.activities.length > 0 && (
                  <div className="space-y-3">
                    {current.activities.map((activity, idx) => (
                      <Card key={idx} variant="subtle">
                        <div className="space-y-1">
                          <UIText className="font-medium">{activity.title}</UIText>
                          <Content>{activity.description}</Content>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}
        </Card>
      ) : null}

      {/* Match Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 pb-0">
          <nav className="flex gap-2" aria-label="Match Tabs">
            <button
              onClick={(e) => {
                e.preventDefault()
                setActiveTab('forward')
              }}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                activeTab === 'forward'
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              Forward Match
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                setActiveTab('backward')
              }}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                activeTab === 'backward'
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              Backward Match
            </button>
            {searchKeyword && searchKeyword.trim().length > 0 && (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  setActiveTab('specific')
                }}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  activeTab === 'specific'
                    ? 'bg-gray-200 text-gray-700'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                Specific Search
              </button>
            )}
            <button
              onClick={(e) => {
                e.preventDefault()
                setActiveTab('topic')
              }}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                activeTab === 'topic'
                  ? 'bg-gray-200 text-gray-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              Topic Match
            </button>
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
          {activeTab === 'forward' && (
            <div className="space-y-4">
              {matchBreakdown?.forwardMatches && matchBreakdown.forwardMatches.length > 0 ? (
                matchBreakdown.forwardMatches.map((match, idx) => (
                  <Card key={idx} variant="default">
                    <div className="space-y-2">
                      <div>
                        <UIText className="text-gray-500 text-sm">Searching Ask:</UIText>
                        <Content className="font-medium">{match.searchingAsk}</Content>
                        {match.searchingProject && (
                          <div className="mt-1 border-l-2 border-blue-300 pl-3 bg-blue-50 p-2 rounded">
                            <UIText className="text-blue-700 text-xs font-medium">From Project:</UIText>
                            <Content className="text-sm font-medium text-blue-900">
                              {match.searchingProject.name || 'Untitled Project'}
                            </Content>
                            {match.searchingProject.description && (
                              <UIText className="text-blue-600 text-xs mt-1">
                                {match.searchingProject.description}
                              </UIText>
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <UIText className="text-gray-500 text-sm">Matched Knowledge:</UIText>
                        <Content>{match.matchedKnowledgeText}</Content>
                        {match.matchedProject && (
                          <div className="mt-1 border-l-2 border-green-300 pl-3 bg-green-50 p-2 rounded">
                            <UIText className="text-green-700 text-xs font-medium">From Project:</UIText>
                            <Content className="text-sm font-medium text-green-900">
                              {match.matchedProject.name || 'Untitled Project'}
                            </Content>
                            {match.matchedProject.description && (
                              <UIText className="text-green-600 text-xs mt-1">
                                {match.matchedProject.description}
                              </UIText>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <UIText className="text-gray-500 text-sm">Similarity:</UIText>
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                          {match.maxSimilarity.toFixed(4)}
                        </span>
                      </div>
                      {match.projects && match.projects.length > 0 && (
                        <div>
                          <UIText className="text-gray-500 text-sm mb-1">Projects:</UIText>
                          <div className="space-y-1">
                            {match.projects.map((project) => (
                              <div key={project.id} className="border-l-2 border-gray-200 pl-3">
                                <Content className="font-medium">
                                  {project.name || 'Untitled Project'}
                                </Content>
                                {project.description && (
                                  <UIText className="text-gray-500 text-xs">
                                    {project.description}
                                  </UIText>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                ))
              ) : (
                <Content className="text-gray-500">No forward matches found.</Content>
              )}
            </div>
          )}

          {activeTab === 'backward' && (
            <div className="space-y-4">
              {matchBreakdown?.backwardMatches && matchBreakdown.backwardMatches.length > 0 ? (
                matchBreakdown.backwardMatches.map((match, idx) => (
                  <Card key={idx} variant="default">
                    <div className="space-y-2">
                      <div>
                        <UIText className="text-gray-500 text-sm">Searching Non-Ask:</UIText>
                        <Content className="font-medium">{match.searchingNonAsk}</Content>
                        {match.searchingProject && (
                          <div className="mt-1 border-l-2 border-blue-300 pl-3 bg-blue-50 p-2 rounded">
                            <UIText className="text-blue-700 text-xs font-medium">From Project:</UIText>
                            <Content className="text-sm font-medium text-blue-900">
                              {match.searchingProject.name || 'Untitled Project'}
                            </Content>
                            {match.searchingProject.description && (
                              <UIText className="text-blue-600 text-xs mt-1">
                                {match.searchingProject.description}
                              </UIText>
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <UIText className="text-gray-500 text-sm">Matched Ask:</UIText>
                        <Content>{match.matchedAskText}</Content>
                        {match.matchedProject && (
                          <div className="mt-1 border-l-2 border-green-300 pl-3 bg-green-50 p-2 rounded">
                            <UIText className="text-green-700 text-xs font-medium">From Project:</UIText>
                            <Content className="text-sm font-medium text-green-900">
                              {match.matchedProject.name || 'Untitled Project'}
                            </Content>
                            {match.matchedProject.description && (
                              <UIText className="text-green-600 text-xs mt-1">
                                {match.matchedProject.description}
                              </UIText>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <UIText className="text-gray-500 text-sm">Similarity:</UIText>
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                          {match.maxSimilarity.toFixed(4)}
                        </span>
                      </div>
                      {match.projects && match.projects.length > 0 && (
                        <div>
                          <UIText className="text-gray-500 text-sm mb-1">Projects:</UIText>
                          <div className="space-y-1">
                            {match.projects.map((project) => (
                              <div key={project.id} className="border-l-2 border-gray-200 pl-3">
                                <Content className="font-medium">
                                  {project.name || 'Untitled Project'}
                                </Content>
                                {project.description && (
                                  <UIText className="text-gray-500 text-xs">
                                    {project.description}
                                  </UIText>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                ))
              ) : (
                <Content className="text-gray-500">No backward matches found.</Content>
              )}
            </div>
          )}

          {activeTab === 'specific' && (
            <div className="space-y-4">
              {matchBreakdown?.specificMatches && matchBreakdown.specificMatches.length > 0 ? (
                matchBreakdown.specificMatches.map((match, idx) => (
                  <Card key={idx} variant="default">
                    <div className="space-y-2">
                      <div>
                        <UIText className="text-gray-500 text-sm">Searching Ask:</UIText>
                        <Content className="font-medium">{match.searchingAsk}</Content>
                      </div>
                      <div>
                        <UIText className="text-gray-500 text-sm">Matched Knowledge:</UIText>
                        <Content>{match.matchedKnowledgeText}</Content>
                      </div>
                      <div className="flex items-center gap-2">
                        <UIText className="text-gray-500 text-sm">Similarity:</UIText>
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                          {match.maxSimilarity.toFixed(4)}
                        </span>
                      </div>
                      {match.projects && match.projects.length > 0 && (
                        <div>
                          <UIText className="text-gray-500 text-sm mb-1">Projects:</UIText>
                          <div className="space-y-1">
                            {match.projects.map((project) => (
                              <div key={project.id} className="border-l-2 border-gray-200 pl-3">
                                <Content className="font-medium">
                                  {project.name || 'Untitled Project'}
                                </Content>
                                {project.description && (
                                  <UIText className="text-gray-500 text-xs">
                                    {project.description}
                                  </UIText>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                ))
              ) : (
                <Content className="text-gray-500">No specific matches found.</Content>
              )}
            </div>
          )}

          {activeTab === 'topic' && (
            <div className="space-y-4">
              {matchBreakdown?.topicMatches && matchBreakdown.topicMatches.length > 0 ? (
                matchBreakdown.topicMatches.map((match, idx) => (
                  <Card key={idx} variant="default">
                    <div className="space-y-2">
                      <div>
                        <UIText className="text-gray-500 text-sm">Searcher Topic:</UIText>
                        <Content className="font-medium">{match.searcherTopicName}</Content>
                      </div>
                      <div>
                        <UIText className="text-gray-500 text-sm">Target User Topic:</UIText>
                        <Content className="font-medium">{match.targetTopicName}</Content>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <UIText className="text-gray-500 text-sm">Similarity:</UIText>
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                            {match.similarity.toFixed(4)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <UIText className="text-gray-500 text-sm">Multiplier:</UIText>
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm font-medium">
                            {match.multiplier.toFixed(4)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <Content className="text-gray-500">No topic matches found.</Content>
              )}
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-6">
              {isLoadingData ? (
                <Content className="text-gray-500">Loading profile data...</Content>
              ) : !targetUserData ? (
                <Content className="text-gray-500">Failed to load user data.</Content>
              ) : (
                <>
                  {/* Profile Metadata Charts */}
                  {skills.length > 0 && (
                <Card variant="default">
                  <Subtitle as="h3" className="mb-4">
                    Skills
                  </Subtitle>
                  <SimpleBarChart data={skillsChartData} />
                </Card>
              )}

              {experience.length > 0 && (
                <Card variant="default">
                  <Subtitle as="h3" className="mb-4">
                    Experience ({experience.length})
                  </Subtitle>
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
                  <Subtitle as="h3" className="mb-4">
                    Education ({education.length})
                  </Subtitle>
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
                  <Subtitle as="h3" className="mb-4">
                    Properties
                  </Subtitle>
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

              {skills.length === 0 &&
                experience.length === 0 &&
                education.length === 0 &&
                Object.keys(properties).length === 0 && (
                  <Card variant="default">
                    <Content className="text-gray-500">No profile metadata available</Content>
                  </Card>
                )}
                </>
              )}
            </div>
          )}

          {activeTab === 'projects' && (
            <div className="space-y-6">
              {isLoadingData ? (
                <Content className="text-gray-500">Loading project data...</Content>
              ) : !targetUserData ? (
                <Content className="text-gray-500">Failed to load user data.</Content>
              ) : (
                <>
                  {/* Projects Metadata Charts */}
                  {projectTypesChartData.length > 0 && (
                <Card variant="default">
                  <Subtitle as="h3" className="mb-4">
                    Project Types
                  </Subtitle>
                  <SimpleBarChart data={projectTypesChartData} />
                </Card>
              )}

              {projectStatusesChartData.length > 0 && (
                <Card variant="default">
                  <Subtitle as="h3" className="mb-4">
                    Project Statuses
                  </Subtitle>
                  <SimpleBarChart data={projectStatusesChartData} />
                </Card>
              )}

              {technologiesChartData.length > 0 && (
                <Card variant="default">
                  <Subtitle as="h3" className="mb-4">
                    Technologies (Top 10)
                  </Subtitle>
                  <SimpleBarChart data={technologiesChartData} />
                </Card>
              )}

              {/* Projects List */}
              <Card variant="default">
                <Subtitle as="h3" className="mb-4">
                  Projects ({projects.length})
                </Subtitle>
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

                      return (
                        <div
                          key={project.id}
                          className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <Content className="font-medium">
                                {basic.name || project.name}
                              </Content>
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
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


