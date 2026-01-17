'use client'

import React from 'react'

/**
 * Base Skeleton component with pulse animation
 * Used as foundation for all skeleton variants
 */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  width?: string | number
  height?: string | number
  rounded?: boolean | 'full'
}

export function Skeleton({
  className = '',
  width,
  height,
  rounded = false,
  style,
  ...props
}: SkeletonProps) {
  const baseClasses = 'bg-gray-200 animate-pulse'
  
  const roundedClasses = rounded === true 
    ? 'rounded' 
    : rounded === 'full' 
      ? 'rounded-full' 
      : ''
  
  const combinedClasses = `${baseClasses} ${roundedClasses} ${className}`.trim()
  
  const combinedStyle: React.CSSProperties = {
    ...style,
    ...(width && { width: typeof width === 'number' ? `${width}px` : width }),
    ...(height && { height: typeof height === 'number' ? `${height}px` : height }),
  }
  
  return (
    <div
      className={combinedClasses}
      style={combinedStyle}
      {...props}
    />
  )
}

/**
 * SkeletonAvatar - For user avatars
 * Matches UserAvatar component dimensions
 */
export interface SkeletonAvatarProps extends Omit<SkeletonProps, 'rounded'> {
  size?: number
}

export function SkeletonAvatar({
  size = 32,
  className = '',
  ...props
}: SkeletonAvatarProps) {
  return (
    <Skeleton
      width={size}
      height={size}
      rounded="full"
      className={className}
      {...props}
    />
  )
}

/**
 * SkeletonText - For text lines
 * Supports single line or multiple lines
 */
export interface SkeletonTextProps extends Omit<SkeletonProps, 'width' | 'height'> {
  lines?: number
  lineHeight?: number
  gap?: number
  width?: string | number
}

export function SkeletonText({
  lines = 1,
  lineHeight = 20,
  gap = 8,
  width = '100%',
  className = '',
  ...props
}: SkeletonTextProps) {
  if (lines === 1) {
    return (
      <Skeleton
        width={width}
        height={lineHeight}
        className={className}
        {...props}
      />
    )
  }
  
  return (
    <div className={className} {...props}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          width={index === lines - 1 ? '80%' : width}
          height={lineHeight}
          className={index < lines - 1 ? 'mb-2' : ''}
          style={index < lines - 1 ? { marginBottom: `${gap}px` } : undefined}
        />
      ))}
    </div>
  )
}

/**
 * SkeletonCard - For note cards
 * Matches Card component dimensions and layout
 */
export interface SkeletonCardProps extends SkeletonProps {
  showAvatar?: boolean
  showBanner?: boolean
  avatarSize?: number
}

export function SkeletonCard({
  showAvatar = true,
  showBanner = false,
  avatarSize = 32,
  className = '',
  ...props
}: SkeletonCardProps) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl p-4 ${className}`} {...props}>
      {showAvatar && (
        <div className="flex items-center gap-3 mb-3">
          <SkeletonAvatar size={avatarSize} />
          <div className="flex-1">
            <SkeletonText lines={1} width="40%" lineHeight={16} />
          </div>
        </div>
      )}
      <div className="space-y-2 mb-3">
        <SkeletonText lines={2} width="100%" lineHeight={16} gap={4} />
      </div>
      {showBanner && (
        <div className="mt-3 flex items-start gap-3 p-3 rounded-lg bg-gray-100">
          <SkeletonAvatar size={48} />
          <div className="flex-1">
            <SkeletonText lines={1} width="60%" lineHeight={16} className="mb-1" />
            <SkeletonText lines={1} width="80%" lineHeight={14} />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * SkeletonBanner - For project banners
 * Matches project banner layout in NoteCard
 */
export interface SkeletonBannerProps extends SkeletonProps {
  avatarSize?: number
}

export function SkeletonBanner({
  avatarSize = 48,
  className = '',
  ...props
}: SkeletonBannerProps) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg bg-gray-100 ${className}`} {...props}>
      <SkeletonAvatar size={avatarSize} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <SkeletonText lines={1} width="50%" lineHeight={16} />
          <Skeleton width={60} height={14} rounded />
        </div>
        <SkeletonText lines={1} width="70%" lineHeight={14} />
      </div>
    </div>
  )
}

