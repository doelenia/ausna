# UI Style Guide

This document describes the consistent UI structure used across all pages in the application.

## Structure Overview

The UI structure is centralized in the root layout (`app/layout.tsx`). All pages render their content directly without wrapper divs.

### Root Layout Structure

1. **Background Layer**: Full width and height (`min-h-screen bg-gray-50`)
2. **Main Container**: Max-width 800px (via CSS variable `--max-content-width`), full height (`h-screen`), centered (`mx-auto`), flex column (`flex flex-col`)
3. **Header**: `TopNav` component (sticky positioned)
4. **Content Layer**: Flex-1, overflow-auto, full width (`flex-1 overflow-auto w-full`)

### Header Navigation

The `TopNav` component is sticky positioned:
- **Desktop**: Sticky at top (`sticky top-0`)
- **Mobile**: Sticky at bottom (`sticky bottom-0 md:top-0 md:bottom-auto`)
- **Z-index**: `z-50` to ensure it stays above content

### Content Div Behavior

- **Height**: Fills remaining space after header (`flex-1`)
- **Scrolling**: Content scrolls inside the content div (`overflow-auto`)
- **Width**: Full width of main container (`w-full`)
- **Padding**: No padding (individual components can add their own)

## Root Layout Structure

```tsx
// app/layout.tsx
<div className="min-h-screen bg-gray-50">
  <div className="mx-auto h-screen flex flex-col" style={{ maxWidth: 'var(--max-content-width)' }}>
    <TopNav />
    <div className="flex-1 overflow-auto w-full">
      {children}
    </div>
  </div>
</div>
```

## Page Structure Template

Pages should render their content directly without wrapper divs:

```tsx
// Example page
export default function MyPage() {
  return (
    <div className="bg-white shadow rounded-lg p-6">
      {/* Page content here */}
    </div>
  )
}
```

## Pages Documentation

### Main Pages

#### `/main` - Feed Page
- **Component**: `components/main/FeedView.tsx`
- **Structure**: Background → Main div → FeedTabs (sticky) → Content div
- **Special**: Uses `FeedTabs` component which is sticky at top

#### `/portfolio` - Portfolio Index
- **File**: `app/portfolio/page.tsx`
- **Purpose**: Lists all portfolios with search and filtering
- **Structure**: Standard structure with portfolio grid

#### `/portfolio/create/[type]` - Create Portfolio
- **File**: `app/portfolio/create/[type]/page.tsx`
- **Purpose**: Create new project or community portfolio
- **Structure**: Standard structure with centered form

### Portfolio Detail Pages

#### `/portfolio/[type]/[id]` - Portfolio View
- **Component**: `components/portfolio/PortfolioView.tsx`
- **Purpose**: View individual portfolio details
- **Structure**: Standard structure with portfolio information

#### `/portfolio/[type]/[id]/all` - Portfolio All View
- **Component**: `components/portfolio/PortfolioAllView.tsx`
- **Purpose**: View all notes and sub-portfolios for a portfolio
- **Structure**: Standard structure with tabs for notes/portfolios

#### `/portfolio/[type]/[id]/members` - Members Page
- **File**: `app/portfolio/[type]/[id]/members/page.tsx`
- **Purpose**: View and manage portfolio members
- **Structure**: Standard structure with member list

#### `/portfolio/[type]/[id]/pinned` - Edit Pinned
- **File**: `app/portfolio/[type]/[id]/pinned/page.tsx`
- **Purpose**: Edit pinned items for a portfolio
- **Structure**: Standard structure with pinned items editor

### Note Pages

#### `/notes/create` - Create Note
- **File**: `app/notes/create/page.tsx`
- **Purpose**: Create a new note or annotate an existing note
- **Structure**: Standard structure with note creation form

#### `/notes/[id]` - Note View
- **File**: `app/notes/[id]/page.tsx`
- **Component**: `components/notes/NoteView.tsx`
- **Purpose**: View individual note with annotations
- **Structure**: Standard structure with note content and annotations

### Messages

#### `/messages` - Messages Page
- **File**: `app/messages/page.tsx`
- **Purpose**: View conversations and send messages
- **Structure**: Standard structure with conversation list or conversation view
- **Special**: Uses `ConversationView` component for individual conversations

### Authentication Pages

#### `/login` - Login Page
- **File**: `app/login/page.tsx`
- **Purpose**: User login
- **Structure**: Standard structure with centered form (uses flexbox for centering)

#### `/signup` - Signup Page
- **File**: `app/signup/page.tsx`
- **Purpose**: User registration
- **Structure**: Standard structure with centered form (uses flexbox for centering)

### Account Pages

#### `/account/[id]` - Account Settings
- **Component**: `app/account/[id]/client-wrapper.tsx`
- **Purpose**: User account settings and profile management
- **Structure**: Standard structure with account information

### Admin Pages

#### `/admin` - Admin Console
- **File**: `app/admin/page.tsx`
- **Component**: `components/admin/AdminTabs.tsx`
- **Purpose**: Administrative interface for managing the application
- **Structure**: Standard structure with admin tabs

## CSS Variables

- `--max-content-width`: 800px (defined in `app/globals.css`)

## Responsive Behavior

### Desktop (default)
- Header: Sticky at top
- Content: Full width, no padding

### Mobile
- Header: Sticky at bottom (using `sticky bottom-0 md:top-0 md:bottom-auto`)
- Content: Full width, no padding

## Component Hierarchy

```
Background (bg-gray-50, min-h-screen)
  └── Main Container (mx-auto, h-screen, max-width: var(--max-content-width))
      └── Content Div (w-full)
          └── Page-specific content
```

## Notes

- All pages use the same background color: `bg-gray-50`
- The main container is always centered using `mx-auto`
- Content divs have no padding to allow full-width content
- Individual components within pages can add their own padding as needed
- The TopNav is rendered in the root layout and appears on all pages

