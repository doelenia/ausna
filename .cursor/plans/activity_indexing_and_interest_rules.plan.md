---
name: ""
overview: ""
todos: []
isProject: false
---

# Activity indexing, join interests, note asks, backfill, and indexing doc

## Overview

Add activity description indexing (mirroring project flow with web search, external vs non-external handling), add join-triggered interest updates (weight 0.1) for project/activity, confirm note ask extraction, backfill existing activities and project description_topics, and add a single source-of-truth indexing doc.

---

## 1. Activity description indexing (same process as project, web search, external handling)

**Goal:** Index activity portfolios like projects: extract atomic knowledge + asks + topics, use web search model, and either tie to creator (non-external) or leave `assigned_human` empty (external); topics and atomic knowledge always indexed.

**Extraction:** Extend extraction for `activity_description` and optional `externalLink`; use `gpt-4o-search-preview` with web search instructions. **Processing:** Add `processActivityDescription` in [lib/indexing/property-processing.ts](lib/indexing/property-processing.ts); cleanup and `source_type: 'activity_description'`; for external leave `assigned_human` empty and skip creator interests; for non-external set creator human portfolio and `updateUserInterests(userId, topicIds, 0.1)`; persist `metadata.description_topics` on activity. **API:** New `/api/index-activity-description`. **Trigger:** In [app/portfolio/[type]/[id]/actions.ts](app/portfolio/[type]/[id]/actions.ts) on activity description change, fire-and-forget to the new API.

---

## 2. Join project or activity: add portfolio topics to user interests (weight 0.1)

**Goal:** When a user joins a project or activity, take that portfolio’s existing topic IDs and run `updateUserInterests(joinedUserId, topicIds, 0.1)`.

**Topic source:** Persist `metadata.description_topics` when indexing project or activity. **Project:** Add at end of `processProjectDescription`: set `metadata.description_topics = allTopicIds`. **Fallback:** Helper `getTopicIdsForPortfolio(portfolioId)` — read `metadata.description_topics`; if missing, query `atomic_knowledge` for that source_id/source_type and aggregate distinct `topics`. **Shared helper:** `addPortfolioTopicsToUserInterests(portfolioId, userId)` using `getTopicIdsForPortfolio` then `updateUserInterests(userId, topicIds, 0.1)`. **Call from:** approveActivityJoinRequest, call-to-join join, invitation acceptance (project/activity), direct add member.

---

## 3. Note indexing: ensure ask extraction is supported

**Current state:** [app/api/index-note/route.ts](app/api/index-note/route.ts) already extracts and stores asks via `extractFromCompoundText` and `storeAtomicKnowledge`. **Action:** No code change; document in indexing doc.

---

## 4. Backfill script for existing activities

**Location:** e.g. `scripts/backfill-activity-indexing.ts`. **Steps:** Select all portfolios `type = 'activities'`; for each call `processActivityDescription` (or POST `/api/index-activity-description`) with description and external link; log success/failure; optional batching/rate limiting.

---

## 5. Backfill project `description_topics` from existing atomic knowledge

**Goal:** Populate `metadata.description_topics` for existing project portfolios using already-indexed `atomic_knowledge` rows (no re-extraction).

**Why it works:** When project descriptions were indexed, `storeAtomicKnowledge` wrote rows with `source_info->>'source_type' = 'project_description'` and `source_info->>'source_id' = portfolioId`. Each row has a `topics` column (UUID[]) with the topic IDs from that run. So we can derive the same set of topic IDs from those rows.

**Approach:**

1. **Query** — For each project portfolio (or in bulk), get rows from `atomic_knowledge` where `source_info->>'source_type' = 'project_description'` and `source_info->>'source_id' = portfolio.id`.
2. **Aggregate** — Collect distinct topic IDs from those rows (e.g. in SQL: `unnest(topics)` then `DISTINCT`, or in app code: merge arrays and dedupe).
3. **Write** — Update `portfolios.metadata` for that project: set `metadata.description_topics` to the aggregated array (JSONB array of UUIDs, consistent with merge migration and portfolio-topics usage).

**Implementation options:**

- **In the same backfill script** (e.g. `scripts/backfill-activity-indexing.ts` or a dedicated `scripts/backfill-project-description-topics.ts`): For each project portfolio, query distinct topic IDs from `atomic_knowledge` (unnest `topics` where `source_info` matches), then update that portfolio’s `metadata.description_topics`.
- **Or a single SQL migration/script:** One statement (or small PL/pgSQL block) that updates `portfolios.metadata` for all projects that have at least one such `atomic_knowledge` row, setting `description_topics` to the aggregated distinct topic IDs.

**When to run:** Once, before or together with the activity backfill, so join-based interest updates work for existing projects without re-running extraction.

---

## 6. Comprehensive indexing and interest-tracking document

**File:** [docs/indexing-and-interest-tracking.md](docs/indexing-and-interest-tracking.md). **Contents:** Overview of what gets indexed and how interests are updated; table of all source types (note, human_description, project_description, project_property, activity_description) with trigger, model, assigned human/project, creator interests; interest weights (human 3, project/activity/note/join 0.1); when interests are updated; external vs non-external activity behavior; note at top: "Update this doc when adding or changing any indexing source type, extraction flow, or interest weight."

---

## 7. Implementation order (suggested)

1. Doc stub — Add docs/indexing-and-interest-tracking.md with current rules.
2. Project description_topics — In `processProjectDescription`, persist `metadata.description_topics` and use `allTopicIds` for creator interests.
3. **Project description_topics backfill** — Run once: for each project (or bulk SQL), derive distinct topic IDs from `atomic_knowledge` (source_type=project_description, source_id=portfolioId), set `portfolio.metadata.description_topics`.
4. getTopicIdsForPortfolio + addPortfolioTopicsToUserInterests — Implement and use for join flows.
5. Activity extraction + processActivityDescription — New source type, API route, trigger; set description_topics on activity.
6. Activity backfill script — Process all existing activity portfolios.
7. Final doc update — Add activity_description, join-interest rules, backfills, and "update when changed" note.

---

## 8. Files to touch (summary)


| Area                 | Files                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Extraction           | lib/indexing/extraction.ts                                                                                 |
| Processing           | lib/indexing/property-processing.ts                                                                        |
| Vectors              | lib/indexing/vectors.ts                                                                                    |
| Interest join helper | lib/indexing/interest-tracking.ts                                                                          |
| API routes           | app/api/index-activity-description/route.ts; optionally app/api/process-join-interests/route.ts            |
| Triggers             | app/portfolio/[type]/[id]/actions.ts; app/api/portfolios/.../invitations/[inviteeId]/route.ts              |
| Backfill             | scripts/backfill-activity-indexing.ts; scripts/backfill-project-description-topics.ts (or combined script) |
| Doc                  | docs/indexing-and-interest-tracking.md                                                                     |


