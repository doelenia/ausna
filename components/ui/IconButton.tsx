import React from 'react'
import Link from 'next/link'
import { LucideIcon } from 'lucide-react'

export interface IconButtonProps {
  icon: LucideIcon
  href?: string
  onClick?: () => void
  title?: string
  className?: string
  /** Optional override for the icon element (e.g. "w-6 h-6" for consistent visual weight) */
  iconClassName?: string
  badge?: React.ReactNode
  'aria-label'?: string
}

/**
 * IconButton component - for icon-only buttons (like header navigation)
 * Uses thinner stroke weight like UI text
 * 
 * @example
 * <IconButton icon={Home} href="/main" title="Home" />
 * <IconButton icon={MessageCircle} href="/messages" title="Messages" badge={<Badge>5</Badge>} />
 */
export function IconButton({
  icon: Icon,
  href,
  onClick,
  title,
  className = '',
  iconClassName = 'w-5 h-5',
  badge,
  'aria-label': ariaLabel,
  ...props
}: IconButtonProps) {
  const baseClasses = 'text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md transition-colors flex items-center relative'
  const classes = `${baseClasses} ${className}`.trim()

  const iconElement = (
    <Icon 
      className={iconClassName} 
      strokeWidth={1.5} // Thinner weight like UI text
    />
  )

  const content = (
    <>
      {iconElement}
      {badge && badge}
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        title={title}
        aria-label={ariaLabel || title}
        {...props}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      onClick={onClick}
      className={classes}
      title={title}
      aria-label={ariaLabel || title}
      {...props}
    >
      {content}
    </button>
  )
}

