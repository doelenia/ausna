# Migration Status: Typography, Buttons, and Cards

## ✅ Completed

### 1. Typography Components Created
- **Location**: `components/ui/Typography.tsx`
- **Components**: `Title`, `Content`, `UIText`
- **Font Types**:
  - `title`: Large, regular, black (`text-3xl font-normal text-black`)
  - `content`: Same size, gray (`text-3xl font-normal text-gray-600`)
  - `ui`: Smaller, for UI (`text-sm font-medium text-gray-700`)

### 2. Documentation Updated
- ✅ `.cursorrules` - Enforces use of Typography, Button, and Card components
- ✅ `STYLE_GUIDE.md` - Added Typography components section with examples
- ✅ `components/ui/index.ts` - Exports Typography components

### 3. Files Migrated (Examples)
- ✅ `components/auth/AuthForm.tsx` - Buttons and typography replaced
- ✅ `components/main/FeedView.tsx` - Buttons and typography replaced
- ✅ `components/portfolio/PortfolioView.tsx` - Partial migration (buttons and some typography)

## 🔄 Remaining Work

### Files That Need Button Replacement
The following files contain inline button styles that should be replaced with `Button` component:

**Components:**
- `components/portfolio/FriendButton.tsx` - Uses inline button styles
- `components/portfolio/SubscribeButton.tsx` - Uses inline button styles
- `components/notes/NoteActions.tsx` - May contain buttons
- `components/notes/NoteView.tsx` - May contain buttons
- `components/portfolio/MembersPageClient.tsx` - May contain buttons
- `components/admin/*.tsx` - Admin components may have buttons

**App Pages:**
- `app/messages/page.tsx` - May contain buttons
- `app/notes/create/page.tsx` - May contain buttons
- `app/portfolio/*/page.tsx` - Portfolio pages may have buttons

### Files That Need Typography Replacement
The following files contain inline typography that should be replaced:

**Components:**
- `components/portfolio/PortfolioView.tsx` - Some headings and text still need replacement
- `components/notes/NoteCard.tsx` - Contains text styles
- `components/notes/NoteView.tsx` - Contains text styles
- `components/portfolio/PortfolioEditor.tsx` - Contains text styles
- `components/portfolio/CreatePortfolioForm.tsx` - Contains text styles
- `components/main/TopNav.tsx` - Contains text styles
- `components/main/AuthNav.tsx` - Contains text styles
- `components/admin/*.tsx` - Admin components have text styles
- All other component files with `text-*` or `font-*` classes

**App Pages:**
- All page files with `text-*` or `font-*` classes

### Files That Need Card Replacement
The following files contain card-like divs that should use `Card` component:

**Components:**
- `components/notes/NoteCard.tsx` - Uses card-like styling
- `components/notes/MessageNoteCard.tsx` - Uses card-like styling
- `components/portfolio/PortfolioInvitationCard.tsx` - Uses card-like styling
- Any component with `bg-white shadow rounded-lg` patterns

**App Pages:**
- Pages with card-like containers

## 📋 Migration Checklist

### For Each File:

1. **Import components:**
   ```tsx
   import { Button, Card, Title, Content, UIText } from '@/components/ui'
   ```

2. **Replace buttons:**
   - Find: `<button className="px-4 py-2 bg-...`
   - Replace: `<Button variant="..." ...>`

3. **Replace typography:**
   - Find: `<h1 className="text-3xl font-bold">` → `<Title as="h1">`
   - Find: `<p className="text-gray-600">` → `<Content>`
   - Find: `<label className="text-sm font-medium">` → `<UIText as="label">`
   - Find: Any `text-*` or `font-*` classes → Use appropriate Typography component

4. **Replace cards:**
   - Find: `<div className="bg-white shadow rounded-lg p-6">`
   - Replace: `<Card>`

## 🎯 How to Continue Migration

### Option 1: Manual Migration (Recommended for Learning)
1. Open a file from the list above
2. Search for button/typography/card patterns
3. Replace with components
4. Test the changes

### Option 2: Use Cursor AI
Cursor will now automatically suggest using the components when you ask it to create or modify code, thanks to the updated `.cursorrules` file.

### Option 3: Gradual Migration
- Migrate files as you work on them
- New code automatically uses components (Cursor enforces this)
- Old code gets migrated over time

## 🔍 Finding Remaining Instances

Use these grep commands to find remaining instances:

```bash
# Find buttons
grep -r "className.*bg-.*-600.*rounded" components/ app/

# Find typography
grep -r "className.*text-(xs|sm|base|lg|xl|2xl|3xl)" components/ app/
grep -r "className.*font-(normal|medium|semibold|bold)" components/ app/

# Find cards
grep -r "bg-white.*shadow.*rounded" components/ app/
```

## ✨ Benefits Once Complete

- **Single Source of Truth**: Change fonts in `Typography.tsx`, apply everywhere
- **Consistent Styling**: All buttons, cards, and text look the same
- **Easy Updates**: Update styles in one place, see changes everywhere
- **Type Safety**: TypeScript ensures correct usage
- **Cursor Integration**: AI automatically uses components

## 📝 Notes

- The Typography component styles are defined in `components/ui/Typography.tsx`
- To change font styles globally, edit the `typographyStyles` object
- Button and Card styles are in their respective component files
- All changes will automatically propagate once components are used



