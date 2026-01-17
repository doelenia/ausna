# Usage Examples

Quick reference for using Button and Card components in your code.

## Button Examples

### Basic Usage

```tsx
import { Button } from '@/components/ui'

// Primary button (most common)
<Button onClick={handleSubmit}>Submit</Button>

// Secondary action
<Button variant="secondary" onClick={handleCancel}>Cancel</Button>

// Success action
<Button variant="success" onClick={handleSave}>Save</Button>

// Destructive action
<Button variant="danger" onClick={handleDelete}>Delete</Button>

// Text button (minimal styling)
<Button variant="text" onClick={handleSkip}>Skip</Button>
```

### With Loading States

```tsx
<Button disabled={isLoading} onClick={handleSubmit}>
  {isLoading ? 'Loading...' : 'Submit'}
</Button>
```

### Different Sizes

```tsx
<Button size="sm">Small Button</Button>
<Button size="md">Medium Button (default)</Button>
<Button size="lg">Large Button</Button>
```

### Full Width Buttons

```tsx
// Common in forms
<Button fullWidth onClick={handleSubmit}>
  Submit Form
</Button>
```

### Link Buttons

```tsx
// Button styled as link
<Button asLink href="/dashboard">
  Go to Dashboard
</Button>

// Or use Next.js Link directly with Button styling
import Link from 'next/link'
<Link href="/profile">
  <Button variant="text">View Profile</Button>
</Link>
```

### In Forms

```tsx
<form onSubmit={handleSubmit}>
  {/* Form fields */}
  
  <div className="flex gap-2 mt-4">
    <Button variant="secondary" type="button" onClick={handleCancel}>
      Cancel
    </Button>
    <Button variant="primary" type="submit" disabled={isSubmitting}>
      {isSubmitting ? 'Saving...' : 'Save'}
    </Button>
  </div>
</form>
```

## Card Examples

### Basic Card

```tsx
import { Card } from '@/components/ui'

<Card>
  <p>Simple card content</p>
</Card>
```

### Card Variants

```tsx
// Default (with shadow)
<Card variant="default">
  <p>Default card</p>
</Card>

// Compact (less padding)
<Card variant="compact">
  <p>Compact card</p>
</Card>

// Spacious (more padding)
<Card variant="spacious">
  <p>Spacious card</p>
</Card>

// Subtle (border only, no shadow)
<Card variant="subtle">
  <p>Subtle card</p>
</Card>
```

### Card with Header

```tsx
<Card header={<h2 className="text-xl font-semibold">Card Title</h2>}>
  <p>Card content goes here</p>
</Card>
```

### Card with Footer

```tsx
<Card footer={<Button variant="primary">Action</Button>}>
  <p>Card content</p>
</Card>
```

### Card with Header and Footer

```tsx
<Card 
  header={<h2 className="text-xl font-semibold">Settings</h2>}
  footer={
    <div className="flex gap-2">
      <Button variant="secondary">Cancel</Button>
      <Button variant="primary">Save</Button>
    </div>
  }
>
  <form>
    {/* Form fields */}
  </form>
</Card>
```

### Custom Padding

```tsx
// Override default padding
<Card padding="lg">
  <p>Large padding</p>
</Card>

<Card padding="sm">
  <p>Small padding</p>
</Card>

<Card padding="none">
  <p>No padding (useful for custom layouts)</p>
</Card>
```

### Real-World Example: Settings Card

```tsx
import { Card, Button } from '@/components/ui'

<Card 
  variant="default"
  header={<h2 className="text-xl font-semibold">Account Settings</h2>}
  footer={
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={handleCancel}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleSave} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  }
>
  <div className="space-y-4">
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Username
      </label>
      <input 
        type="text" 
        className="w-full px-3 py-2 border border-gray-300 rounded-md"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Email
      </label>
      <input 
        type="email" 
        className="w-full px-3 py-2 border border-gray-300 rounded-md"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
    </div>
  </div>
</Card>
```

### Real-World Example: Note Card

```tsx
import { Card, Button } from '@/components/ui'

<Card variant="default">
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold">Note Title</h3>
      <span className="text-xs text-gray-500">2 hours ago</span>
    </div>
    <p className="text-gray-700">Note content goes here...</p>
    <div className="flex gap-2">
      <Button variant="text" size="sm">Edit</Button>
      <Button variant="text" size="sm">Share</Button>
      <Button variant="danger" size="sm">Delete</Button>
    </div>
  </div>
</Card>
```

## Migration Example

### Before (Inline Styles)

```tsx
<div className="bg-white shadow rounded-lg p-6">
  <h2 className="text-xl font-semibold mb-4">Title</h2>
  <p>Content</p>
  <button 
    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    disabled={loading}
  >
    {loading ? 'Loading...' : 'Submit'}
  </button>
</div>
```

### After (Using Components)

```tsx
import { Card, Button } from '@/components/ui'

<Card header={<h2 className="text-xl font-semibold">Title</h2>}>
  <p>Content</p>
  <Button variant="primary" disabled={loading}>
    {loading ? 'Loading...' : 'Submit'}
  </Button>
</Card>
```

## Benefits

- **Cleaner Code**: Less repetitive className strings
- **Consistency**: All buttons and cards look the same
- **Easy Updates**: Change styles in one place, apply everywhere
- **Type Safety**: TypeScript ensures correct prop usage
- **Maintainability**: Easier to update and maintain


