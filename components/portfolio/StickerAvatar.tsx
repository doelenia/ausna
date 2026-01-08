'use client'

import { PortfolioType } from '@/types/portfolio'
import Link from 'next/link'
import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react'

interface StickerAvatarProps {
  src?: string // Optional - can be emoji instead
  alt: string
  type: PortfolioType
  size?: number | string
  className?: string
  href?: string
  onClick?: () => void
  normalizeScale?: number // Multiplier for normalization scale (default: 1.0, set to 0 to disable)
  emoji?: string // Emoji to display (for projects/community when no image)
  name?: string // Name to display on emoji avatars
  variant?: 'default' | 'mini' // Mini variant for compact displays (no white outline)
}

// Cache for bounding box calculations to avoid recalculating for the same image
const boundingBoxCache = new Map<string, { x: number; y: number; width: number; height: number } | null>()

/**
 * Calculate the bounding box of non-transparent pixels in an image
 * Returns null if CORS prevents access or if no non-transparent pixels are found
 * Results are cached per image URL to avoid expensive recalculations
 */
function getImageBoundingBox(image: HTMLImageElement, imageUrl: string): { x: number; y: number; width: number; height: number } | null {
  // Check cache first
  if (boundingBoxCache.has(imageUrl)) {
    return boundingBoxCache.get(imageUrl)!
  }

  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      boundingBoxCache.set(imageUrl, null)
      return null
    }

    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    
    try {
      ctx.drawImage(image, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data

      let minX = canvas.width
      let minY = canvas.height
      let maxX = 0
      let maxY = 0

      // Find bounding box of non-transparent pixels
      // Use progressive sampling: only sample for very large images (>4MP) and use every 2nd pixel
      // This balances performance with accuracy to prevent pixelated borders
      const pixelCount = canvas.width * canvas.height
      const sampleRate = pixelCount > 4000000 ? 2 : 1 // Only sample for images > 4MP, and use every 2nd pixel
      
      for (let y = 0; y < canvas.height; y += sampleRate) {
        for (let x = 0; x < canvas.width; x += sampleRate) {
          const alpha = data[(y * canvas.width + x) * 4 + 3]
          if (alpha > 0) {
            // Non-transparent pixel found
            // When sampling, expand bounds to account for skipped pixels
            const adjustedMinX = sampleRate > 1 ? Math.max(0, x - sampleRate) : x
            const adjustedMinY = sampleRate > 1 ? Math.max(0, y - sampleRate) : y
            const adjustedMaxX = sampleRate > 1 ? Math.min(canvas.width - 1, x + sampleRate) : x
            const adjustedMaxY = sampleRate > 1 ? Math.min(canvas.height - 1, y + sampleRate) : y
            
            minX = Math.min(minX, adjustedMinX)
            minY = Math.min(minY, adjustedMinY)
            maxX = Math.max(maxX, adjustedMaxX)
            maxY = Math.max(maxY, adjustedMaxY)
          }
        }
      }

      if (minX >= maxX || minY >= maxY) {
        // No non-transparent pixels found
        boundingBoxCache.set(imageUrl, null)
        return null
      }

      const result = {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      }
      boundingBoxCache.set(imageUrl, result)
      return result
    } catch (e) {
      // CORS error or other security error - fall back to using image dimensions
      console.warn('Cannot access image pixel data (CORS issue), using image dimensions as fallback:', e)
      boundingBoxCache.set(imageUrl, null)
      return null
    }
  } catch (e) {
    console.warn('Error calculating image bounding box:', e)
    boundingBoxCache.set(imageUrl, null)
    return null
  }
}

/**
 * StickerAvatar component - A special avatar with sticker-like styling
 * - Human: Circular shape with thin gray outline, no shadow, no dimming
 * - Projects/Community: Preserves the shape of the uploaded PNG (transparency) with white outline and shadow
 *   Automatically scales PNGs to appear similarly sized by detecting non-transparent bounding box
 * 
 * Optimized with React.memo and caching to prevent unnecessary re-renders and expensive recalculations
 */
function StickerAvatarComponent({
  src,
  alt,
  type,
  size = 96,
  className = '',
  href,
  onClick,
  normalizeScale = 1.0, // Default: apply normalization
  emoji,
  name,
  variant = 'default',
}: StickerAvatarProps) {
  const isHuman = type === 'human'
  const [scale, setScale] = useState<number>(1)
  const [imageLoaded, setImageLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const calculatedSrcRef = useRef<string | undefined>(undefined)
  
  // Determine if this is an emoji avatar (for projects/community only)
  // If no src is provided or src is empty, and emoji is provided, use emoji avatar
  const isEmojiAvatar = useMemo(() => {
    return !isHuman && (!src || src.trim() === '') && (emoji !== undefined && emoji !== null && emoji.trim() !== '')
  }, [isHuman, src, emoji])

  // Calculate scale for PNG images to normalize their visual size
  // Memoized to prevent recreation on every render
  const calculateScale = useCallback((img: HTMLImageElement, imageUrl: string) => {
    // If normalizeScale is 0, disable scaling
    if (normalizeScale === 0) {
      setScale(1)
      return
    }

    // Skip if already calculated for this image
    if (calculatedSrcRef.current === imageUrl && imageLoaded) {
      return
    }

    const containerSize = typeof size === 'number' ? size : 96
    const maxDisplaySize = containerSize - 8 // Account for padding
    const targetContentSize = containerSize * 0.7 // Target size for content area
    
    // Try to get bounding box first (more accurate) - uses cache
    const bbox = getImageBoundingBox(img, imageUrl)
    if (bbox) {
      // Calculate the ratio of content to image size
      const contentRatio = Math.max(bbox.width, bbox.height) / Math.max(img.naturalWidth, img.naturalHeight)
      
      // Estimate what the content would be displayed at (image fits in maxDisplaySize)
      const displayedContentSize = maxDisplaySize * contentRatio
      
      // Scale to make content appear at target size
      const calculatedScale = targetContentSize / displayedContentSize
      
      // Apply the normalizeScale multiplier
      const finalScale = calculatedScale * normalizeScale
      
      // Clamp scale between 0.5 and 2.0 to prevent extreme scaling
      setScale(Math.max(0.5, Math.min(2.0, finalScale)))
    } else {
      // Fallback: no scaling if we can't detect bounding box
      setScale(1 * normalizeScale)
    }
    
    calculatedSrcRef.current = imageUrl
  }, [normalizeScale, size, imageLoaded])

  // Reset state when src changes
  useEffect(() => {
    if (src !== calculatedSrcRef.current) {
      setImageLoaded(false)
      setScale(1)
      calculatedSrcRef.current = undefined
    }
  }, [src])

  // Only calculate scale for non-human avatars with images
  useEffect(() => {
    if (isHuman || isEmojiAvatar || !src || !imgRef.current) return

    const img = imgRef.current
    const imageUrl = src
    
    // Skip if already calculated
    if (calculatedSrcRef.current === imageUrl && imageLoaded) {
      return
    }

    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      // Use requestIdleCallback if available to defer expensive calculation
      const scheduleCalculation = () => {
        calculateScale(img, imageUrl)
        setImageLoaded(true)
      }
      
      if ('requestIdleCallback' in window && window.requestIdleCallback) {
        window.requestIdleCallback(scheduleCalculation, { timeout: 1000 })
      } else {
        // Fallback: use setTimeout to defer to next tick
        setTimeout(scheduleCalculation, 0)
      }
    }
  }, [src, isHuman, isEmojiAvatar, calculateScale, imageLoaded])

  // Memoize expensive style calculations
  const sizeStyle = useMemo(() => {
    return typeof size === 'number' 
      ? { width: `${size}px`, height: `${size}px` }
      : { width: size, height: size }
  }, [size])

  // Shadow values for project/community avatars
  const shadowValue = '0px 0px 2px rgba(0, 0, 0, 0.2)'

  // For PNG shape detection, we use filter: drop-shadow which respects transparency
  // This creates a crisp white outline and shadow that follows the image's actual shape
  // Using multiple drop-shadows with 0 blur at small offsets to create a solid outline that follows the PNG's alpha channel
  const imageFilter = useMemo(() => {
    if (isHuman) {
      return undefined
    }
    // Mini variant: no white outline, only subtle shadow
    if (variant === 'mini') {
      return `brightness(0.98) drop-shadow(${shadowValue})`
    }
    // Default variant: full white outline + shadow
    return 'brightness(0.98) ' +
      'drop-shadow(-2px -2px 0 white) drop-shadow(2px -2px 0 white) drop-shadow(-2px 2px 0 white) drop-shadow(2px 2px 0 white) ' +
      'drop-shadow(-1px 0 0 white) drop-shadow(1px 0 0 white) drop-shadow(0 -1px 0 white) drop-shadow(0 1px 0 white) ' +
      `drop-shadow(${shadowValue})`
  }, [isHuman, shadowValue, variant])

  const containerStyle = useMemo(() => {
    if (isHuman) {
      return {
        ...sizeStyle,
        borderRadius: '50%',
        overflow: 'hidden',
        border: '1px solid rgba(156, 163, 175, 0.5)', // Thin gray outline
      }
    }
    return {
      // For PNGs, add padding to ensure outline and shadow are visible (1px outline + 2px shadow)
      padding: variant === 'mini' ? '2px' : '4px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: sizeStyle.width,
      minHeight: sizeStyle.height,
    }
  }, [isHuman, sizeStyle, variant])

  // Emoji avatar layout - match image avatar styling
  const emojiAvatarElement = isEmojiAvatar ? (
    <div
      style={containerStyle}
      className={`
        relative
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `.trim()}
      onClick={onClick}
    >
      {/* Emoji with same white outline and shadow as image avatars */}
      <div
        style={{
          fontSize: typeof size === 'number' ? `${size - 8}px` : `calc(${size} - 8px)`,
          lineHeight: 1,
          // Match the same styling as image avatars (variant-aware)
          filter: isHuman
            ? undefined
            : variant === 'mini'
            ? `brightness(0.98) drop-shadow(${shadowValue})`
            : `brightness(0.98) drop-shadow(-2px -2px 0 white) drop-shadow(2px -2px 0 white) drop-shadow(-2px 2px 0 white) drop-shadow(2px 2px 0 white) drop-shadow(-1px 0 0 white) drop-shadow(1px 0 0 white) drop-shadow(0 -1px 0 white) drop-shadow(0 1px 0 white) drop-shadow(${shadowValue})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          textAlign: 'center',
          verticalAlign: 'middle',
        }}
      >
        {emoji || '🎨'}
      </div>
    </div>
  ) : null

  // Image avatar layout
  const imageElement = !isEmojiAvatar ? (
    <div
      style={containerStyle}
      className={`
        relative
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `.trim()}
      onClick={onClick}
    >
      {src ? (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          style={{
            filter: imageFilter,
            maxWidth: isHuman ? '100%' : `calc(${typeof size === 'number' ? `${size}px` : size} - 8px)`,
            maxHeight: isHuman ? '100%' : `calc(${typeof size === 'number' ? `${size}px` : size} - 8px)`,
            width: isHuman ? '100%' : 'auto',
            height: isHuman ? '100%' : 'auto',
            objectFit: isHuman ? 'cover' : 'contain',
            display: 'block',
            transform: isHuman ? 'none' : `scale(${scale})`,
            transformOrigin: 'center',
            transition: 'transform 0.2s ease-out',
          }}
          className={isHuman ? 'rounded-full' : ''}
          onLoad={() => {
            if (!isHuman && !isEmojiAvatar && imgRef.current && !imageLoaded && src) {
              // Use requestIdleCallback if available to defer expensive calculation
              const scheduleCalculation = () => {
                if (imgRef.current && src) {
                  calculateScale(imgRef.current, src)
                  setImageLoaded(true)
                }
              }
              
              if ('requestIdleCallback' in window && window.requestIdleCallback) {
                window.requestIdleCallback(scheduleCalculation, { timeout: 1000 })
              } else {
                // Fallback: use setTimeout to defer to next tick
                setTimeout(scheduleCalculation, 0)
              }
            }
          }}
          onError={() => {
            // Reset scale on error
            setScale(1)
            setImageLoaded(true)
          }}
        />
      ) : null}
    </div>
  ) : null

  const avatarElement = isEmojiAvatar ? emojiAvatarElement : imageElement

  if (href) {
    return (
      <Link href={href} className="inline-block">
        {avatarElement}
      </Link>
    )
  }

  return avatarElement
}

// Memoize the component to prevent unnecessary re-renders
// Only re-render if props actually change
export const StickerAvatar = memo(StickerAvatarComponent, (prevProps, nextProps) => {
  // Custom comparison function for better performance
  return (
    prevProps.src === nextProps.src &&
    prevProps.alt === nextProps.alt &&
    prevProps.type === nextProps.type &&
    prevProps.size === nextProps.size &&
    prevProps.className === nextProps.className &&
    prevProps.href === nextProps.href &&
    prevProps.onClick === nextProps.onClick &&
    prevProps.normalizeScale === nextProps.normalizeScale &&
    prevProps.emoji === nextProps.emoji &&
    prevProps.name === nextProps.name &&
    prevProps.variant === nextProps.variant
  )
})

