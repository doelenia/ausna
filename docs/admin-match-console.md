# Admin Match Console

This document describes how the **Match** feature works in the admin area: how to open it, what data it uses, and the steps performed when you run a match (with or without a search keyword).

---

## Overview

The Admin Match Console lets an admin act as a specific user (the **searcher**) and find other users who match that user’s profile. Matching is based on:

- **Asks** (what the searcher is looking for) matched against **non-asks** (what others offer)
- **Non-asks** (what the searcher offers) matched against **asks** (what others are looking for)
- **Topic/interest overlap** (optional multiplier)
- **Optional keyword**: when provided, AI-generated “asks” from the keyword are also used and combined with the above

All of this uses **vector similarity** over embeddings stored in `atomic_knowledge` and (for topics) in `topics` / `user_interests`.

---

## How to Open the Match Console

1. **Go to Admin**  
   Navigate to `/admin` (admin-only; requires `requireAdmin()`).

2. **Open the Match tab**  
   In the admin UI, switch to the **Match** tab (see `components/admin/MatchTab.tsx`). This tab lists all users with a “View Match Console →” link per user.

3. **Open the console for one user**  
   Click **“View Match Console →”** for a user. You are taken to:
   - **URL**: `/admin/match/[id]`
   - **Page**: `app/admin/match/[id]/page.tsx`
   - **Component**: `MatchConsole` from `components/admin/MatchConsole.tsx`

The user whose ID is in the URL is the **searcher**: matches are computed **as if that user** is searching for people.

---

## What Loads When the Match Console Page Opens

When `/admin/match/[id]` loads, the **server** runs:

1. **`requireAdmin()`**  
   Ensures the current session is an admin.

2. **`getMatchData(id)`** (`app/admin/actions.ts`)  
   Fetches everything needed to render the searcher’s profile and context:
   - **User**: from Auth Admin API (`getUserById(id)`), plus `user_metadata` (e.g. `username`, `name`, `is_blocked`).
   - **Human portfolio**: from `portfolios` where `user_id = id` and `type = 'human'` (service client, so RLS is bypassed).
   - **Projects**: all project portfolios the user owns or is manager/member of (from `portfolios` with `type = 'projects'`).
   - **Notes**: up to 100 notes for `owner_account_id = id`, not deleted.

3. **`getUserInterests(id)`**  
   Fetches the searcher’s interests from `user_interests` (with topic names from `topics`) for display (e.g. “Interests” on the console).

4. **Render**  
   The page renders `MatchConsole` with:
   - `user`, `humanPortfolio`, `projects`, `notes`, `searcherInterests`.

The **client** then:

5. **Loads demo preference**  
   `getAdminDemoPreference()` so the list can be anonymized if “Demo mode” is on.

6. **Runs the first match**  
   After the demo preference is loaded, `performSearch('')` is called once (empty keyword). So **opening the console automatically runs a match** using the searcher’s full ask/non-ask profile (no keyword).

---

## Steps When You “Run” a Match

“Running a match” means triggering a **search** from the Match Console UI. The user can:

- **Leave the search box empty**  
  Match is based only on the searcher’s stored asks and non-asks (and topic multiplier).

- **Type a keyword**  
  Match combines:
  - A **specific search** driven by the keyword (AI-generated asks from the keyword).
  - The same **general match search** as above.
  - Combined score: **80% specific + 20% match** (see `combineSearchScores` in `lib/indexing/match-search.ts`).

The flow is implemented in **`searchMatches(userId, searchKeyword)`** in `app/admin/actions.ts`, which calls into `lib/indexing/match-search.ts`. Below are the concrete steps.

---

### 1. Entry: `searchMatches(userId, searchKeyword)` (admin action)

- **Where**: `app/admin/actions.ts`
- **Auth**: `requireAdmin()`.
- **Parameters**:
  - `userId`: the searcher (the user whose Match Console you’re on).
  - `searchKeyword`: optional; from the “Search Keyword” input (trimmed).

It then branches:

- **If `searchKeyword` is non-empty**:
  - `performSpecificSearch(userId, keyword)` → specific scores.
  - `performMatchSearch(userId)` → general match scores.
  - `finalScores = combineSearchScores(specificScores, matchScores)` → 80% specific, 20% match.
- **If `searchKeyword` is empty**:
  - Only `performMatchSearch(userId)`; its result is `finalScores`.

---

### 2. General match: `performMatchSearch(userId)` (no keyword)

**Where**: `lib/indexing/match-search.ts`

High-level steps:

1. **Load searcher’s asks and non-asks (with vectors)**  
   - `getUserAskVectors(userId)`  
     - Resolve user’s human portfolio; from `atomic_knowledge`: `is_asks = true`, `assigned_human` contains that portfolio, `knowledge_vector` not null; return id, text, embedding, topic IDs.
   - `getUserNonAskVectors(userId)`  
     - Same idea for `is_asks = false`.

2. **Optional AI augmentation**  
   - Load searcher’s human portfolio metadata and related projects.
   - Call OpenAI (e.g. gpt-4o-mini) to suggest **additional** asks and non-asks that are missing from the profile.
   - Append only **new** asks/non-asks (no duplicates). These may have no stored embedding yet (handled later when matching).

3. **Searcher’s human portfolio ID**  
   - `getUserHumanPortfolioId(userId)` used to exclude the searcher from candidate results and for scoring.

4. **Forward match (asks → others’ non-asks)**  
   - For each searcher **ask** (with or without stored embedding):
     - If no embedding, generate one via `generateEmbedding(askText)`.
     - Call Supabase RPC **`match_atomic_knowledge`** with:
       - `query_embedding`, `exclude_human_portfolio_ids: [searcherPortfolioId]`, `is_asks_filter: false`, `match_count: 100`.
     - Results are grouped by user (via portfolio → user); per user, keep **max similarity** and best-matched knowledge text/id.
   - Per user, **forward score** = `0.8 * maxSimilarity + 0.2 * averageSimilarity` over all ask-based similarities.
   - Implemented in **`calculateMatchScores(asks, searcherPortfolioId)`** which uses **`searchMatchesForAsk`**.

5. **Backward match (non-asks → others’ asks)**  
   - For each searcher **non-ask**:
     - Same idea: embed if needed, call **`match_atomic_knowledge`** with `is_asks_filter: true` (match to others’ asks).
     - Group by user; keep max similarity and best-matched ask text/id.
   - Implemented in **`calculateBackwardMatchScores(nonAsks, searcherPortfolioId)`** which uses **`searchMatchesForNonAsk`**.

6. **Combine forward and backward**  
   - For each candidate user:  
     `combined = forwardScore * sqrt(1 + backwardScore)`  
   - Stored in `baseScores`.

7. **Topic/interest multiplier**  
   - Collect all topic IDs from searcher’s asks and non-asks.
   - **Expand topics**: for each searcher topic, call RPC **`match_topics`** to get similar topics (e.g. threshold 0.2, top 3); build a map of (target topic → similarity, source searcher topic).
   - From **`user_interests`**, get which of these (expanded) topics each candidate user has.
   - For each candidate user, compute a **topic sum** (sum of similarities for matching topics).
   - **Multiplier** = `sqrt(topicSum + 1)`.
   - **Final score** = `baseScore * multiplier`.
   - Topic match details (searcher topic, target topic, similarity, multiplier) are returned as **topicDetails** for the UI.

8. **Return**  
   - `scores`: Map of `userId → final score`  
   - `forwardDetails`, `backwardDetails`, `topicDetails`: for each user, which asks/non-asks matched which knowledge/asks and topic breakdown.

---

### 3. Specific search (when keyword is provided): `performSpecificSearch(userId, keyword)`

**Where**: `lib/indexing/match-search.ts`

1. **Generate asks from keyword**  
   - **`generateAsksFromKeyword(keyword)`**: calls OpenAI to produce 3–5 single-sentence “asks” that represent what someone searching for that keyword might want. Returns an array of ask strings.

2. **If no asks**  
   - Return empty scores and details.

3. **Searcher portfolio**  
   - `getUserHumanPortfolioId(userId)` to exclude searcher from results.

4. **Match keyword asks**  
   - Treat the generated asks as a list of “ask” items (no stored IDs).  
   - **`calculateMatchScores(askItems, searcherPortfolioId)`**: for each ask, generate embedding (no stored vector), call **`match_atomic_knowledge`** (non-asks), aggregate per user (80% max + 20% average).  
   - Return **scores** and **details** (which generated ask matched which knowledge text).

---

### 4. Combining specific and general: `combineSearchScores(specificScores, matchScores)`

**Where**: `lib/indexing/match-search.ts`

- For every user that appears in either map:  
  `combinedScore = 0.8 * specificScore + 0.2 * matchScore`
- Used only when a keyword was provided.

---

### 5. After scores are computed (in `searchMatches`)

1. **Sort and cap**  
   - Sort users by score descending, take **top 50**.

2. **Enrich with user and portfolio data**  
   - **Users**: `serviceClient.auth.admin.listUsers()` to get email, username, name for the top 50 user IDs.
   - **Descriptions**: from `portfolios` (type `human`) for those user IDs, read `metadata.basic.description`.

3. **Build response**  
   - List of matches: `userId`, `email`, `username`, `name`, `score`, `description`.
   - **matchDetails**: forwardDetails, backwardDetails, topicDetails (and, when keyword was used, specificDetails) converted to plain objects for JSON.

4. **UI**  
   - `MatchConsole` receives the result and shows the list in **MatchSearchResults**.
   - Clicking a user opens **MatchUserDetail** (breakdown by forward/backward/specific/topic, profile, projects, and optional AI “match explanation” via `getMatchExplanation`).

---

## Summary: Steps to “Run” a Match

| Step | What happens |
|------|-------------------------------|
| 1 | Admin opens `/admin` → Match tab → “View Match Console” for user **U** → `/admin/match/U` loads. |
| 2 | Server: `getMatchData(U)`, `getUserInterests(U)`; page renders `MatchConsole` with profile, projects, notes, interests. |
| 3 | Client: load demo preference; then run **first search** with empty keyword → `searchMatches(U, '')` → `performMatchSearch(U)`. |
| 4 | **performMatchSearch(U)**: load ask/non-ask vectors, optionally augment with AI, forward match (asks → non-asks), backward match (non-asks → asks), combine with `forward * sqrt(1 + backward)`, apply topic multiplier, return scores + details. |
| 5 | If user later types a **keyword** and search runs again: `performSpecificSearch(U, keyword)` (asks from keyword → match to non-asks) and `performMatchSearch(U)` run; scores combined 80% specific / 20% match. |
| 6 | Top 50 users by score are fetched (auth + portfolios for descriptions); results and details are shown in the console. Clicking a user opens the detail view (breakdown + optional AI explanation). |

---

## Key Files

| Area | File |
|------|------|
| Page | `app/admin/match/[id]/page.tsx` |
| Console UI | `components/admin/MatchConsole.tsx` |
| User list (entry) | `components/admin/MatchTab.tsx` |
| Detail view | `components/admin/MatchUserDetail.tsx` |
| Admin actions | `app/admin/actions.ts` (`getMatchData`, `getUserInterests`, `searchMatches`, `getMatchBreakdown`, `getMatchExplanation`) |
| Match logic | `lib/indexing/match-search.ts` (`performMatchSearch`, `performSpecificSearch`, `combineSearchScores`, `calculateMatchScores`, `calculateBackwardMatchScores`, `searchMatchesForAsk`, `searchMatchesForNonAsk`, `generateAsksFromKeyword`, topic expansion and multiplier) |
| DB / RPC | Supabase: `portfolios`, `atomic_knowledge`, `topics`, `user_interests`, `notes`; RPCs `match_atomic_knowledge`, `match_topics` |

---

## Demo mode

Admins can toggle “Demo mode (anonymize in match console)” in the Match tab. When enabled, the console masks names, emails, and descriptions (see `lib/admin/demoAnonymization`). The preference is stored in the admin user’s metadata and loaded before the first match so the initial list is already anonymized if demo is on.
