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
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  // Dropdown menu extends to the right from the button
  const dropdownMenuClasses = [
    'absolute mt-2 z-20 bg-white rounded-lg shadow-lg border border-gray-200 min-w-[160px]',
    'left-0',
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
          <div className={dropdownMenuClasses}>
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

