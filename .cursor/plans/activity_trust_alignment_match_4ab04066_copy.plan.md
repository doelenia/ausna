---
name: Activity Trust Alignment Match (copy)
overview: Redesign the activity explore match to use a trustworthy multiplier and an alignment score instead of raw forward/backward vector scores, while still exposing detailed match criteria in the dev toggle for debugging.
todos: []
isProject: false
---

# Activity Trust × Alignment Match Redesign

## Context

- Current activity match (`runActivityMatchPipeline` in [lib/indexing/activity-match.ts](lib/indexing/activity-match.ts)):
  - Uses user asks/non-asks (including from notes, human description, project/activity descriptions), AI-enriched asks/non-asks.
  - Forward (asks → activity non-asks) and backward (non-asks → activity asks) matches over `atomic_knowledge` via `match_atomic_knowledge_for_activities`.
  - Topic-based multiplier via expanded topics + `getTopicIdsForPortfolio` for activities.
  - Host multiplier (1 vs 0.8) and friends-going multiplier (1 + log10(1 + count)).
  - Final score is essentially a vector-based match score with topic + host + friends multipliers.
- UI (Explore page) already has a **dev toggle** that shows forward, backward, topic, host, and friends multipliers for each activity card.
- New requirement: **replace the ranking logic** with:
  - **Trustworthy**: scalar in ( [1, 1.6] ) based on six boolean signals.
  - **Alignment**: score derived from interest/topic overlap with activity, its hosts, and its members, normalized into ( [3, 6] ) as `3 + a + h + m` where each of `a`, `h`, `m` is ( [0, 1] ).
  - Final match score: `**trustworthy * alignment`**.
  - **Dev toggle** must show these new components and per-host/per-member alignment details (without re-running the match).

---

## 1. Trustworthy score design

**Goal:** Compute a trustworthy multiplier per activity:
[
trustworthy = 1 + 0.1 \times N_{true}, \quad N_{true} \in 0,\dots,6,  trustworthy \in [1, 1.6]
]

**Booleans to compute for each activity:**

1. **A friend is going**: at least one friend is in `activity.metadata.members` or `managers`.
2. **Multiple friends are going**: at least **two** distinct friends in members/managers.
3. **Friend is owner/manager (non-external)**: activity is not external and at least one friend is the `user_id` (owner) or in `metadata.managers`.
4. **Host has a user subscribed project**: any host project id (from `host_project_ids`, `host_community_ids` where type = `projects`, plus legacy `host_project_id`) is in the user’s subscribed portfolio IDs.
5. **Host has a user joined project**: any host project id is in the user’s joined project portfolio IDs.
6. **Host has a user joined community**: any host community id (type = `community`) is in the user’s joined community portfolio IDs.

**Data sources (reuse existing explore/action data):**

- `friendIds` (from `getFriendIds`) — already used in explore.
- `activityMetadata` (in `runActivityMatch`): host IDs and member IDs, extended to track managers separately if needed.
- `subscribedOrMemberPortfolioIds` (from explore) — currently mixes subscriptions and membership. For the new signals we’ll:
  - Split into **subscribed** vs **joined** by:
    - `getSubscribedPortfolioIds` (already returns subscribed project/community portfolio IDs).
    - `getMemberPortfolioIds` (joined project/community portfolio IDs).
  - When populating `activityMetadata`, also retain host portfolio IDs and types (`projects` vs `community`) by querying `portfolios` for host IDs.

**Implementation (pipeline-level):**

- In `runActivityMatchPipeline`:
  - Accept additional precomputed sets for: `friendIds`, `subscribedProjectIds`, `joinedProjectIds`, `joinedCommunityIds` (or derive joined sets from `getMemberPortfolioIds` filtered by `type`).
  - For each activity, compute the six booleans using `activityMetadata` + host portfolio type info and the friend/member sets.
  - Count `N_true` and compute `trustworthy` as above.
  - Store `trustworthy` in the **dev details** object so UI can show which conditions were true.

We will keep the existing host/friend multipliers **for debugging only** initially (or drop them if they confuse the new model), but the primary ranking will use the new trustworthy score.

---

## 2. Alignment score design

**Goal:** Alignment measures how well the user’s interests align with:

1. The **activity** itself (already have topics via `getTopicIdsForPortfolio(activityId)`).
2. The **host projects/communities** (portfolio topics).
3. The **members** (people’s interests/topics).

Each of these three dimensions produces a score in ( [0, 1] ). Final alignment is:
[
alignment = 3 + a + h + m, \quad a, h, m \in [0, 1],  alignment \in [3, 6]
]

### 2.1 Topic/interest matching primitive (reusing admin match logic)

We’ll adapt the existing **topic multiplier** logic from `performMatchSearch` (in [lib/indexing/match-search.ts](lib/indexing/match-search.ts)):

- **Searcher topics**: topic IDs collected from the user’s asks and non-asks (we already have `topicIds` on asks/non-asks from `atomic_knowledge`).
- **Expanded topics**: `getExpandedTopicsWithSimilarity(assignedTopicIds)` calls `match_topics` with `match_count = 3` per topic and builds a map from topic ID → best similarity and source searcher topic (this is the “top 3 weight adaptation”).
- **Current usage**: sums similarity across all target users’ `user_interests` and computes multiplier `sqrt(sumSim + 1)`.

We’ll reuse this pattern but compute **per-target** scores:

- Precompute `expandedTopics` once for the searcher.
- Build `similarityMap` from `topicId → similarity` and `sourceSearcherTopicId` as now.
- For each target entity (activity, each host portfolio, each member user):
  - Get its topic IDs.
  - For each topic ID in the target, if it’s in `similarityMap`, accumulate `sumSim += similarity` and optionally track per-topic contributions for debugging.

### 2.2 Target topics for each dimension

- **Activity**: use `getTopicIdsForPortfolio(activityId)` (already implemented; reads `metadata.description_topics` or, if missing, falls back to `atomic_knowledge.source_info` parsing, including double-encoded JSON).
- **Hosts (projects/communities)**:
  - For each host portfolio id (type `projects` or `community`), use `getTopicIdsForPortfolio(hostId)` to get topic IDs.
- **Members (people)**:
  - For each member userId in `activityMetadata.memberIds` and `managers`, derive that user’s topics via:
    - Option A: `user_interests` table — query `user_interests` where `user_id IN (memberIds)` and `topic_id IN (expanded topic IDs)`; topic IDs per member come from their interests.
    - Option B: `getTopicIdsForPortfolio` on the member’s human portfolio plus/or `user_interests`.
  - For simplicity and consistency with the existing admin topic multiplier, we’ll use `**user_interests`**: each member’s topics = set of topic IDs they have interests in.

### 2.3 Aggregate vs memory and normalization

For each target (activity/host/member) we now compute **two** raw scores using the searcher’s `user_interests`:

- Let `similarity(topicId)` come from the expanded topic map.
- Let `aggregate_score(topicId)` and `memory_score(topicId)` come from `user_interests` for the searcher (0 if no row).

Raw scores per target:

- **Aggregate version**  
`rawAgg = sum_over_overlaps( similarity(topicId) * aggregate_score(topicId) )`
- **Memory version**  
`rawMem = sum_over_overlaps( similarity(topicId) * memory_score(topicId) )`

We then normalize each raw value into ( [0, 0.5] ) using a smooth squash:

- `normToHalf(x) = 0.5 * (1 - exp(-k * x))` with `k ≈ 1`
  - `normToHalf(0) = 0`
  - As `x` grows, `normToHalf(x)` approaches 0.5 but never exceeds it.

Per-target parts:

- `aggPart = normToHalf(rawAgg)` ∈ [0, 0.5]
- `memPart = normToHalf(rawMem)` ∈ [0, 0.5]

Per-target alignment contribution:

- `typeScore = aggPart + memPart` ∈ [0, 1]

Then compute per-dimension scores:

1. **Activity alignment `a`**
  - Compute `rawAgg_activity` / `rawMem_activity` from the activity’s topic IDs.
  - `aggPart_activity = normToHalf(rawAgg_activity)`
  - `memPart_activity = normToHalf(rawMem_activity)`
  - `a = aggPart_activity + memPart_activity`
2. **Host alignment `h`**
  - For each host portfolio (project/community), compute its `rawAgg_host_i` and `rawMem_host_i`, then `typeScore_host_i`.
  - Host dimension score `h = max_i typeScore_host_i` (max over all hosts), per spec (“take the max interest match score per host as final host score”).
  - Keep **per-host scores** `{ hostPortfolioId, rawAgg, rawMem, aggPart, memPart, score: typeScore_host_i }` so we can pass them to the UI.
3. **Member alignment `m`**
  - For each member user, via `user_interests`, compute `rawAgg_member_j` and `rawMem_member_j`, then `typeScore_member_j`.
  - Member dimension score `m = max_j typeScore_member_j`.
  - Keep **per-member scores** `{ userId, rawAgg, rawMem, aggPart, memPart, score: typeScore_member_j }` for the UI.

Finally:

[
alignment = 3 + a + h + m
]

We’ll store `a`, `h`, `m`, plus per-host and per-member breakdowns (including aggregate vs memory pieces) in the activity’s dev details.

---

## 3. New final score: `trustworthy * alignment`

- Replace the current final ranking in `runActivityMatchPipeline` with:
  - Compute `trustworthy` as in section 1.
  - Compute `alignment` as in section 2.
  - **Final score** per activity: `score = trustworthy * alignment`.
- For debugging, we can optionally still compute forward/backward/topic-based similarities and keep them in the dev details, but they will no longer affect the **rank ordering**.
- Update the `RankedActivity` / `ActivityMatchDetails` structure in [lib/indexing/activity-match.ts](lib/indexing/activity-match.ts) to include:
  - `trustworthy`
  - `alignment`
  - `alignmentComponents: { activityScore: a, hostScore: h, memberScore: m }`
  - `hosts: Array<{ portfolioId: string; score: number; rawSumSim: number }>`
  - `members: Array<{ userId: string; score: number; rawSumSim: number }>`
  - plus any legacy forward/backward/topic info you still find useful.

---

## 4. Action and UI changes

### 4.1 Server action

- **File:** [app/explore/actions.ts](app/explore/actions.ts)
- Update `RunActivityMatchResult.activities` entries to carry the new details from `runActivityMatchPipeline` (they already carry `details` from the previous implementation; expand/rename to include `trustworthy`, `alignment`, and per-host/member scores).
- Ensure we **do not re-run** the match for the dev panel; all debug data is part of the pipeline result.

### 4.2 Explore dev panel

- **File:** [components/explore/ExploreView.tsx](components/explore/ExploreView.tsx)

Extend the existing dev toggle (`MatchDetailsDev`) per card to show:

- **Trustworthy**:
  - The numeric `trustworthy` value.
  - Which of the six booleans were true (e.g. checklist or small bullet list).
- **Alignment**:
  - Overall alignment value.
  - `Activity alignment (0–1)`, `Host alignment (0–1)`, `Member alignment (0–1)`.
  - **Hosts:** table/list of hosts with `{ name?, portfolioId, score, rawSumSim }` sorted by score desc.
  - **Members:** list of members with `{ displayName?, userId, score, rawSumSim }` sorted by score desc.
- Optionally keep existing forward/backward/topic sections if still helpful, clearly labeled as **legacy vector match**.

Keep this dev panel behind the current “Match details (dev)” toggle and mark it as for development only so it can be removed later without impacting the ranking logic.

---

## 5. Testing strategy

- **Unit-level sanity checks (via dev tools / logging):**
  - Single activity with no friends/hosts/members → `trustworthy = 1`, `alignment ≈ 3` (assuming very low topic overlap).
  - Activity with one friend going and host joined project/community → verify `N_true` and `trustworthy` increments correctly.
  - Activities where hosts/members share many topics with the user → verify `a`, `h`, `m` are closer to 1 and alignment approaches 6.
- **Dev UI verification:**
  - For a known test user, manually construct cases (friend owner, friend going, host subscribed/joined) and compare what you expect vs. what dev panel shows.
  - Check that per-host and per-member scores are sorted and follow the normalization formula.
- **Performance:**
  - Ensure topic queries for hosts and members are batched (one `IN (...)` query for host portfolios, one for member `user_interests`), not per-entity queries, to keep latency acceptable on the explore page.

This plan keeps the new scoring model conceptually clean (trust × alignment) while reusing the existing topic expansion and interest infrastructure, and surfaces all critical internal signals in the existing dev toggle for debugging and tuning.