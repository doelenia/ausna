# UI Components

Reusable design system components that ensure consistent styling across the application. When you update styles in these components, they automatically apply everywhere.

## Button Component

A flexible button component with multiple variants and sizes.

### Import

```tsx
import { Button } from '@/components/ui'
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'primary' \| 'secondary' \| 'success' \| 'danger' \| 'text'` | `'primary'` | Button style variant |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Button size |
| `fullWidth` | `boolean` | `false` | Make button full width |
| `asLink` | `boolean` | `false` | Render as Next.js Link instead of button |
| `href` | `string` | - | Required when `asLink` is true |
| `disabled` | `boolean` | `false` | Disable the button |
| `className` | `string` | `''` | Additional CSS classes |
| `children` | `React.ReactNode` | - | Button content |
| ...rest | `ButtonHTMLAttributes` | - | All standard button props |

### Examples

```tsx
// Primary button
<Button variant="primary" onClick={handleClick}>
  Click me
</Button>

// Secondary button
<Button variant="secondary">Cancel</Button>

// Success button
<Button variant="success">Save</Button>

// Danger button
<Button variant="danger">Delete</Button>

// Text button
<Button variant="text">Learn more</Button>

// Different sizes
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>

// Full width
<Button fullWidth>Submit</Button>

// As link
<Button asLink href="/dashboard">
  Go to Dashboard
</Button>

// With loading state
<Button disabled={isLoading}>
  {isLoading ? 'Loading...' : 'Submit'}
</Button>
```

## Card Component

A flexible card component with multiple variants and optional header/footer.

### Import

```tsx
import { Card } from '@/components/ui'
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'compact' \| 'spacious' \| 'subtle'` | `'default'` | Card style variant |
| `padding` | `'none' \| 'sm' \| 'md' \| 'lg'` | Auto based on variant | Card padding |
| `header` | `React.ReactNode` | - | Optional header content |
| `footer` | `React.ReactNode` | - | Optional footer content |
| `className` | `string` | `''` | Additional CSS classes |
| `children` | `React.ReactNode` | - | Card content |

### Examples

```tsx
// Basic card
<Card>
  <p>Card content here</p>
</Card>

// Compact card
<Card variant="compact">
  <p>Compact content</p>
</Card>

// Spacious card
<Card variant="spacious">
  <p>Spacious content</p>
</Card>

// Subtle card (no shadow, border only)
<Card variant="subtle">
  <p>Subtle card</p>
</Card>

// Card with header
<Card header={<h2 className="text-xl font-semibold">Card Title</h2>}>
  <p>Content here</p>
</Card>

// Card with footer
<Card footer={<Button variant="primary">Action</Button>}>
  <p>Content here</p>
</Card>

// Card with header and footer
<Card 
  variant="default"
  header={<h2 className="text-xl font-semibold">Settings</h2>}
  footer={
    <div className="flex gap-2">
      <Button variant="secondary">Cancel</Button>
      <Button variant="primary">Save</Button>
    </div>
  }
>
  <p>Card content</p>
</Card>

// Custom padding
<Card padding="lg">
  <p>Large padding</p>
</Card>
```

## Migration Guide

### Migrating Inline Buttons

**Before:**
```tsx
<button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
  Click me
</button>
```

**After:**
```tsx
import { Button } from '@/components/ui'

<Button variant="primary">Click me</Button>
```

### Migrating Inline Cards

**Before:**
```tsx
<div className="bg-white shadow rounded-lg p-6">
  <p>Content</p>
</div>
```

**After:**
```tsx
import { Card } from '@/components/ui'

<Card>
  <p>Content</p>
</Card>
```

## Benefits

- ✅ **Single Source of Truth**: Update styles in one place, apply everywhere
- ✅ **Consistency**: All buttons and cards look the same across the app
- ✅ **Type Safety**: TypeScript ensures correct prop usage
- ✅ **Maintainability**: Easier to update and maintain
- ✅ **Accessibility**: Built-in accessibility features

## Future Updates

When you want to change button or card styles:
1. Edit the component file (`Button.tsx` or `Card.tsx`)
2. Changes automatically apply to all usages
3. No need to search and replace across the codebase

