'use client'

import { useEffect } from 'react'

export function ImageViewerPopup({
  open,
  src,
  alt,
  onClose,
}: {
  open: boolean
  src: string
  alt: string
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <img
        src={src}
        alt={alt}
        className="absolute left-1/2 top-1/2 max-w-[92vw] max-h-[92vh] -translate-x-1/2 -translate-y-1/2 object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

