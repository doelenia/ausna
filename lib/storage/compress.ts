import sharp from 'sharp'

export interface CompressionOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  format?: 'jpeg' | 'png' | 'webp'
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 85,
  format: 'jpeg',
}

/**
 * Detect image format from buffer or file
 */
async function detectImageFormat(file: File | Blob, buffer: Buffer): Promise<'jpeg' | 'png' | 'webp'> {
  // Check MIME type first
  if (file instanceof File) {
    const mimeType = file.type.toLowerCase()
    if (mimeType.includes('png')) return 'png'
    if (mimeType.includes('webp')) return 'webp'
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpeg'
  }
  
  // Check file extension if available
  if (file instanceof File && file.name) {
    const ext = file.name.toLowerCase().split('.').pop()
    if (ext === 'png') return 'png'
    if (ext === 'webp') return 'webp'
    if (ext === 'jpg' || ext === 'jpeg') return 'jpeg'
  }
  
  // Detect from buffer metadata using sharp
  try {
    const metadata = await sharp(buffer).metadata()
    if (metadata.format === 'png') return 'png'
    if (metadata.format === 'webp') return 'webp'
    if (metadata.format === 'jpeg' || metadata.format === 'jpg') return 'jpeg'
  } catch {
    // If detection fails, default to jpeg
  }
  
  return 'jpeg'
}

/**
 * Compress an image file using sharp
 * @param file - The image file to compress
 * @param options - Compression options
 * @returns Compressed image buffer and format
 */
export async function compressImage(
  file: File | Blob,
  options: CompressionOptions = {}
): Promise<{ buffer: Buffer; format: 'jpeg' | 'png' | 'webp' }> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  // Convert File/Blob to Buffer
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Detect format if not explicitly specified, preserving PNG transparency
  let format = opts.format
  if (format === 'jpeg' || !format) {
    // Auto-detect format to preserve PNG transparency
    const detectedFormat = await detectImageFormat(file, buffer)
    if (detectedFormat === 'png') {
      format = 'png' // Preserve PNG format to maintain transparency
    } else {
      format = detectedFormat || 'jpeg'
    }
  }

  // Use sharp to resize and compress
  let pipeline = sharp(buffer)
    .resize(opts.maxWidth, opts.maxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    })

  // Apply format-specific compression
  switch (format) {
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality: opts.quality })
      break
    case 'png':
      // Preserve transparency for PNG
      pipeline = pipeline.png({ 
        quality: opts.quality, 
        compressionLevel: 9,
        palette: false, // Keep full color depth
      })
      break
    case 'webp':
      pipeline = pipeline.webp({ quality: opts.quality })
      break
  }

  const compressedBuffer = await pipeline.toBuffer()
  return { buffer: compressedBuffer, format }
}

/**
 * Compress an image and return as Blob
 */
export async function compressImageToBlob(
  file: File | Blob,
  options: CompressionOptions = {}
): Promise<Blob & { format?: 'jpeg' | 'png' | 'webp' }> {
  const { buffer, format } = await compressImage(file, options)
  
  // Determine MIME type based on detected/preserved format
  const mimeTypes: Record<string, string> = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  }
  
  const blob = new Blob([buffer], { type: mimeTypes[format] }) as Blob & { format?: 'jpeg' | 'png' | 'webp' }
  blob.format = format
  return blob
}

