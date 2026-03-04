'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Title, Content, UIText, UIButtonText, UserAvatar } from '@/components/ui'
import { StickerAvatar } from '@/components/portfolio/StickerAvatar'
import { formatActivityLocation } from '@/lib/formatActivityLocation'
import { Calendar, MapPin, Globe, ChevronDown, ChevronRight, Balloon } from 'lucide-react'
import { isActivityLive } from '@/lib/activityLive'
import { DEFAULT_ACTIVITY_PATTERN_PATH } from '@/lib/explore/activityPatterns'
import {
  runActivityMatch,
  sendDailyMatchEmailForCurrentUser,
  type ExploreActivity,
  type ActivityMatchDetails,
  type DailyMatchActivity,
  type DailyMatchHighlightMeta,
  getExploreActivityHighlights,
} from '@/app/explore/actions'

function formatDateOnly(isoDate: string): string {
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d)
}

function formatLocationShort(location: ExploreActivity['location']): string {
  if (!location) return ''
  const formatted = formatActivityLocation(location)
  if (location.online) return formatted.line1 || 'Online'
  return formatted.line2 || ''
}

interface ExploreViewProps {
  activities: ExploreActivity[]
  userId: string
  isAdmin?: boolean
  dailyMatch?: {
    introText: string | null
    activities: DailyMatchActivity[]
    ranAt: string | null
    patternPath?: string | null
  }
}

function MatchDetailsDev({ details }: { details: ActivityMatchDetails }) {
  const [open, setOpen] = useState(false)
  return (
    <div onClick={(e) => e.stopPropagation()} className="mt-2 border-t border-gray-200 pt-2">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm"
      >
        {open ? (
          <ChevronDown className="w-4 h-4" aria-hidden />
        ) : (
          <ChevronRight className="w-4 h-4" aria-hidden />
        )}
        <span>Match details (dev)</span>
      </button>
      {open && (
        <div className="mt-2 space-y-3 text-sm">
          <div>
            <UIText className="font-medium text-gray-600">Trustworthy</UIText>
            <div className="mt-1 space-y-1">
              <UIText className="text-gray-700">Value: {details.trustworthy.value.toFixed(2)}</UIText>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>
                  <UIText className="text-gray-600">
                    Friend going: {details.trustworthy.friendGoing ? 'yes' : 'no'}
                  </UIText>
                </li>
                <li>
                  <UIText className="text-gray-600">
                    Multiple friends going: {details.trustworthy.multipleFriendsGoing ? 'yes' : 'no'}
                  </UIText>
                </li>
                <li>
                  <UIText className="text-gray-600">
                    Friend is owner/manager (non-external):{' '}
                    {details.trustworthy.friendIsOwnerOrManager ? 'yes' : 'no'}
                  </UIText>
                </li>
                <li>
                  <UIText className="text-gray-600">
                    Host has user subscribed project:{' '}
                    {details.trustworthy.hostHasSubscribedProject ? 'yes' : 'no'}
                  </UIText>
                </li>
                <li>
                  <UIText className="text-gray-600">
                    Host has user joined project:{' '}
                    {details.trustworthy.hostHasJoinedProject ? 'yes' : 'no'}
                  </UIText>
                </li>
                <li>
                  <UIText className="text-gray-600">
                    Host has user joined community:{' '}
                    {details.trustworthy.hostHasJoinedCommunity ? 'yes' : 'no'}
                  </UIText>
                </li>
              </ul>
            </div>
          </div>
          <div>
            <UIText className="font-medium text-gray-600">Alignment</UIText>
            <div className="mt-1 space-y-1">
              <UIText className="text-gray-700">
                Overall: {details.alignment.value.toFixed(2)} (activity {details.alignment.activityScore.toFixed(3)}
                , host {details.alignment.hostScore.toFixed(3)}, member{' '}
                {details.alignment.memberScore.toFixed(3)})
              </UIText>
              {(() => {
                const matchedActivityTopics =
                  details.alignment.activityTopTopics.filter(
                    (t) => t.similarity > 0 && (t.aggregate > 0 || t.memory > 0)
                  )
                return (
                  <>
                    {matchedActivityTopics.length > 0 && (
                      <div className="mt-1">
                        <UIText className="font-medium text-gray-600">Activity matched topics</UIText>
                        <ul className="list-disc pl-4 space-y-0.5 mt-0.5">
                          {matchedActivityTopics.map((t, idx) => (
                            <li key={idx}>
                              <UIText className="text-gray-600">
                                {t.topicName}: sim {t.similarity.toFixed(3)}, agg {t.aggregate.toFixed(3)}, mem{' '}
                                {t.memory.toFixed(3)}
                              </UIText>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {details.alignment.activityTopTopics.length > 0 && (
                      <div className="mt-1">
                        <UIText className="font-medium text-gray-600">
                          Activity description topics (all)
                        </UIText>
                        <ul className="list-disc pl-4 space-y-0.5 mt-0.5">
                          {details.alignment.activityTopTopics.map((t, idx) => (
                            <li key={idx}>
                              <UIText className="text-gray-600">
                                {t.topicName}: sim {t.similarity.toFixed(3)}, agg {t.aggregate.toFixed(3)}, mem{' '}
                                {t.memory.toFixed(3)}
                              </UIText>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )
              })()}
              {details.alignment.hosts.length > 0 && (
                <div className="mt-1">
                  <UIText className="font-medium text-gray-600">Hosts</UIText>
                  <ul className="list-disc pl-4 space-y-0.5 mt-0.5">
                    {details.alignment.hosts.map((h, idx) => (
                      <li key={idx}>
                        <div>
                          <UIText className="text-gray-600">
                            {h.portfolioId}: score {h.score.toFixed(3)} (rawAgg {h.rawAgg.toFixed(3)}, rawMem{' '}
                            {h.rawMem.toFixed(3)})
                          </UIText>
                          {(() => {
                            const matchedHostTopics = h.topTopics.filter(
                              (t) => t.similarity > 0 && (t.aggregate > 0 || t.memory > 0)
                            )
                            return (
                              <>
                                {matchedHostTopics.length > 0 && (
                                  <ul className="list-disc pl-4 space-y-0.5 mt-0.5">
                                    {matchedHostTopics.map((t, tIdx) => (
                                      <li key={tIdx}>
                                        <UIText className="text-gray-500">
                                          {t.topicName}: sim {t.similarity.toFixed(3)}, agg {t.aggregate.toFixed(3)},
                                          mem {t.memory.toFixed(3)}
                                        </UIText>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {h.topTopics.length > 0 && (
                                  <ul className="list-disc pl-4 space-y-0.5 mt-0.5">
                                    {h.topTopics.map((t, tIdx) => (
                                      <li key={tIdx}>
                                        <UIText className="text-gray-500">
                                          {t.topicName}: sim {t.similarity.toFixed(3)}, agg {t.aggregate.toFixed(3)},
                                          mem {t.memory.toFixed(3)}
                                        </UIText>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {details.alignment.members.length > 0 && (
                <div className="mt-1">
                  <UIText className="font-medium text-gray-600">Members</UIText>
                  <ul className="list-disc pl-4 space-y-0.5 mt-0.5">
                    {details.alignment.members.map((m, idx) => (
                      <li key={idx}>
                        <div>
                          <UIText className="text-gray-600">
                            {m.userId}: score {m.score.toFixed(3)} (rawAgg {m.rawAgg.toFixed(3)}, rawMem{' '}
                            {m.rawMem.toFixed(3)})
                          </UIText>
                          {(() => {
                            const matchedMemberTopics = m.topTopics.filter(
                              (t) => t.similarity > 0 && (t.aggregate > 0 || t.memory > 0)
                            )
                            return (
                              <>
                                {matchedMemberTopics.length > 0 && (
                                  <ul className="list-disc pl-4 space-y-0.5 mt-0.5">
                                    {matchedMemberTopics.map((t, tIdx) => (
                                      <li key={tIdx}>
                                        <UIText className="text-gray-500">
                                          {t.topicName}: sim {t.similarity.toFixed(3)}, agg {t.aggregate.toFixed(3)},
                                          mem {t.memory.toFixed(3)}
                                        </UIText>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {m.topTopics.length > 0 && (
                                  <ul className="list-disc pl-4 space-y-0.5 mt-0.5">
                                    {m.topTopics.map((t, tIdx) => (
                                      <li key={tIdx}>
                                        <UIText className="text-gray-500">
                                          {t.topicName}: sim {t.similarity.toFixed(3)}, agg {t.aggregate.toFixed(3)},
                                          mem {t.memory.toFixed(3)}
                                        </UIText>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MatchedHighlights({ highlight }: { highlight: DailyMatchHighlightMeta }) {
  const { host, accessibility, interestTags, friends } = highlight

  const hasHost = !!host
  const hasAccessibility = !!accessibility
  const hasInterestTags = interestTags && interestTags.length > 0
  const hasFriends = friends && friends.topFriends.length > 0

  if (!hasHost && !hasAccessibility && !hasInterestTags && !hasFriends) {
    return null
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {host && (
        <div className="inline-flex items-center gap-2 px-2 h-8 rounded-full bg-gray-100 flex-shrink-0 min-w-0">
          {host.kind === 'friend' && (
            <UserAvatar
              userId={host.friendUserId ?? ''}
              name={host.name}
              avatar={host.avatar ?? undefined}
              size={24}
              showLink={false}
            />
          )}
          {host.kind !== 'friend' && (
            <StickerAvatar
              src={host.avatar ?? undefined}
              alt={host.name}
              type={host.kind === 'project' ? 'projects' : 'community'}
              size={24}
              emoji={host.emoji ?? undefined}
              name={host.name}
            />
          )}
          <UIText className="text-gray-700 whitespace-nowrap">
            {host.kind === 'friend'
              ? `Hosted by ${host.name}`
              : `Hosted by ${host.name}`}
          </UIText>
        </div>
      )}

      {hasAccessibility && accessibility && (
        <div className="inline-flex items-center gap-1.5 px-2 h-8 rounded-full bg-gray-100 flex-shrink-0">
          {accessibility.kind === 'online' ? (
            <Globe className="w-3.5 h-3.5 text-gray-700" aria-hidden />
          ) : (
            <MapPin className="w-3.5 h-3.5 text-gray-700" aria-hidden />
          )}
          <UIText className="text-gray-700 whitespace-nowrap">
            {accessibility.label}
          </UIText>
        </div>
      )}

      {hasInterestTags &&
        interestTags.map((tag) => (
          <div
            key={tag.topicId}
            className="inline-flex items-center gap-1.5 px-2 h-8 rounded-full bg-gray-100 flex-shrink-0"
          >
            <span className="w-2 h-2 rounded-full bg-blue-500" aria-hidden />
            <UIText className="text-gray-700 whitespace-nowrap">
              {tag.topicName}
            </UIText>
          </div>
        ))}

      {hasFriends && friends && (
        <div className="inline-flex items-center gap-2 px-2 h-8 rounded-full bg-gray-100 flex-shrink-0 min-w-0">
          <div className="flex -space-x-2 flex-shrink-0">
            {friends.topFriends.map((friend, index) => (
              <div
                key={friend.userId}
                className="relative"
                style={{ zIndex: friends.topFriends.length - index }}
              >
                <UserAvatar
                  userId={friend.userId}
                  name={friend.name}
                  avatar={friend.avatar ?? undefined}
                  size={24}
                  showLink={false}
                />
              </div>
            ))}
          </div>
          <UIText className="text-gray-700 whitespace-nowrap">
            {(() => {
              const totalFriends = friends.topFriends.length + friends.extraCount
              return `${totalFriends} friend${totalFriends === 1 ? '' : 's'} going`
            })()}
          </UIText>
        </div>
      )}
    </div>
  )
}

function ActivityCard({
  activity,
  score,
  details,
  highlight,
}: {
  activity: ExploreActivity
  score?: number
  details?: ActivityMatchDetails
  highlight?: DailyMatchHighlightMeta
}) {
  const dateStr = activity.activityDateTime?.start
    ? formatDateOnly(activity.activityDateTime.start)
    : ''
  const locationStr = formatLocationShort(activity.location)
  const hasDate = !!dateStr
  const hasLocation = !!locationStr

  return (
    <div>
      <Link href={`/portfolio/activities/${activity.id}`} className="block">
        <Card variant="subtle" padding="sm" className="hover:border-gray-300 transition-colors">
          <div className="flex items-start gap-4">
            <StickerAvatar
              src={activity.avatar}
              alt={activity.name}
              type="activities"
              size={48}
              emoji={activity.emoji}
            />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2 flex-wrap">
                <Title as="h2" className="text-lg">
                  {activity.name}
                </Title>
              </div>
              {(hasDate || hasLocation) && (
                <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 mb-1.5 text-gray-700">
                  {hasDate && (
                    <>
                      <Calendar className="w-4 h-4 flex-shrink-0 [color:inherit]" aria-hidden />
                      <UIText as="span">{dateStr}</UIText>
                    </>
                  )}
                  {hasDate && hasLocation && <UIText as="span">·</UIText>}
                  {hasLocation && (
                    <>
                      {activity.location?.online ? (
                        <Globe className="w-4 h-4 flex-shrink-0 [color:inherit]" aria-hidden />
                      ) : (
                        <MapPin className="w-4 h-4 flex-shrink-0 [color:inherit]" aria-hidden />
                      )}
                      <UIText as="span">{locationStr}</UIText>
                    </>
                  )}
                </div>
              )}
              {activity.description && (
                <UIText as="p" className="line-clamp-2 leading-relaxed">
                  {activity.description}
                </UIText>
              )}
              {highlight && <MatchedHighlights highlight={highlight} />}
              {details && (
                <MatchDetailsDev details={details} />
              )}
            </div>
          </div>
        </Card>
      </Link>
    </div>
  )
}

function getActivityStartDate(activity: ExploreActivity): Date | null {
  const start = activity.activityDateTime?.start
  if (!start) return null
  const d = new Date(start)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function getActivityDateKey(activity: ExploreActivity): string {
  const d = getActivityStartDate(activity)
  if (!d) return 'no-date'
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateGroupLabel(key: string): string {
  if (key === 'no-date') return 'Anytime'
  const [y, m, d] = key.split('-').map((v) => parseInt(v, 10))
  if (!y || !m || !d) return 'Anytime'
  const date = new Date(y, m - 1, d)
  if (Number.isNaN(date.getTime())) return 'Anytime'

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(tomorrow.getDate()).padStart(2, '0')}`

  if (key === todayKey) {
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date)
    return `Today ${weekday}`
  }
  if (key === tomorrowKey) {
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date)
    return `Tomorrow ${weekday}`
  }

  const monthDay = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date)
  return `${monthDay} ${weekday}`
}

export function ExploreView({ activities, userId, isAdmin = false, dailyMatch }: ExploreViewProps) {
  const [matched, setMatched] = useState<
    Array<{ id: string; score: number; details?: ActivityMatchDetails }> | null
  >(null)
  const [loading, setLoading] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailStatus, setEmailStatus] = useState<string | null>(null)
  const [joinableHighlights, setJoinableHighlights] = useState<Record<string, DailyMatchHighlightMeta>>({})

  useEffect(() => {
    let cancelled = false

    const loadHighlights = async () => {
      if (!activities || activities.length === 0) return
      try {
        const ids = activities.map((a) => a.id)
        const result = await getExploreActivityHighlights(userId, ids)
        if (!cancelled && result.success && result.highlights) {
          setJoinableHighlights(result.highlights)
        }
      } catch {
        // Swallow errors; pills are non-critical UI
      }
    }

    loadHighlights()

    return () => {
      cancelled = true
    }
  }, [userId, activities])

  const handleRunMatch = async () => {
    setLoading(true)
    try {
      const result = await runActivityMatch(userId)
      if (result.success && result.activities) {
        setMatched(result.activities)
      }
    } finally {
      setLoading(false)
    }
  }

  const enableEmailTest = process.env.NEXT_PUBLIC_ENABLE_MATCH_EMAIL_TEST === 'true'

  const handleSendDailyMatchEmail = async () => {
    setEmailSending(true)
    setEmailStatus(null)
    try {
      const result = await sendDailyMatchEmailForCurrentUser()
      setEmailStatus(result.message)
    } catch (e: any) {
      setEmailStatus(e?.message ?? 'Failed to send email')
    } finally {
      setEmailSending(false)
    }
  }

  const activityById = new Map(activities.map((a) => [a.id, a]))
  const matchedIds = new Set(matched?.map((m) => m.id) ?? [])
  const scoreById = new Map(matched?.map((m) => [m.id, m.score]) ?? [])
  const restActivities = activities.filter((a) => !matchedIds.has(a.id))

  const sortedRestActivities = [...restActivities].sort((a, b) => {
    const da = getActivityStartDate(a)
    const db = getActivityStartDate(b)
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return da.getTime() - db.getTime()
  })

  const groups: Array<{ label: string; activities: ExploreActivity[] }> = []

  const ongoing: ExploreActivity[] = []
  const upcoming: ExploreActivity[] = []

  sortedRestActivities.forEach((activity) => {
    const dt = activity.activityDateTime ?? null
    if (dt && isActivityLive(dt)) {
      ongoing.push(activity)
    } else {
      upcoming.push(activity)
    }
  })

  if (ongoing.length > 0) {
    groups.push({
      label: 'Ongoing',
      activities: ongoing,
    })
  }

  const upcomingGroups = new Map<string, ExploreActivity[]>()
  upcoming.forEach((activity) => {
    const key = getActivityDateKey(activity)
    const list = upcomingGroups.get(key)
    if (list) {
      list.push(activity)
    } else {
      upcomingGroups.set(key, [activity])
    }
  })

  const sortedKeys = Array.from(upcomingGroups.keys()).sort((a, b) => {
    if (a === 'no-date' && b === 'no-date') return 0
    if (a === 'no-date') return 1
    if (b === 'no-date') return -1
    return a.localeCompare(b)
  })

  sortedKeys.forEach((key) => {
    const list = upcomingGroups.get(key)
    if (!list || list.length === 0) return
    groups.push({
      label: formatDateGroupLabel(key),
      activities: list,
    })
  })

  if (activities.length === 0) {
    return (
      <div className="px-4 py-8">
        <Card variant="default" padding="md">
          <Content className="text-gray-500">
            No activities to explore right now. Check back later or create one yourself.
          </Content>
        </Card>
      </div>
    )
  }

  return (
    <div className="px-4 py-6">
      {dailyMatch && dailyMatch.activities.length > 0 && (
        <section className="mb-6">
          <div
            className="rounded-2xl p-4 sm:p-5"
            style={{
              backgroundImage: `linear-gradient(rgb(0 0 0 / 0.5), rgb(0 0 0 / 0)),url('${
                dailyMatch.patternPath || DEFAULT_ACTIVITY_PATTERN_PATH
              }')`,
              backgroundRepeat: 'repeat',
              backgroundSize: 'contain',
            }}
          >
            <div className="mb-4">
              {dailyMatch.ranAt && (
                <Title as="div" className="mb-1 text-white font-bold opacity-80">
                  {(() => {
                    const d = new Date(dailyMatch.ranAt as string)
                    if (Number.isNaN(d.getTime())) return 'date unknown'
                    return new Intl.DateTimeFormat(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    }).format(d)
                  })()}
                </Title>
              )}
              <Title as="h2" className="mb-4 text-white font-bold">
                Today&apos;s top picks for you
              </Title>
              {dailyMatch.introText && (
                <Content as="p" className="mb-8 text-white">
                  {dailyMatch.introText}
                </Content>
              )}
            </div>
            <ul className="flex flex-col gap-4">
              {dailyMatch.activities.map((item) => {
                const dynamic = joinableHighlights[item.activity.id]
                const staticHighlight = item.highlight
                const mergedHighlight: DailyMatchHighlightMeta = {
                  host: dynamic?.host ?? staticHighlight.host,
                  accessibility: dynamic?.accessibility ?? staticHighlight.accessibility,
                  // Keep interest tags from the top match result (heavy computation)
                  interestTags: staticHighlight.interestTags,
                  friends: dynamic?.friends ?? staticHighlight.friends,
                }

                return (
                  <ActivityCard
                    key={item.activity.id}
                    activity={item.activity}
                    score={item.score}
                    details={item.details}
                    highlight={mergedHighlight}
                  />
                )
              })}
            </ul>
          </div>
        </section>
      )}

      {process.env.NODE_ENV !== 'production' && isAdmin && (
        <div className="mb-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={handleRunMatch} disabled={loading}>
                {loading ? 'Running dev match…' : 'Run dev match'}
              </Button>
              {enableEmailTest && (
                <Button variant="secondary" onClick={handleSendDailyMatchEmail} disabled={emailSending}>
                  <UIText>{emailSending ? 'Sending email…' : "Email me today's matches (test)"}</UIText>
                </Button>
              )}
            </div>
            {enableEmailTest && emailStatus && (
              <UIText className="text-gray-600">{emailStatus}</UIText>
            )}
          </div>
        </div>
      )}

      {matched && matched.length > 0 && (
        <section className="mb-6">
          <Title as="h2" className="text-lg mb-3">
            Ranked for you
          </Title>
          {matched[0]?.details?.alignment.userInterestTopics &&
            matched[0].details.alignment.userInterestTopics.length > 0 && (
              <div className="mb-3">
                <UIText className="font-medium text-gray-600">Your interest tags</UIText>
                <ul className="list-disc pl-4 space-y-0.5 mt-0.5">
                  {matched[0].details.alignment.userInterestTopics.map((t, idx) => (
                    <li key={idx}>
                      <UIText className="text-gray-600">
                        {t.topicName}: agg {t.aggregate.toFixed(3)}, mem {t.memory.toFixed(3)}
                      </UIText>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          {matched[0]?.details?.alignment.expandedTopics &&
            matched[0].details.alignment.expandedTopics.length > 0 && (
              <div className="mb-3">
                <UIText className="font-medium text-gray-600">Expanded topics from interests</UIText>
                <ul className="list-disc pl-4 space-y-0.5 mt-0.5">
                  {matched[0].details.alignment.expandedTopics.map((t, idx) => (
                    <li key={idx}>
                      <UIText className="text-gray-600">
                        {t.sourceTopicName} → {t.topicName}: sim {t.similarity.toFixed(3)}
                      </UIText>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          <ul className="flex flex-col gap-4">
            {matched.map((m) => {
              const activity = activityById.get(m.id)
              if (!activity) return null

              const baseHighlight = joinableHighlights[activity.id]
              let interestTags: DailyMatchHighlightMeta['interestTags'] = []

              if (m.details?.alignment.activityTopTopics?.length) {
                interestTags = m.details.alignment.activityTopTopics
                  .filter(
                    (t) =>
                      t.similarity > 0 &&
                      (typeof t.aggregate === 'number' || typeof t.memory === 'number')
                  )
                  .slice(0, 3)
                  .map((t) => ({
                    topicId: t.topicId,
                    topicName: t.topicName,
                  }))
              }

              let highlight: DailyMatchHighlightMeta | undefined
              if (baseHighlight) {
                highlight = {
                  ...baseHighlight,
                  interestTags,
                }
              } else if (interestTags.length > 0) {
                highlight = {
                  host: undefined,
                  accessibility: undefined,
                  interestTags,
                  friends: undefined,
                }
              }

              return (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  score={m.score}
                  details={m.details}
                  highlight={highlight}
                />
              )
            })}
          </ul>
        </section>
      )}

      <section className="mt-2">
        <div className="mb-4 flex items-center gap-2">
          <Balloon className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
          <UIText className="text-gray-700">Joinable activities</UIText>
        </div>
        <div className="relative pl-4">
          <div className="absolute left-1 top-0 bottom-0 border-l border-dashed border-gray-200" />
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.label} className="relative pb-1">
                <div className="ml-2 mb-2 text-gray-500">
                  <UIButtonText as="span">{group.label}</UIButtonText>
                </div>
                <div className="ml-2 space-y-4">
                  {group.activities.map((activity) => (
                    <ActivityCard
                      key={activity.id}
                      activity={activity}
                      highlight={joinableHighlights[activity.id]}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
