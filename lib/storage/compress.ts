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
 * Handles iOS formats (HEIC/HEIF) and converts them to JPEG
 */
async function detectImageFormat(file: File | Blob, buffer: Buffer): Promise<'jpeg' | 'png' | 'webp'> {
  // Check MIME type first
  if (file instanceof File) {
    const mimeType = file.type.toLowerCase()
    if (mimeType.includes('png')) return 'png'
    if (mimeType.includes('webp')) return 'webp'
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpeg'
    // iOS HEIC/HEIF formats - will be converted to JPEG
    if (mimeType.includes('heic') || mimeType.includes('heif')) return 'jpeg'
  }
  
  // Check file extension if available
  if (file instanceof File && file.name) {
    const ext = file.name.toLowerCase().split('.').pop()
    if (ext === 'png') return 'png'
    if (ext === 'webp') return 'webp'
    if (ext === 'jpg' || ext === 'jpeg') return 'jpeg'
    // iOS HEIC/HEIF formats - will be converted to JPEG
    if (ext === 'heic' || ext === 'heif') return 'jpeg'
  }
  
  // Detect from buffer metadata using sharp
  // Sharp can detect HEIC/HEIF and will handle conversion
  try {
    const metadata = await sharp(buffer).metadata()
    const fmt = (metadata.format || '').toLowerCase()
    if (fmt === 'png') return 'png'
    if (fmt === 'webp') return 'webp'
    if (fmt === 'jpeg' || fmt === 'jpg') return 'jpeg'
    // HEIC/HEIF formats detected by sharp - convert to JPEG
    if (fmt === 'heic' || fmt === 'heif') return 'jpeg'
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

  // Log file info for debugging (especially useful for iOS HEIC detection)
  if (file instanceof File) {
    console.log('Processing image file:', {
      name: file.name,
      type: file.type,
      size: file.size,
    })
  }

  // Detect format if not explicitly specified, preserving PNG transparency
  let format = opts.format
  if (format === 'jpeg' || !format) {
    // Auto-detect format to preserve PNG transparency
    const detectedFormat = await detectImageFormat(file, buffer)
    
    // Log detected format for debugging
    if (file instanceof File && (file.type.includes('heic') || file.type.includes('heif') || file.name?.toLowerCase().endsWith('.heic') || file.name?.toLowerCase().endsWith('.heif'))) {
      console.log('iOS HEIC/HEIF image detected, converting to JPEG')
    }
    
    if (detectedFormat === 'png') {
      format = 'png' // Preserve PNG format to maintain transparency
    } else {
      format = detectedFormat || 'jpeg'
    }
  }

  // Use sharp to resize and compress
  // Sharp automatically handles HEIC/HEIF conversion when reading the buffer
  // If HEIC support is not available, sharp will throw an error which we'll catch
  try {
    let pipeline = sharp(buffer)
      // Auto-rotate based on EXIF orientation data
      // This ensures images taken in portrait mode display correctly
      .rotate()
      .resize(opts.maxWidth, opts.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })

    // Apply format-specific compression
    // Note: HEIC/HEIF images will be automatically converted to JPEG by sharp
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
  } catch (error: any) {
    // If sharp fails, try to get metadata to understand the issue
    const errorMessage = error?.message || 'Unknown compression error'
    
    console.error('Image compression error:', {
      errorMessage,
      fileName: file instanceof File ? file.name : 'unknown',
      fileType: file instanceof File ? file.type : 'unknown',
      fileSize: file.size,
    })
    
    // Check if this is a HEIC/HEIF format issue
    if (errorMessage.includes('heic') || errorMessage.includes('heif') || 
        (file instanceof File && (file.type.includes('heic') || file.type.includes('heif')))) {
      console.error('HEIC/HEIF format detected but Sharp cannot process it:', errorMessage)
      throw new Error(`HEIC/HEIF format not supported. Please convert the image to JPEG or PNG before uploading. Original error: ${errorMessage}`)
    }
    
    // Check for sharp initialization/library errors
    if (errorMessage.includes('Vips') || 
        errorMessage.includes('libvips') ||
        errorMessage.includes('sharp') && (errorMessage.includes('module') || errorMessage.includes('require'))) {
      throw new Error(`Image processing library error. Please try again or contact support. Technical details: ${errorMessage}`)
    }
    
    // Check for unsupported format
    if (errorMessage.includes('unsupported') || errorMessage.includes('format') || errorMessage.includes('input')) {
      const fileType = file instanceof File ? file.type : 'unknown'
      const fileName = file instanceof File ? file.name : 'unknown'
      throw new Error(`Unsupported image format. Please use JPEG, PNG, or WebP. File: ${fileName}, Type: ${fileType}. Original error: ${errorMessage}`)
    }
    
    // Re-throw with more context for other errors
    throw new Error(`Failed to process image: ${errorMessage}`)
  }
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
  
  const blob = new Blob([Uint8Array.from(buffer)], { type: mimeTypes[format] }) as Blob & { format?: 'jpeg' | 'png' | 'webp' }
  blob.format = format
  return blob
}

