'use client'

import React, { useState, useEffect, useRef, ReactNode } from 'react'

export interface LazyLoadProps {
  children: ReactNode
  fallback?: ReactNode
  rootMargin?: string
  threshold?: number | number[]
  /**
   * If true, component will unmount when it leaves viewport
   * Useful for very large lists to save memory
   * Default: false (component stays mounted once loaded)
   */
  unmountOnExit?: boolean
  /**
   * If true, component will load immediately (skip lazy loading)
   * Useful for above-the-fold content
   * Default: false
   */
  eager?: boolean
}

/**
 * LazyLoad - Universal viewport-based lazy loading wrapper
 * 
 * Uses IntersectionObserver to load content when it enters the viewport.
 * Shows a fallback (skeleton) while loading.
 * 
 * @example
 * <LazyLoad rootMargin="200px" fallback={<SkeletonCard />}>
 *   <NoteCard note={note} />
 * </LazyLoad>
 */
export function LazyLoad({
  children,
  fallback = null,
  rootMargin = '0px',
  threshold = 0,
  unmountOnExit = false,
  eager = false,
}: LazyLoadProps) {
  const [isVisible, setIsVisible] = useState(eager)
  const [hasBeenVisible, setHasBeenVisible] = useState(eager)
  const containerRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  
  useEffect(() => {
    // If eager, skip lazy loading
    if (eager) {
      setIsVisible(true)
      setHasBeenVisible(true)
      return
    }
    
    const container = containerRef.current
    if (!container) return
    
    // Create IntersectionObserver
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true)
            setHasBeenVisible(true)
            
            // If unmountOnExit is false, we can stop observing once loaded
            if (!unmountOnExit) {
              observerRef.current?.unobserve(container)
            }
          } else if (unmountOnExit && hasBeenVisible) {
            // Only unmount if we've been visible before and unmountOnExit is true
            setIsVisible(false)
          }
        })
      },
      {
        rootMargin,
        threshold,
      }
    )
    
    observerRef.current.observe(container)
    
    return () => {
      if (observerRef.current && container) {
        observerRef.current.unobserve(container)
      }
    }
  }, [rootMargin, threshold, unmountOnExit, eager, hasBeenVisible])
  
  return (
    <div ref={containerRef}>
      {isVisible ? children : fallback}
    </div>
  )
}

