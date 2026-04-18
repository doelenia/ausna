/**
 * Client-side resize/compress for profile avatars before upload (onboarding, editor, create form).
 * Same pipeline as note image refs: HEIC → browser-safe image, then canvas resize with EXIF handling.
 * Output is JPEG within max dimension, matching server-side avatar compression targets.
 */

import { ensureBrowserCompatibleImage } from '@/lib/utils/heic-converter'

/** Align with note images / `serverActions.bodySizeLimit` in next.config.js */
export const PROFILE_AVATAR_MAX_INPUT_BYTES = 50 * 1024 * 1024

/**
 * Read EXIF orientation from image file (JPEG).
 * Returns orientation value (1–8) or null if not found.
 */
function getExifOrientation(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const view = new DataView(e.target?.result as ArrayBuffer)

      if (view.getUint16(0, false) !== 0xffd8) {
        resolve(null)
        return
      }

      const length = view.byteLength
      let offset = 2

      while (offset < length) {
        if (view.getUint16(offset, false) !== 0xffe1) {
          offset += 2
          if (offset >= length) break
          const markerLength = view.getUint16(offset, false)
          offset += 2 + markerLength
          continue
        }

        offset += 2
        if (view.getUint32(offset, false) !== 0x45786966) {
          resolve(null)
          return
        }

        offset += 6
        const tiffOffset = offset
        const isLittleEndian = view.getUint16(tiffOffset, false) === 0x4949

        if (view.getUint16(tiffOffset + 2, !isLittleEndian) !== 0x002a) {
          resolve(null)
          return
        }

        const ifdOffset = view.getUint32(tiffOffset + 4, !isLittleEndian)
        const ifdStart = tiffOffset + ifdOffset
        const entryCount = view.getUint16(ifdStart, !isLittleEndian)

        for (let i = 0; i < entryCount; i++) {
          const entryOffset = ifdStart + 2 + i * 12
          const tag = view.getUint16(entryOffset, !isLittleEndian)

          if (tag === 0x0112) {
            const type = view.getUint16(entryOffset + 2, !isLittleEndian)
            if (type === 3) {
              resolve(view.getUint16(entryOffset + 8, !isLittleEndian))
              return
            }
          }
        }

        resolve(null)
        return
      }

      resolve(null)
    }
    reader.onerror = () => resolve(null)
    reader.readAsArrayBuffer(file)
  })
}

function applyExifOrientation(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  orientation: number,
  imgWidth: number,
  imgHeight: number
): { width: number; height: number } {
  switch (orientation) {
    case 2:
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
      return { width: canvas.width, height: canvas.height }
    case 3:
      ctx.translate(canvas.width, canvas.height)
      ctx.rotate(Math.PI)
      return { width: canvas.width, height: canvas.height }
    case 4:
      ctx.translate(0, canvas.height)
      ctx.scale(1, -1)
      return { width: canvas.width, height: canvas.height }
    case 5:
      canvas.width = imgHeight
      canvas.height = imgWidth
      ctx.translate(imgHeight, 0)
      ctx.rotate(Math.PI / 2)
      ctx.scale(-1, 1)
      return { width: imgHeight, height: imgWidth }
    case 6:
      canvas.width = imgHeight
      canvas.height = imgWidth
      ctx.translate(imgHeight, 0)
      ctx.rotate(Math.PI / 2)
      return { width: imgHeight, height: imgWidth }
    case 7:
      canvas.width = imgHeight
      canvas.height = imgWidth
      ctx.translate(imgHeight, 0)
      ctx.rotate(Math.PI / 2)
      ctx.scale(-1, 1)
      return { width: imgHeight, height: imgWidth }
    case 8:
      canvas.width = imgHeight
      canvas.height = imgWidth
      ctx.translate(0, imgWidth)
      ctx.rotate(-Math.PI / 2)
      return { width: imgHeight, height: imgWidth }
    default:
      return { width: canvas.width, height: canvas.height }
  }
}

/**
 * Resize to fit within maxWidth × maxHeight and encode as JPEG (orientation applied).
 * White background avoids dark fringes when converting transparent PNG to JPEG.
 */
async function compressImageToJpegMaxDimensions(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<File> {
  const orientation = await getExifOrientation(file)

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        if (!img.width || !img.height) {
          reject(new Error('Invalid image dimensions'))
          return
        }

        let width = img.width
        let height = img.height

        const isRotated =
          orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8
        if (isRotated) {
          ;[width, height] = [height, width]
        }

        if (width > maxWidth || height > maxHeight) {
          const aspectRatio = width / height
          if (width > height) {
            width = Math.min(width, maxWidth)
            height = width / aspectRatio
          } else {
            height = Math.min(height, maxHeight)
            width = height * aspectRatio
          }
        }

        if (isRotated) {
          ;[width, height] = [height, width]
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }

        if (orientation && orientation > 1) {
          applyExifOrientation(ctx, canvas, orientation, width, height)
        }

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'))
              return
            }

            const out = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, '.jpg'),
              { type: 'image/jpeg', lastModified: Date.now() }
            )
            resolve(out)
          },
          'image/jpeg',
          quality
        )
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Prepare a profile photo file for upload: HEIC compatibility + canvas JPEG within max dimensions.
 */
export async function prepareProfileAvatarFile(file: File): Promise<File> {
  if (file.size > PROFILE_AVATAR_MAX_INPUT_BYTES) {
    throw new Error(
      `Image is too large (max ${PROFILE_AVATAR_MAX_INPUT_BYTES / (1024 * 1024)}MB). Choose a smaller photo or compress it first.`
    )
  }

  const compatible = await ensureBrowserCompatibleImage(file)
  return compressImageToJpegMaxDimensions(compatible, 400, 400, 0.85)
}
