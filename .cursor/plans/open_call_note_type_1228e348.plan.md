---
name: Open Call Note Type
overview: Add a new note type open_call with metadata (title, interested, begin/end dates), a dedicated create flow from the nav plus menu, and a note view that disables comments/likes and shows "Interested" and "Talk to author" actions. Database changes are applied via Supabase MCP.
todos: []
---

# Open Call Note Type Implementation

## 1. Database migration (via Supabase MCP)

Apply migration using MCP tool `apply_migration` with:

- **Add `metadata` column** to `notes`: `JSONB DEFAULT '{}'::jsonb`. This stores open-call-specific data: `{ title?: string, interested?: string[], begin_date?: string, end_date?: string }`.
- **Extend `type` constraint**: Drop existing `notes_type_check` (if present) and add a new check so `type` allows `'post' | 'annotation' | 'reaction' | 'open_call'`.

Existing constraint is in [migrations/add_type_to_notes.sql](migrations/add_type_to_notes.sql). The migration will:

1. `ALTER TABLE notes ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;`
2. `ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_type_check;`
3. `ALTER TABLE notes ADD CONSTRAINT notes_type_check CHECK (type IN ('post', 'annotation', 'reaction', 'open_call'));`
4. Add a short `COMMENT ON COLUMN notes.metadata` for documentation.

No new tables; open call data lives on the same `notes` row.

---

## 2. Types

**File: [types/note.ts](types/note.ts)**

- Extend `Note.type` to include `'open_call'`.
- Add optional `metadata?: Record<string, unknown>` to `Note` (for open call: `title`, `interested`, `begin_date`, `end_date`).
- In `CreateNoteInput` and `UpdateNoteInput`: add `type` and optional `metadata`.
- Add a small helper type or JSDoc for open-call metadata shape.

---

## 3. Nav bar: "Open call" first in Create menu

**File: [components/main/TopNav.tsx](components/main/TopNav.tsx)**

In the Create menu, add **Open call** as the **first** option (before "New note"): link to `/notes/create/open-call`. Order: **Open call** → New note → New activity → New project.

---

## 4. Create Open Call route and form

**New page: `app/notes/create/open-call/page.tsx`**

Reuse the same data loading as the regular create note page; render `CreateNoteForm` with `isOpenCall={true}`.

**File: [components/notes/CreateNoteForm.tsx](components/notes/CreateNoteForm.tsx)**

- Add prop `isOpenCall?: boolean`.
- When `isOpenCall`: page/title "Create Open call", submit "Create Open call"; hide "Who can comment" and "Collections" in Advanced settings; keep assigned project, picture, collaborator, link.
- **Begin date**: Auto-set to the date the open call is posted. No user input; set on server when creating the note (e.g. `metadata.begin_date = new Date().toISOString()` or date-only).

### End date section (open call form only)

- **Placement**: Right below the note content (text + references), **before** Advanced settings.
- **Default**: "Ends in 7 days" (default option in most cases). Store as `end_date` (ISO or date-only) computed from now + 7 days, or store a sentinel for "never ends."
- **Display**: Show a single line such as "Ends in 7 days" (or "Ends on [date]" if calendar-picked, or "Never ends"). This line is **clickable** to open the "Edit end date" popup.
- **Popup (Edit end date)**:
  - **Option A – End in X days**: Presets (e.g. 7, 14, 30 days). User picks one; we set `end_date` to now + X days.
  - **Option B – Calendar**: Date picker to choose a specific end date.
  - **Option C – Never ends**: No end date. When this is selected:
    - Show a notice in **both** places: (1) in the form, next to the end date display (e.g. under or beside "Never ends"), and (2) inside the popup. Text: **"Setting never ends might lower the priority for broadcasting."**
  - Popup has Confirm/Cancel (or Save/Cancel).
- **In the form**: If user chose "Never ends," next to the end date display (e.g. "Never ends") show the same warning: "Setting never ends might lower the priority for broadcasting."

Form submit: send `open_call_title`, `open_call_begin_date` (server-set from post time), `open_call_end_date` (or a flag for never ends). Server writes `metadata: { title, interested: [], begin_date, end_date? }`.

---

## 5. Note view page: open call layout and actions

**File: [app/notes/[id]/page.tsx](app/notes/[id]/page.tsx)** – No routing change; open call notes still at `/notes/[id]`.

**File: [components/notes/NoteView.tsx](components/notes/NoteView.tsx)**

- If `note.type === 'open_call'`:
  - **Header**: Orange megaphone icon + "Open call" text (heading style). If `metadata.end_date` is set, " · ends in X days"; if no end date (never ends), no "ends in" part.
  - **Body**: Use `NoteCard` for title (`metadata.title`), authors, created time, place, references, content. Pass a prop so NoteCard does not render comment/like row for open_call.
  - **Comments**: Do not render comments section or AnnotationComposer.
  - **Actions**: Below the card: **Interested** (primary, star icon), **Talk to author** (secondary, share icon) → `/messages/[owner_account_id]`.

**File: [components/notes/NoteCard.tsx](components/notes/NoteCard.tsx)**

- When `note.type === 'open_call'`: hide the entire Reactions & comments row. For open call, title can come from `note.metadata?.title` when present.

---

## 6. "Interested" API and client

**New API: `app/api/notes/[noteId]/interested/route.ts`**

- **GET**: Return `{ interested: string[] }` from `note.metadata.interested`.
- **POST** (toggle): Require auth. If note is not `open_call` return 400. Toggle current user in `metadata.interested`; update note `metadata`; return updated `interested` list.

**NoteView**: "Interested" button calls this API and updates UI (state or refetch).

---

## 7. Disable comments and likes for open_call

- **Annotations**: In `getAnnotationsByNote` or the annotations API route, if target note `type === 'open_call'` return empty. Reject creating annotations when parent note is open_call.
- **Reactions**: In reactions GET/POST, if target note `type === 'open_call'` return empty (GET) or 403/400 (POST).

---

## 8. Implementation order (suggested)

1. Migration (MCP) – add `metadata`, extend `type` constraint.
2. Types – `open_call` and `metadata` in [types/note.ts](types/note.ts).
3. createNote – support `open_call` and metadata; auto-set `begin_date` to post time.
4. TopNav – "Open call" first in Create menu.
5. Create form – open-call page + CreateNoteForm `isOpenCall`; **end date section** (below content, before Advanced) with clickable "Ends in X days" and popup (X days / calendar / never + "never ends" warning in form and popup); begin date server-set.
6. NoteCard – hide comment/like for open_call; use `metadata.title` when present.
7. NoteView – open call header, hide comments, Interested + Talk to author.
8. Interested API – GET/POST toggle and wire NoteView.
9. Annotations/Reactions – guard open_call.

---

## 9. MCP migration

Use Supabase MCP `apply_migration` with **name** e.g. `add_notes_metadata_and_open_call_type` and **query** SQL: add `metadata` column, drop and re-add `notes_type_check` to include `'open_call'`, add comment on `metadata`.
