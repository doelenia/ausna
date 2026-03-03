---
name: fix-activity-alignment-to-topic-graph-copyy
overview: Clean up debug logging and rework activity alignment scoring to use full topic-name vector search from activity/host/member topics to expanded user-interest topics as parents.
todos:
  - id: remove-debug-logs
    content: Remove debug fetch-based instrumentation from lib/indexing/activity-match.ts
    status: pending
  - id: parent-topic-graph
    content: Build parent topic graph from user_interests and expanded topics with name vectors
    status: pending
  - id: load-entity-topic-vectors
    content: Load name vectors for all activity, host, and member description topics
    status: pending
  - id: best-parent-search
    content: Implement vector search from each description topic to parent topics and compute agg/mem contributions
    status: pending
  - id: ui-verify
    content: Verify Explore dev panel displays updated similarity and scores correctly for activities, hosts, and members
    status: pending
isProject: false
---

### Goal

Implement the correct activity alignment algorithm:

- No leftover debug instrumentation.
- Build a parent topic graph from user interests and expanded topics.
- For each activity/host/member description topic, compute similarity to that parent set via name vectors and derive aggregate/memory contributions as specified.

### Key files to touch

- `[lib/indexing/activity-match.ts](lib/indexing/activity-match.ts)`: Alignment score computation and `ActivityMatchDetails` shape.
- `[lib/indexing/match-search.ts](lib/indexing/match-search.ts)`: Topic expansion utilities and access to topic vectors.
- `[components/explore/ExploreView.tsx](components/explore/ExploreView.tsx)`: Dev panel display of alignment details (update to reflect new data structures, but keep UX stable).

### Plan

1. **Remove debug instrumentation**

- In `activity-match.ts`, remove the `fetch(...)`-based debug logging block inside `computeTypeScore` that posts to the debug server.
- Ensure no other temporary debug logs (e.g., for trustworthy/alignment) remain.
- Re-run TypeScript lints for `activity-match.ts` and fix any residual type issues from cleaning up the log payload.

1. **Refactor data structures for alignment**

- Keep existing `ActivityMatchDetails.alignment` public API generally stable (userInterestTopics, activityTopTopics, hosts, members, expandedTopics) so the dev UI remains usable.
- Internally, introduce a clear representation of **parent interest topics**:
  - Parent set = original `user_interests` topics + all expanded topics, each tied to a parent interest ID and inheriting its aggregate/memory.
  - Consider a small helper type, e.g. `ParentTopic = { id, parentId, similarityFromParent, agg, mem, nameVector }`.

1. **Build the parent topic graph once per run**

- In `runActivityMatchPipeline` after we have `assignedTopicIdsForAlignment`:
  - Call `getExpandedTopicsWithSimilarity(assignedTopicIds)` as now to get expanded topic IDs + similarity + `sourceSearcherTopicId` (parent interest ID).
  - Fetch **all parent and expanded topics** from `topics` with `id IN (...)` and select `id, name_vector`.
  - Combine with `user_interests` to produce a consolidated in-memory array of parents:
    - For each original interest topic: `similarityFromParent = 1`, `parentId = self`, agg/mem from `user_interests`.
    - For each expanded topic: `similarityFromParent = expansion.similarity`, `parentId = expansion.sourceSearcherTopicId`, agg/mem inherited from the parent interest.
  - Pre-normalize and store `nameVector` as `number[]` for each parent using `normalizeVector` logic like in `match-search.ts`.

1. **Load description topic vectors for entities**

- For each entity type (activity, host portfolio, member user):
  - Activity: get `description_topics` via `getTopicIdsForPortfolio(activityId)` (already used).
  - Hosts: `getTopicIdsForPortfolio` for each host portfolio ID.
  - Members: use `user_interests` topics as today (their topic IDs), but now we also need `name_vector` for those topics.
- Fetch `topics.id, name_vector` once for the **union** of all description-topic IDs across activities/hosts/members.
- Build per-entity arrays like `activityTopicVectors[activityId] = Array<{ topicId, vector }>`.

1. **Implement actual vector search from description topics to parents**

- Implement a pure-TS helper in `activity-match.ts`:

```ts
  function bestParentForTopic(topicVector: number[], parents: ParentTopic[]): {
    parent: ParentTopic | null;
    similarity: number;
  }
  

```

- For each parent with non-null `nameVector`, compute cosine similarity: `1 - cosineDistance` using a small helper (reused from or consistent with existing vector utils).
- Return the parent with max similarity and that similarity value.
- In `computeTypeScore`:
  - Replace the current `similarityMap`-based lookup with a call to `bestParentForTopic` using the preloaded `topicVector` and parent list.
  - If `bestParent` is null or similarity is below a small floor (e.g. 0.1), treat as no contribution (similarity 0).
  - Otherwise:
    - `aggContrib = similarity * bestParent.agg; memContrib = similarity * bestParent.mem`.
    - Accumulate into `rawAgg` and `rawMem`.
    - Record per-topic dev data: `{ topicId, similarity, aggregate: bestParent.agg, memory: bestParent.mem }`.

1. **Keep normalization and structure the same**

- Leave the existing squash and aggregation logic as-is:
  - `aggPart = normToHalf(rawAgg)`, `memPart = normToHalf(rawMem)`, `score = aggPart + memPart`.
  - Set `activityScore`, `hostScore`, `memberScore` using this `score`.
- Ensure `activityTopTopics`, `hosts[*].topTopics`, and `members[*].topTopics` still expose the full list of description topics with their computed `{ similarity, aggregate, memory }` values for dev inspection.

1. **Update / confirm dev UI expectations**

- In `[components/explore/ExploreView.tsx](components/explore/ExploreView.tsx)`, confirm that:
  - Topic rows for activities/hosts/members show similarity, aggregate, and memory derived from the new parent-matching algorithm.
  - The “Expanded topics from interests” section continues to show the interest-side expansion graph (source interest → expanded topic), which is now purely informational.
- No structural UI changes are strictly required, just verify that the fields exist and compile.

1. **Testing and validation**

- For a user with known interests (e.g. `Networking` with `agg = 0.1`), create/choose an activity whose description topics include `Networking` and variants like `Networking Events`.
- Verify via dev panel:
  - `Networking` as a description topic gets similarity ≈ 1 and aggregate ≈ 0.1.
  - `Networking Events` gets a meaningful similarity (< 1 but > 0) to the same parent, with contributions `similarity * 0.1`.
- Confirm that:
  - Activities with many unrelated topics keep similarity ≈ 0 and alignment ≈ 3.
  - Performance is acceptable (vector loops are bounded by number of topics/parents, not by entire DB).

1. **Cleanup**

- Once validated, remove or simplify any now-redundant expanded-topic logic that still assumes ID-based matching (e.g. old `similarityMap` usage) so there is a single, clear code path based on vector comparison.
- Re-run lints and type-checks for `activity-match.ts`, `match-search.ts`, and the Explore view.

