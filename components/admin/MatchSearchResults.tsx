'use client'

import { Card, Title, Content, UIText } from '@/components/ui'

interface MatchUser {
  userId: string
  email: string
  username: string | null
  name: string | null
  score: number
  description: string | null
}

interface MatchSearchResultsProps {
  matches: MatchUser[]
  onUserClick: (userId: string) => void
  isLoading?: boolean
}

export function MatchSearchResults({ matches, onUserClick, isLoading }: MatchSearchResultsProps) {
  if (isLoading) {
    return (
      <Card variant="default">
        <Content className="text-gray-500">Searching for matches...</Content>
      </Card>
    )
  }

  if (matches.length === 0) {
    return (
      <Card variant="default">
        <Content className="text-gray-500">No matches found.</Content>
      </Card>
    )
  }

  return (
    <Card variant="default">
      <Title as="h3" className="mb-4">
        Matches ({matches.length})
      </Title>
      <div className="space-y-2">
        {matches.map((match) => (
          <div
            key={match.userId}
            onClick={() => onUserClick(match.userId)}
            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <Content className="font-medium">
                  {match.name || match.username || match.email}
                </Content>
                {match.email && (
                  <UIText className="text-gray-500 mt-1">{match.email}</UIText>
                )}
                {match.username && match.name && (
                  <UIText className="text-gray-500 text-xs mt-1">@{match.username}</UIText>
                )}
                {match.description && (
                  <UIText className="text-gray-600 mt-2 text-sm line-clamp-2">
                    {match.description}
                  </UIText>
                )}
              </div>
              <div className="ml-4 text-right">
                <div className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                  {match.score.toFixed(2)}
                </div>
                <UIText className="text-gray-500 text-xs mt-1">match score</UIText>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}


