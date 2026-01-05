import React from 'react'
import Link from 'next/link'
import { UIButtonText, UIText } from './Typography'

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'text'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  asLink?: boolean
  href?: string
  children: React.ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200',
  secondary: 'bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-300',
  success: 'bg-green-600 text-white hover:bg-green-700 border border-green-700',
  danger: 'bg-red-600 text-white hover:bg-red-700 border border-red-700',
  text: 'text-gray-600 hover:text-gray-800 bg-transparent',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5',
  md: 'px-4 py-2',
  lg: 'px-6 py-3',
}

// inline-flex ensures button sizes to content width (not full width)
// items-center justify-center ensures content is always vertically and horizontally centered
// leading-none ensures consistent line height regardless of text content
const baseStyles = 'rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center leading-none'

/**
 * Recursively processes children and replaces UIText components with UIButtonText
 * so that button variant colors can control the text color
 */
function processButtonChildren(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    // If it's a string or number, wrap it with UIButtonText
    if (typeof child === 'string' || typeof child === 'number') {
      return <UIButtonText>{child}</UIButtonText>
    }

    // If it's a React element, check if it's UIText
    if (React.isValidElement(child)) {
      // Skip if it's already UIButtonText
      const isUIButtonText = child.type === UIButtonText || 
                            (typeof child.type === 'function' && (child.type.name === 'UIButtonText' || (child.type as any).displayName === 'UIButtonText')) ||
                            (child.type && (child.type as any).displayName === 'UIButtonText')
      
      if (isUIButtonText) {
        return child
      }

      // Check if it's a UIText component by comparing the function/component
      // Also check displayName as a fallback for production builds
      const isUIText = child.type === UIText || 
                      (typeof child.type === 'function' && (child.type.name === 'UIText' || (child.type as any).displayName === 'UIText')) ||
                      (child.type && (child.type as any).displayName === 'UIText')
      
      if (isUIText) {
        // Replace UIText with UIButtonText, but don't preserve className (it has text-gray-700)
        // Extract children first, then process them recursively in case they contain more UIText
        const { className, children: childChildren, ...otherProps } = child.props
        return (
          <UIButtonText
            as={child.props.as}
            htmlFor={child.props.htmlFor}
            {...otherProps}
          >
            {processButtonChildren(childChildren)}
          </UIButtonText>
        )
      }

      // If it has children, recursively process them
      if (child.props && child.props.children) {
        return React.cloneElement(child, {
          ...child.props,
          children: processButtonChildren(child.props.children),
        })
      }
    }

    return child
  })
}

/**
 * Reusable Button component with consistent styling
 * 
 * @example
 * <Button variant="primary" onClick={handleClick}>Click me</Button>
 * <Button variant="success" size="lg" fullWidth>Submit</Button>
 * <Button variant="text" asLink href="/path">Link Button</Button>
 */
export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  asLink = false,
  href,
  className: customClassName = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  const classes = [
    baseStyles,
    variantStyles[variant],
    sizeStyles[size],
    fullWidth ? 'w-full' : '',
    customClassName,
  ]
    .filter(Boolean)
    .join(' ')

  // Process children to replace UIText with UIButtonText
  const processedChildren = processButtonChildren(children)

  // Render as Link if asLink is true
  if (asLink && href) {
    // Remove disabled-related classes for links
    const linkClasses = classes.replace('disabled:opacity-50 disabled:cursor-not-allowed', '')
    return (
      <Link href={href} className={linkClasses}>
        {processedChildren}
      </Link>
    )
  }

  return (
    <button className={classes} disabled={disabled} {...props}>
      {processedChildren}
    </button>
  )
}

