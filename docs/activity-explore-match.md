# Activity Explore Match

This document describes the **activity ranking** on the explore page: how activities are scored for the logged-in user using the same match logic as the admin (user) match, plus time decay and two multipliers.

---

## Overview

- **Where**: Activity explore page (`/explore`). A "Run match" button runs the match for the current user and shows a "Ranked for you" section on top with scores beside each activity title.
- **Activity set**: The match runs on the **same** activities as the explore list (visibility, open-to-join, user not joined, and at least one of: external, friend in activity, host in subscribed/joined, same city, or online).
- **Schedule**: The match is intended to run **once per day at 8am** for each non-pseudo account. That job is **not implemented yet**; for now only the manual "Run match" button is available. Implementation (e.g. Vercel cron + serverless function, or background job iterating users and calling the same pipeline) is left for later.

---

## Match pipeline

1. **User profile**: Same as admin match — user’s asks and non-asks (with embeddings and topic IDs), enriched by AI from profile and projects.
2. **Forward**: User’s asks matched against **activity description** non-asks (atomic knowledge with `source_info.source_type = 'activity_description'` and `source_info.source_id` in the activity list). Vector search via `match_atomic_knowledge_for_activities` RPC.
3. **Backward**: User’s non-asks matched against activity description asks.
4. **Time decay**: When aggregating similarities per activity, each matched atomic knowledge row is weighted by **time decay** so newer content counts more. Formula: `weight = 1 / (1 + k * days_old)` with `k = 0.1` (so ~0.5 at 10 days). Applied to the **activity-side** (matched) row’s `created_at`.
5. **Aggregation**: Per activity, forward (and backward) scores use the same rule as admin match: **80% max + 20% average** of the decay-weighted similarities.
6. **Base score**: `forward * sqrt(1 + backward)` (same as admin match).
7. **Topic multiplier**: Searcher topic IDs (from asks/non-asks) are expanded via `getExpandedTopicsWithSimilarity`; each activity’s topics come from `getTopicIdsForPortfolio` (activity description). Multiplier = `sqrt(interest_sum + 1)` where `interest_sum` is the sum of expansion similarities for topics that appear in both searcher and activity.
8. **Host multiplier**: **1** if the user has subscribed or joined the activity or any of its host projects/communities; otherwise **0.8**.
9. **Friends-going multiplier**: `1 + log10(1 + count)` where `count` is the number of the user’s friends who are in the activity’s members (or 1 when count is 0).

Final score = base × topic × host × friends-going.

---

## Implementation notes

- **RPC**: `match_atomic_knowledge_for_activities` in `migrations/20260301_match_atomic_knowledge_for_activities.sql` filters `atomic_knowledge` by `source_info` (handles double-encoded JSON) and returns `source_id`, `similarity`, `created_at`.
- **Pipeline**: `lib/indexing/activity-match.ts` — `runActivityMatchPipeline`. Reuses `getUserAskVectors`, `getUserNonAskVectors`, `getExpandedTopicsWithSimilarity` from `lib/indexing/match-search.ts` and `getTopicIdsForPortfolio` from `lib/indexing/interest-tracking.ts`.
- **Action**: `runActivityMatch(userId)` in `app/explore/actions.ts` loads the explore list, fetches portfolio metadata for host/members, then runs the pipeline and returns ranked `{ id, score }[]`.

---

## Daily run (stub)

A daily run at **8am for each non-pseudo account** is planned but not implemented. When adding it:

- Use the same pipeline (`runActivityMatchPipeline`) and the same activity set as the explore filter.
- Consider storing results (e.g. table or cache) so the explore page can show ranked results without running the match on every load.
- Skip or filter pseudo accounts (e.g. by portfolio or user metadata).
