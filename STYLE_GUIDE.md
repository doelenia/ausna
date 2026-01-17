# UI Style Guide

This document describes the consistent UI structure and design system used across all pages in the application.

## Reusable Components

**IMPORTANT**: Always use the reusable components from `@/components/ui` instead of inline styles. This ensures that style changes automatically propagate across the entire application.

### Button Component

```tsx
import { Button } from '@/components/ui'

// Primary button (default)
<Button variant="primary" onClick={handleClick}>Click me</Button>

// Secondary button
<Button variant="secondary">Secondary Action</Button>

// Success button
<Button variant="success">Submit</Button>

// Danger button
<Button variant="danger">Delete</Button>

// Text button
<Button variant="text">Cancel</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="md">Medium (default)</Button>
<Button size="lg">Large</Button>

// Full width
<Button fullWidth>Full Width Button</Button>

// As link
<Button asLink href="/path">Link Button</Button>

// With all props
<Button 
  variant="primary" 
  size="md" 
  fullWidth 
  disabled={loading}
  onClick={handleSubmit}
>
  {loading ? 'Loading...' : 'Submit'}
</Button>
```

### Card Component

```tsx
import { Card } from '@/components/ui'

// Default card
<Card>Content here</Card>

// Compact card
<Card variant="compact">Compact content</Card>

// Spacious card
<Card variant="spacious">Spacious content</Card>

// Subtle card (no shadow, border only)
<Card variant="subtle">Subtle card</Card>

// Card with header
<Card header={<h2 className="text-xl font-semibold">Card Title</h2>}>
  Content here
</Card>

// Card with footer
<Card footer={<Button variant="primary">Action</Button>}>
  Content here
</Card>

// Card with header and footer
<Card 
  header={<h2 className="text-xl font-semibold">Title</h2>}
  footer={<div className="flex gap-2"><Button>Cancel</Button><Button variant="primary">Save</Button></div>}
>
  Content here
</Card>

// Custom padding
<Card padding="lg">Large padding</Card>
<Card padding="sm">Small padding</Card>
<Card padding="none">No padding</Card>
```

### Typography Components

**⚠️ CRITICAL**: Always use `Title`, `Subtitle`, `Content`, or `UIText` components. NEVER use inline text size/weight classes like `text-lg`, `font-bold`, etc. Only 4 font types are allowed.

```tsx
import { Title, Subtitle, Content, UIText } from '@/components/ui'

// Title - for headings and titles (large, regular, black)
<Title as="h1">Page Title</Title>
<Title as="h2">Section Title</Title>
<Title as="h3">Subsection Title</Title>

// Subtitle - for subtitles (extra large, regular, black)
<Subtitle as="h2">Subtitle</Subtitle>
<Subtitle as="h3">Section Subtitle</Subtitle>

// Content - for body content (same size as title, gray)
<Content>This is body content text.</Content>
<Content as="p">Paragraph content</Content>
<Content as="div">Any content</Content>

// UIText - for UI elements like labels, captions (smaller size)
<UIText as="label" htmlFor="field">Form Label</UIText>
<UIText as="span">Caption text</UIText>
<UIText as="p">Small UI text</UIText>
```

**Font Types (defined in Typography.tsx):**
- **title**: `text-3xl font-normal text-black` - Large, regular weight, black
- **subtitle**: `text-xl font-normal text-black` - Extra large, regular weight, black - for subtitles
- **content**: `text-base font-normal text-black` - Medium, regular weight, black - for user-written content
- **ui**: `text-sm font-normal text-gray-700` - Smaller, thinner weight, for UI elements

**To change fonts globally:** Edit `typographyStyles` in `components/ui/Typography.tsx`

**Benefits of Using Components:**
- ✅ Single source of truth for styles
- ✅ Automatic style updates across the app
- ✅ Consistent behavior and accessibility
- ✅ TypeScript type safety
- ✅ Easier maintenance
- ✅ Only 4 font types - strict consistency

## Design System

### Typography

**⚠️ IMPORTANT**: Use Typography components (`Title`, `Subtitle`, `Content`, `UIText`) instead of inline classes. See [Typography Components](#typography-components) section above.

#### Font Types (Defined in Components)

Only 4 font types are allowed:

1. **Title** (`Title` component)
   - Size: Large (`text-3xl`)
   - Weight: Regular (`font-normal`)
   - Color: Black (`text-black`)
   - Usage: Headings, titles, page headers

2. **Subtitle** (`Subtitle` component)
   - Size: Extra Large (`text-xl`)
   - Weight: Regular (`font-normal`)
   - Color: Black (`text-black`)
   - Usage: Subtitles, section headings

3. **Content** (`Content` component)
   - Size: Medium (`text-base`)
   - Weight: Regular (`font-normal`)
   - Color: Black (`text-black`)
   - Usage: Body text, paragraphs, descriptions (user-written content)

4. **UI** (`UIText` component)
   - Size: Small (`text-sm`)
   - Weight: Normal (`font-normal`)
   - Color: Gray (`text-gray-700`)
   - Usage: Labels, captions, UI elements, form labels

#### Typography Patterns (Use Components)

```tsx
// Page Title
<Title as="h1" className="mb-2">Page Title</Title>

// Section Heading
<Title as="h2" className="mb-4">Section Title</Title>

// Subheading
<Title as="h3" className="mb-2">Subheading</Title>

// Body Text
<Content>Body text content</Content>

// Label
<UIText as="label" htmlFor="field" className="block mb-1">Label</UIText>

// Caption
<UIText as="span" className="text-xs text-gray-500">Caption text</UIText>
```

**⚠️ DO NOT USE**: Direct text size/weight classes like `text-lg`, `font-bold`, `text-gray-700`, etc. Always use the Typography components.

### Colors

#### Primary Colors
- **Primary**: `blue-600` (#2563eb) - Primary actions, links
- **Primary Hover**: `blue-700` (#1d4ed8) - Primary button hover
- **Primary Light**: `blue-100` (#dbeafe) - Primary backgrounds
- **Primary Text**: `blue-600` (#2563eb) - Primary text

#### Secondary Colors
- **Secondary**: `gray-600` (#525252) - Secondary actions
- **Secondary Hover**: `gray-700` (#404040) - Secondary button hover
- **Secondary Light**: `gray-100` (#f5f5f5) - Secondary backgrounds

#### Semantic Colors
- **Success**: `green-600` (#16a34a) - Success states, positive actions
- **Success Hover**: `green-700` (#15803d) - Success button hover
- **Success Light**: `green-50` (#f0fdf4) - Success backgrounds
- **Danger**: `red-600` (#dc2626) - Destructive actions, errors
- **Danger Hover**: `red-700` (#b91c1c) - Danger button hover
- **Danger Light**: `red-50` (#fef2f2) - Error backgrounds

#### Neutral Colors
- **Background**: `gray-50` (#fafafa) - Page background
- **Card Background**: `white` (#ffffff) - Card backgrounds
- **Text Primary**: `gray-900` (#171717) - Primary text
- **Text Secondary**: `gray-700` (#404040) - Secondary text
- **Text Tertiary**: `gray-500` (#737373) - Tertiary text
- **Text Muted**: `gray-400` (#a3a3a3) - Muted text
- **Border**: `gray-300` (#d4d4d4) - Borders
- **Border Light**: `gray-200` (#e5e5e5) - Light borders

### Buttons

**⚠️ Use the `Button` component from `@/components/ui` instead of inline button styles.**

See the [Reusable Components](#reusable-components) section above for usage examples.

#### Button Variants (for reference - use Button component instead)
- **Primary**: Blue background (`bg-blue-600`)
- **Secondary**: Gray background (`bg-gray-600`)
- **Success**: Green background (`bg-green-600`)
- **Danger**: Red background (`bg-red-600`)
- **Text**: Transparent with text color

#### Button Sizes
- **Small**: `sm` - Compact buttons
- **Medium**: `md` (default) - Standard buttons
- **Large**: `lg` - Prominent buttons

#### Button States
- **Default**: Normal styling
- **Hover**: Darker background automatically applied
- **Disabled**: Automatically handled by component
- **Loading**: Pass `disabled={loading}` prop

### Cards

**⚠️ Use the `Card` component from `@/components/ui` instead of inline card styles.**

See the [Reusable Components](#reusable-components) section above for usage examples.

#### Card Variants (for reference - use Card component instead)
- **Default**: White background with shadow (`bg-white shadow rounded-lg`)
- **Compact**: Same as default with smaller padding
- **Spacious**: Same as default with larger padding
- **Subtle**: White background with border only (`bg-white border border-gray-200 rounded-lg`)

### Forms

#### Input Fields
```tsx
<input
  type="text"
  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
  placeholder="Placeholder text"
/>
```

#### Textarea
```tsx
<textarea
  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
  rows={4}
/>
```

#### Select
```tsx
<select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white">
  <option>Option 1</option>
</select>
```

#### Form Labels
```tsx
<label htmlFor="field" className="block text-sm font-medium text-gray-700 mb-1">
  Label Text
</label>
```

#### Form Error States
```tsx
<div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
  Error message
</div>
```

#### Form Success States
```tsx
<div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">
  Success message
</div>
```

### Badges & Tags

#### Badge (Primary)
```tsx
<span className="inline-block px-2 py-1 text-xs font-semibold text-blue-600 bg-blue-100 rounded uppercase">
  Badge
</span>
```

#### Badge (Secondary)
```tsx
<span className="inline-block px-2 py-1 text-xs font-semibold text-gray-600 bg-gray-100 rounded">
  Badge
</span>
```

### Spacing

#### Padding Patterns
- **Card Padding**: `p-6` (1.5rem / 24px)
- **Compact Padding**: `p-4` (1rem / 16px)
- **Spacious Padding**: `p-8` (2rem / 32px)
- **Section Padding**: `py-6` or `py-8`

#### Margin Patterns
- **Section Spacing**: `mb-6` or `mb-8`
- **Element Spacing**: `mb-2`, `mb-4`
- **Gap in Flex**: `gap-2`, `gap-4`, `gap-6`

### Shadows

- **Card Shadow**: `shadow` (default Tailwind shadow)
- **No Shadow**: Use `border border-gray-200` instead

### Borders

- **Default Border**: `border border-gray-300`
- **Light Border**: `border border-gray-200`
- **Rounded**: `rounded-md` (0.375rem) - Standard
- **Rounded Large**: `rounded-lg` (0.5rem) - Cards

### Transitions

- **Color Transitions**: `transition-colors` - For buttons, links
- **All Transitions**: `transition` - For complex animations

---

## Structure Overview

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

