/**
 * Browser-only helpers for note image attachments (EXIF, resize, thumbnails).
 * Used by note create form and space feed mini composer.
 */

/**
 * Read EXIF orientation from image file
 * Returns orientation value (1-8) or null if not found
 */
export function getExifOrientation(file: File): Promise<number | null> {
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

/**
 * Apply EXIF orientation transformation to canvas context before drawing the image.
 */
export function applyExifOrientation(
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

export async function compressImage(
  file: File,
  maxWidth: number = 1920,
  maxHeight: number = 1920,
  quality: number = 0.85,
  maxFileSizeMB: number = 2
): Promise<File> {
  const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024
  if (file.size <= maxFileSizeBytes) {
    return new Promise((resolve, reject) => {
      void (async () => {
        const orientation = await getExifOrientation(file)

        const reader = new FileReader()
        reader.onload = (e) => {
          const img = new Image()
          img.onload = () => {
            if (img.width <= maxWidth && img.height <= maxHeight) {
              resolve(file)
              return
            }

            const aspectRatio = img.width / img.height
            let width = img.width
            let height = img.height

            if (width > maxWidth || height > maxHeight) {
              if (width > height) {
                width = Math.min(width, maxWidth)
                height = width / aspectRatio
              } else {
                height = Math.min(height, maxHeight)
                width = height * aspectRatio
              }
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
              const { width: finalWidth, height: finalHeight } = applyExifOrientation(
                ctx,
                canvas,
                orientation,
                width,
                height
              )
              ctx.drawImage(img, 0, 0, width, height)
              width = finalWidth
              height = finalHeight
            } else {
              ctx.drawImage(img, 0, 0, width, height)
            }

            const isPng = file.type === 'image/png'
            const outputFormat = isPng ? 'image/png' : 'image/jpeg'

            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Failed to resize image'))
                  return
                }

                const resizedFile = new File(
                  [blob],
                  file.name.replace(/\.[^.]+$/, isPng ? '.png' : '.jpg'),
                  {
                    type: outputFormat,
                    lastModified: Date.now(),
                  }
                )

                resolve(resizedFile)
              },
              outputFormat,
              isPng ? undefined : 0.95
            )
          }
          img.onerror = () => reject(new Error('Failed to load image'))
          img.src = e.target?.result as string
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
      })()
    })
  }

  return new Promise((resolve, reject) => {
    void (async () => {
      const orientation = await getExifOrientation(file)

      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          let width = img.width
          let height = img.height

          const isRotated = orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8
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
            const { width: finalWidth, height: finalHeight } = applyExifOrientation(
              ctx,
              canvas,
              orientation,
              width,
              height
            )
            ctx.drawImage(img, 0, 0, width, height)
            width = finalWidth
            height = finalHeight
          } else {
            ctx.drawImage(img, 0, 0, width, height)
          }

          const isPng = file.type === 'image/png'
          const outputFormat = isPng ? 'image/png' : 'image/jpeg'

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'))
                return
              }

              const compressedFile = new File(
                [blob],
                file.name.replace(/\.[^.]+$/, isPng ? '.png' : '.jpg'),
                {
                  type: outputFormat,
                  lastModified: Date.now(),
                }
              )

              resolve(compressedFile)
            },
            outputFormat,
            isPng ? undefined : quality
          )
        }
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = e.target?.result as string
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })()
  })
}

export function createThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }

        const maxSize = 200
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width
            width = maxSize
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height
            height = maxSize
          }
        }

        canvas.width = width
        canvas.height = height

        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const thumbnailUrl = URL.createObjectURL(blob)
              resolve(thumbnailUrl)
            } else {
              reject(new Error('Failed to create thumbnail blob'))
            }
          },
          'image/jpeg',
          0.85
        )
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}
