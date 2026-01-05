import React from 'react'

export type TypographyVariant = 'title' | 'subtitle' | 'content' | 'ui' | 'ui-inherit'

export interface TypographyProps extends React.HTMLAttributes<HTMLElement> {
  variant: TypographyVariant
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'div' | 'label' | 'dt' | 'dd'
  children: React.ReactNode
  htmlFor?: string
}

/**
 * Typography styles - single source of truth for all text
 * 
 * - title: Large, regular weight, black color - for headings and titles
 * - subtitle: Extra large, regular weight, black color - for subtitles (smaller than title)
 * - content: Medium, regular weight, black color - for body content (user-written text)
 * - ui: Smaller size, thinner weight, gray color - for UI elements like labels, buttons, etc.
 * - ui-inherit: Same as ui but without color, inherits color from parent (for buttons, colored text, etc.)
 * 
 * Update these styles to change all text across the application automatically.
 */
const typographyStyles: Record<TypographyVariant, string> = {
  title: 'text-3xl font-normal text-gray-900', // Large, regular, black
  subtitle: 'text-xl font-normal text-gray-900', // Extra large, regular, black - for subtitles
  content: 'text-base font-normal text-gray-900', // Medium, regular, black - for user-written content
  ui: 'text-sm font-normal text-gray-700 leading-none', // Smaller, thinner weight, for UI elements - leading-none for consistent height
  'ui-inherit': 'text-sm font-normal leading-none', // Same as ui but no color - inherits from parent (for buttons) - leading-none for consistent height
}

/**
 * Reusable Typography component with consistent styling
 * 
 * @example
 * <Typography variant="title" as="h1">Page Title</Typography>
 * <Typography variant="content">Body content here</Typography>
 * <Typography variant="ui" as="label">Form Label</Typography>
 */
export function Typography({
  variant,
  as: Component = 'p',
  className = '',
  children,
  htmlFor,
  ...props
}: TypographyProps) {
  const classes = [
    typographyStyles[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Component className={classes} htmlFor={htmlFor} {...props}>
      {children}
    </Component>
  )
}

// Convenience components for easier usage
export function Title({ 
  as = 'h1', 
  className = '', 
  children,
  ...props
}: Omit<TypographyProps, 'variant'>) {
  return (
    <Typography variant="title" as={as} className={className} {...props}>
      {children}
    </Typography>
  )
}

export function Subtitle({ 
  as = 'h2', 
  className = '', 
  children,
  ...props
}: Omit<TypographyProps, 'variant'>) {
  return (
    <Typography variant="subtitle" as={as} className={className} {...props}>
      {children}
    </Typography>
  )
}

export function Content({ 
  as = 'p', 
  className = '', 
  children,
  ...props
}: Omit<TypographyProps, 'variant'>) {
  return (
    <Typography variant="content" as={as} className={className} {...props}>
      {children}
    </Typography>
  )
}

export function UIText({ 
  as = 'span', 
  className = '', 
  children,
  ...props
}: Omit<TypographyProps, 'variant'>) {
  return (
    <Typography variant="ui" as={as} className={className} {...props}>
      {children}
    </Typography>
  )
}
UIText.displayName = 'UIText'

/**
 * UIButtonText - Same as UIText but without color, inherits color from parent
 * Use this for button text where the button variant controls the color
 */
export function UIButtonText({ 
  as = 'span', 
  className = '', 
  children,
  ...props
}: Omit<TypographyProps, 'variant'>) {
  return (
    <Typography variant="ui-inherit" as={as} className={className} {...props}>
      {children}
    </Typography>
  )
}
UIButtonText.displayName = 'UIButtonText'

