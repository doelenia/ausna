import React from 'react'

export type CardVariant = 'default' | 'compact' | 'spacious' | 'subtle'
export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

export interface CardProps {
  variant?: CardVariant
  padding?: CardPadding
  header?: React.ReactNode
  footer?: React.ReactNode
  className?: string
  children: React.ReactNode
}

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-white rounded-xl',
  compact: 'bg-white rounded-xl',
  spacious: 'bg-white rounded-xl',
  subtle: 'bg-white border border-gray-200 rounded-xl',
}

const paddingStyles: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
}

const defaultPadding: Record<CardVariant, CardPadding> = {
  default: 'md',
  compact: 'sm',
  spacious: 'lg',
  subtle: 'md',
}

/**
 * Reusable Card component with consistent styling
 * 
 * @example
 * <Card>Content here</Card>
 * <Card variant="compact" header={<h2>Title</h2>}>Content</Card>
 * <Card variant="spacious" padding="lg">Spacious content</Card>
 */
export function Card({
  variant = 'default',
  padding,
  header,
  footer,
  className = '',
  children,
}: CardProps) {
  const effectivePadding = padding || defaultPadding[variant]
  const paddingClass = paddingStyles[effectivePadding]

  const classes = [
    variantStyles[variant],
    paddingClass,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  // If there's a header or footer, don't apply padding to the card itself
  // Instead, apply it to the content area
  const cardClasses = header || footer 
    ? variantStyles[variant] + (className ? ` ${className}` : '')
    : classes

  const contentPadding = header || footer ? paddingStyles[effectivePadding] : ''

  return (
    <div className={cardClasses}>
      {header && (
        <div className="px-6 py-4 border-b border-gray-200">
          {header}
        </div>
      )}
      <div className={contentPadding}>
        {children}
      </div>
      {footer && (
        <div className="px-6 py-4 border-t border-gray-200">
          {footer}
        </div>
      )}
    </div>
  )
}

