# Design System Components Reference

This directory contains reusable component patterns that follow the design system defined in `STYLE_GUIDE.md`.

## Usage

When creating new components, reference these patterns to ensure consistency:

### Button Patterns

```tsx
// Primary Button
<button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
  Primary Action
</button>

// Secondary Button
<button className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
  Secondary Action
</button>

// Success Button
<button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
  Success Action
</button>

// Text Button
<button className="text-sm text-gray-600 hover:text-gray-800 transition-colors">
  Text Action
</button>
```

### Card Patterns

```tsx
// Standard Card
<div className="bg-white shadow rounded-lg p-6">
  {/* Content */}
</div>

// Card with Header
<div className="bg-white shadow rounded-lg">
  <div className="px-6 py-4 border-b border-gray-200">
    <h2 className="text-xl font-semibold">Card Title</h2>
  </div>
  <div className="p-6">
    {/* Content */}
  </div>
</div>
```

### Form Patterns

```tsx
// Form Field
<div>
  <label htmlFor="field" className="block text-sm font-medium text-gray-700 mb-1">
    Label
  </label>
  <input
    id="field"
    type="text"
    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
    placeholder="Placeholder"
  />
</div>

// Form Error
<div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
  Error message
</div>
```

### Badge Patterns

```tsx
// Primary Badge
<span className="inline-block px-2 py-1 text-xs font-semibold text-blue-600 bg-blue-100 rounded uppercase">
  Badge
</span>

// Secondary Badge
<span className="inline-block px-2 py-1 text-xs font-semibold text-gray-600 bg-gray-100 rounded">
  Badge
</span>
```

## Design Tokens

All design tokens are defined in:
- `STYLE_GUIDE.md` - Complete design system documentation
- `tailwind.config.js` - Tailwind configuration with design tokens

## Color Tokens

Use semantic color names from Tailwind config:
- `primary-600` / `blue-600` - Primary actions
- `success-600` / `green-600` - Success states
- `danger-600` / `red-600` - Error/destructive actions
- `gray-*` - Neutral colors

## Spacing Tokens

- `p-6` - Standard card padding
- `p-4` - Compact padding
- `p-8` - Spacious padding
- `mb-4` / `mb-6` - Standard spacing between elements

## Typography Tokens

- `text-3xl font-bold` - Page titles
- `text-2xl font-semibold` - Section headings
- `text-base` - Body text
- `text-sm font-medium` - Labels
- `text-xs` - Captions



