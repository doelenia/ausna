'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ButtonVariant } from './Button'
import { UIText } from './Typography'
import { MoreVertical, LucideIcon } from 'lucide-react'

export interface DropdownItem {
  label: string
  onClick: () => void
  variant?: ButtonVariant
  disabled?: boolean
  asLink?: boolean
  href?: string
  icon?: LucideIcon
}

export interface DropdownProps {
  items: DropdownItem[]
  className?: string
  align?: 'left' | 'right'
}

/**
 * Dropdown component that matches Button styling
 * 
 * @example
 * <Dropdown
 *   items={[
 *     { label: 'Edit', onClick: () => console.log('edit') },
 *     { label: 'Delete', onClick: () => console.log('delete'), variant: 'danger' }
 *   ]}
 * />
 */
export function Dropdown({
  items,
  className = '',
  align = 'right',
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left?: number; right?: number } | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Calculate position when dropdown opens
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      // First, set initial position (right-aligned by default)
      const buttonRect = dropdownRef.current.getBoundingClientRect()
      setMenuPosition({
        top: buttonRect.bottom + 8, // mt-2 = 8px
        left: buttonRect.left,
      })

      // Then measure and adjust after render
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!dropdownRef.current || !menuRef.current) return

          const buttonRect = dropdownRef.current.getBoundingClientRect()
          const menuRect = menuRef.current.getBoundingClientRect()
          const edgeMargin = 16 // Minimum distance from edge in pixels

          // Find the content container (the one with max-width constraint)
          let containerElement: HTMLElement | null = dropdownRef.current
          while (containerElement) {
            const style = window.getComputedStyle(containerElement)
            const maxWidth = style.maxWidth
            // Check if this element has a max-width constraint (like --max-content-width)
            if (maxWidth && maxWidth !== 'none' && maxWidth !== '100%') {
              break
            }
            containerElement = containerElement.parentElement
          }

          // If we found a container, measure against it; otherwise use viewport
          let containerRight: number
          if (containerElement) {
            const containerRect = containerElement.getBoundingClientRect()
            containerRight = containerRect.right
          } else {
            containerRight = window.innerWidth
          }

          // Check if menu would overflow on the right
          // For right alignment: button left + menu width should not exceed container right - margin
          const wouldOverflowRight = buttonRect.left + menuRect.width > containerRight - edgeMargin

          // Update position based on alignment preference and overflow detection
          if (align === 'right' && wouldOverflowRight) {
            // Switch to left alignment
            setMenuPosition({
              top: buttonRect.bottom + 8,
              right: window.innerWidth - buttonRect.right,
            })
          } else if (align === 'right') {
            // Keep right alignment
            setMenuPosition({
              top: buttonRect.bottom + 8,
              left: buttonRect.left,
            })
          } else {
            // Left alignment (explicit)
            setMenuPosition({
              top: buttonRect.bottom + 8,
              right: window.innerWidth - buttonRect.right,
            })
          }
        })
      })
    } else {
      setMenuPosition(null)
    }
  }, [isOpen, align])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Match the style of members/friends more button
  const buttonClasses = `flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors ${className}`

  // Dropdown menu positioning - use fixed to escape container overflow
  const dropdownMenuClasses = [
    'fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 min-w-[160px]',
  ]
    .filter(Boolean)
    .join(' ')

  const handleItemClick = (item: DropdownItem) => {
    if (!item.disabled) {
      item.onClick()
      setIsOpen(false)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClasses}
        aria-label="More options"
        title="More options"
      >
        <MoreVertical className="w-4 h-4 text-gray-600 fill-current" strokeWidth={2} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div 
            ref={menuRef} 
            className={dropdownMenuClasses}
            style={menuPosition ? {
              top: `${menuPosition.top}px`,
              left: menuPosition.left !== undefined ? `${menuPosition.left}px` : undefined,
              right: menuPosition.right !== undefined ? `${menuPosition.right}px` : undefined,
            } : undefined}
          >
            <div className="py-1">
              {items.map((item, index) => {
                const Icon = item.icon
                const iconElement = Icon ? (
                  <Icon className="w-4 h-4 mr-2" strokeWidth={1.5} />
                ) : null

                if (item.asLink && item.href) {
                  return (
                    <Link
                      key={index}
                      href={item.href}
                      className={`w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed ${
                        item.variant === 'danger' ? 'text-red-600 hover:bg-red-50' : ''
                      }`}
                    >
                      {iconElement}
                      <UIText>{item.label}</UIText>
                    </Link>
                  )
                }

                return (
                  <button
                    key={index}
                    onClick={() => handleItemClick(item)}
                    disabled={item.disabled}
                    className={`w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed ${
                      item.variant === 'danger' ? 'text-red-600 hover:bg-red-50' : ''
                    }`}
                  >
                    {iconElement}
                    <UIText>{item.label}</UIText>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

