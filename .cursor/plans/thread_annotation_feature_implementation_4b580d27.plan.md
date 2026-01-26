---
name: Thread/Annotation Feature Implementation
overview: Implement a comprehensive thread/annotation feature where notes can be annotated with comments and nested replies. Annotations are hidden from feeds/portfolios and only appear under the parent note. Includes privacy controls, inline composer, and threaded reply display.
todos:
  - id: db_migration
    content: Create migration to add annotation_privacy field to notes table
    status: completed
  - id: update_types
    content: Update Note type to include annotation_privacy field
    status: completed
    dependencies:
      - db_migration
  - id: filter_annotations_feeds
    content: Filter out annotations (mentioned_note_id IS NOT NULL) from feed and portfolio queries
    status: completed
    dependencies:
      - db_migration
  - id: enhanced_annotation_fetching
    content: Update getAnnotationsByNote to return threaded structure with replies
    status: completed
    dependencies:
      - db_migration
  - id: permission_checking
    content: Implement canAnnotateNote function to check privacy settings and permissions
    status: completed
    dependencies:
      - update_types
  - id: update_create_annotation
    content: Update createAnnotation to support replies and inherit parent note settings
    status: completed
    dependencies:
      - permission_checking
  - id: privacy_api
    content: Create API endpoint to update annotation_privacy setting
    status: completed
    dependencies:
      - update_types
  - id: privacy_dropdown
    content: Add annotation privacy dropdown to NoteActions component
    status: completed
    dependencies:
      - privacy_api
  - id: annotation_composer
    content: Create AnnotationComposer component with mobile/desktop positioning
    status: completed
    dependencies:
      - update_create_annotation
  - id: comment_thread
    content: Create CommentThread component for displaying threaded comments with replies
    status: completed
    dependencies:
      - enhanced_annotation_fetching
  - id: update_note_view
    content: Update NoteView to show composer and threaded comments
    status: completed
    dependencies:
      - annotation_composer
      - comment_thread
  - id: update_note_card_feed
    content: Update NoteCard to show at most 1 comment in feed with more comments link
    status: completed
    dependencies:
      - enhanced_annotation_fetching
  - id: update_feed_components
    content: Update FeedView and NotesFeed to pass showComments prop to NoteCard
    status: completed
    dependencies:
      - update_note_card_feed
  - id: message_type_migration
    content: Create migration to add message_type field to messages table
    status: completed
  - id: comment_notifications
    content: Implement comment notification logic in createAnnotation to send messages to note/comment authors
    status: completed
    dependencies:
      - message_type_migration
      - update_create_annotation
  - id: update_message_display
    content: Update message display components to handle comment_preview message type
    status: completed
    dependencies:
      - message_type_migration
  - id: annotation_api_endpoint
    content: Create API endpoint for fetching annotations with pagination support
    status: completed
    dependencies:
      - enhanced_annotation_fetching
  - id: dynamic_loading_noteview
    content: Implement dynamic loading of annotations in NoteView (client-side, after initial render)
    status: completed
    dependencies:
      - annotation_api_endpoint
      - comment_thread
  - id: lazy_load_feed_comments
    content: Implement lazy loading of comments in NoteCard feed view using IntersectionObserver
    status: completed
    dependencies:
      - annotation_api_endpoint
      - update_note_card_feed
  - id: lazy_load_replies
    content: Implement on-demand loading of replies in CommentThread component
    status: completed
    dependencies:
      - annotation_api_endpoint
      - comment_thread
---

# Thread/Annotation Feature Implementation

## Overview

Bring back and enhance the annotation feature to support threaded discussions on notes. Annotations (comments) will not appear in feeds or portfolios, only under the parent note. Users can reply to comments, creating nested threads.

## Database Changes

### Migration 1: Add annotation privacy field

- File: `migrations/add_annotation_privacy_to_notes.sql`
- Add `annotation_privacy` column to `notes` table (TEXT, default 'everyone')
- Add CHECK constraint: `annotation_privacy IN ('authors', 'friends', 'everyone')`
- Add index on `annotation_privacy` for filtering

### Migration 2: Add message type field

- File: `migrations/add_message_type_to_messages.sql`
- Add `message_type` column to `messages` table (TEXT, default 'text')
- Add CHECK constraint: `message_type IN ('text', 'comment_preview')`
- `'text'`: Regular text message (existing behavior)
- `'comment_preview'`: Comment notification with preview of the comment note
- Add index on `message_type` for filtering

## Backend Changes

### 1. Update Note Type

- File: `types/note.ts`
- Add `annotation_privacy?: 'authors' | 'friends' | 'everyone'` to `Note` interface

### 2. Filter annotations from feeds/portfolios

- Files: `app/main/actions.ts`, `app/api/portfolios/[portfolioId]/notes/route.ts`
- Exclude notes where `mentioned_note_id IS NOT NULL` from feed queries
- This ensures annotations never appear in feeds or portfolio views
- Note: `mentioned_note_id` simply records what the note is replying to (top-level note or parent annotation)

### 3. Enhanced annotation fetching with threading

- File: `app/notes/actions.ts`
- Update `getAnnotationsByNote` to:
- Fetch all annotations where `mentioned_note_id` = noteId (top-level comments)
- For each annotation, fetch replies where `mentioned_note_id` = annotationId
- Build tree structure top-down: `{ annotation: Note, replies: Note[] }[]`
- Order by `created_at` ascending
- Note: `mentioned_note_id` just records what the note is replying to - we populate the tree structure top-down
- Add pagination support: `getAnnotationsByNote(noteId: string, offset?: number, limit?: number)`
- Default limit: 20 annotations per page
- Return `{ notes: Note[], hasMore: boolean, totalCount?: number }`

### 4. Permission checking for annotations

- File: `app/notes/actions.ts`
- Create `canAnnotateNote(noteId: string, userId: string): Promise<boolean>`
- Check `annotation_privacy`:
- `'everyone'`: always true (if authenticated)
- `'friends'`: check if user is friend of note owner
- `'authors'`: check if user is note owner or member of assigned portfolios
- Update `createAnnotation` to use this check

### 5. Update annotation privacy API

- File: `app/api/notes/[noteId]/annotation-privacy/route.ts` (new)
- POST endpoint to update `annotation_privacy` field
- Only note owner can update

### 5b. Annotation fetching API endpoint

- File: `app/api/notes/[noteId]/annotations/route.ts` (new)
- GET endpoint to fetch annotations for a note
- Query params: `offset` (default 0), `limit` (default 20), `includeReplies` (default false)
- Returns paginated annotations with `hasMore` flag
- Optimized query: fetch annotations and replies in single query with joins
- Cache-friendly: supports ETag/conditional requests

### 6. Create annotation action

- File: `app/notes/actions.ts`
- Update `createAnnotation` to:
- Support replying to annotations (set `mentioned_note_id` to parent annotation ID)
- Inherit `assigned_portfolios` from parent note (not from annotation)
- Set `annotation_privacy` to parent note's setting (for replies)
- After creating annotation, send notification messages to:
    - Note owner (if annotation is reply to note)
    - Annotation author (if annotation is reply to another annotation)
- Only send if recipient is not the comment author (don't notify self)

### 7. Comment notification messages

- File: `app/notes/actions.ts`
- Create helper function `sendCommentNotification(commentNote: Note, recipientId: string)`
- When annotation is created:
- If replying to a note (`mentioned_note_id` = noteId): send message to note owner
- If replying to an annotation (`mentioned_note_id` = annotationId): 
    - Fetch parent annotation to get its owner
    - Send message to parent annotation owner
- Message structure:
- `message_type`: `'comment_preview'`
- `note_id`: The comment note ID (the annotation that was created)
- `text`: Preview text from comment (truncated if needed)
- `sender_id`: Comment author
- `receiver_id`: Note/annotation owner
- Don't send if comment author is the recipient (no self-notifications)

## Frontend Changes

### 1. Annotation Privacy Dropdown

- File: `components/notes/NoteActions.tsx`
- Add dropdown menu item to change `annotation_privacy`
- Show current setting with checkmark
- Call API to update privacy

### 2. Annotation Composer Component

- File: `components/notes/AnnotationComposer.tsx` (new)
- Simplified editor (text + references only)
- Props:
- `parentNoteId: string` - the note being annotated
- `parentAnnotationId?: string` - if replying to a comment
- `replyToName?: string` - name to show in "reply to [name]"
- `onSuccess: () => void` - callback after creation
- `onCancel?: () => void` - cancel callback
- Features:
- Text editor (textarea)
- Image upload (reuse from CreateNoteForm)
- URL reference input
- Submit button
- Cancel button (if onCancel provided)
- Mobile: Fixed at bottom (like chat composer)
- Desktop: Inline where triggered

### 3. Comment Thread Component

- File: `components/notes/CommentThread.tsx` (new)
- Display threaded comments with replies
- Props:
- `comment: Note` - the comment/annotation
- `replies: Note[]` - nested replies (loaded dynamically)
- `currentUserId?: string`
- `onReply: (commentId: string, authorName: string) => void`
- `canReply: boolean`
- `loadReplies?: (commentId: string) => Promise<Note[]>` - function to load replies on demand
- Features:
- Show comment author, text, timestamp
- Show "reply to [name]:" prefix for replies
- Collapsible long text (expand/collapse)
- **Lazy load replies**: Only fetch replies when user expands or clicks "Show X more replies"
- Show at most 1 reply initially, "Show X more replies" button
- Collapse/expand replies
- Reply button (disabled if no permission)
- Recursive rendering for nested replies (with lazy loading)
- Loading states for replies being fetched

### 4. Update NoteView Component

- File: `components/notes/NoteView.tsx`
- **Dynamic Loading**: Don't fetch annotations on initial server render
- Load annotations client-side after note card is displayed
- Add annotation composer below note card (always visible)
- Show loading state while fetching annotations
- Show all comments in threaded structure (loaded dynamically)
- Pass `canAnnotate` prop to composer (disable if false)
- Show login hint if user not authenticated
- Handle reply state (which comment is being replied to)
- Implement infinite scroll or "Load more" button for annotations
- Use React Suspense or loading states for smooth UX

### 5. Update NoteCard for Feed Display

- File: `components/notes/NoteCard.tsx`
- Add prop: `showComments?: boolean` (default false)
- **Dynamic Loading**: Only fetch comments when `showComments=true` AND component is visible (using IntersectionObserver)
- When `showComments=true`:
- Use lazy loading: fetch annotations client-side only when card is in viewport
- Show loading skeleton while fetching
- Show at most 1 top-level comment (first annotation)
- Show "X more comments" link if more exist (fetch count separately for performance)
- Link to note view page
- Cache fetched annotations to avoid re-fetching

### 6. Update Feed Components

- Files: `components/main/FeedView.tsx`, `components/portfolio/NotesFeed.tsx`
- Pass `showComments={true}` to NoteCard in feed views
- This shows comment preview in feed

### 7. Mobile Composer Positioning

- File: `components/notes/AnnotationComposer.tsx`
- Use fixed positioning on mobile (`fixed bottom-0 left-0 right-0`)
- Show "reply to [name]" text when replying
- Desktop: Render inline where triggered

### 8. Desktop Inline Composer

- File: `components/notes/CommentThread.tsx`
- When reply button clicked, show composer directly below that comment
- Show "reply to [name]" text
- Cancel button to hide composer

### 9. Update Message Display for Comment Previews

- Files: `components/messages/MessageNoteCard.tsx` (if exists), `app/messages/[userId]/page.tsx`
- Handle `message_type: 'comment_preview'` messages
- Display comment preview with:
- Link to the note being commented on
- Preview of comment text
- Author information
- "View comment" button/link that navigates to note view page
- Style differently from regular text messages (e.g., card-like appearance)

## Data Flow

```javascript
Note (parent)
├── annotation_privacy: 'everyone' | 'friends' | 'authors'
└── Annotations (mentioned_note_id = note.id)
    ├── Comment 1
    │   └── Replies (mentioned_note_id = comment1.id)
    │       ├── Reply 1.1
    │       └── Reply 1.2
    └── Comment 2
        └── Replies (mentioned_note_id = comment2.id)
```



## Key Implementation Details

1. **Performance & Loading Strategy**:

- **Server-side**: Note page loads without annotations (fast initial load)
- **Client-side**: Annotations loaded dynamically after note card renders
- **Feed view**: Comments only loaded when card is in viewport (IntersectionObserver)
- **Replies**: Loaded on-demand when user expands or clicks "Show more"
- **Pagination**: Use offset/limit for large comment threads
- **Caching**: Cache fetched annotations to avoid duplicate requests
- **Optimistic updates**: Show new comments immediately after creation, then sync

2. **Privacy Logic**:

- `'everyone'`: Any authenticated user can comment
- `'friends'`: Only friends of note owner can comment
- `'authors'`: Only note owner and portfolio members can comment

2. **Reply Structure**:

- `mentioned_note_id` simply records what the note is replying to
- Top-level annotation: `mentioned_note_id` = parent note ID
- Reply to annotation: `mentioned_note_id` = parent annotation ID
- We populate the tree structure top-down by querying annotations and their replies
- No need to distinguish in the data structure - just query recursively

3. **Composer Behavior**:

- Mobile: Always fixed at bottom, shows "reply to [name]" when replying
- Desktop: Inline where triggered, shows "reply to [name]" when replying
- Inherits parent note's `assigned_portfolios` (not editable)

4. **Feed Display**:

- Show at most 1 top-level comment
- Show "X more comments" link
- Clicking link navigates to note view page

5. **Text Collapsing**:

- Long comments/replies show truncated text with "more" button
- Expandable/collapsible
- Similar to existing text truncation in NoteCard

6. **Comment Notifications**:

- When a reply is created, send a message notification to the author
- Message type: `'comment_preview'` (distinct from regular `'text'` messages)
- Message includes `note_id` pointing to the comment note
- Message text contains preview of comment (truncated if long)
- Only send if recipient is not the comment author (no self-notifications)

## Testing Considerations

- Test privacy settings (authors, friends, everyone)
- Test nested replies (reply to reply)
- Test mobile vs desktop composer positioning
- Test feed display (only 1 comment shown)
- Test permission checks (disabled reply buttons)
- Test text collapsing for long comments
- Test annotation creation with images/URLs
- **Performance tests**:
- Verify initial page load time (should be fast without annotations)
- Test lazy loading triggers correctly (IntersectionObserver)
- Test pagination with large comment threads