import { openai } from '@/lib/openai/client'
import { UrlReference } from '@/types/note'
import { createClient } from '@/lib/supabase/server'
import { compressImageToBlob } from '@/lib/storage/compress'

const BUCKET_NAME = 'note-images'

/**
 * Normalize URL - add https:// if protocol is missing
 */
function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  
  // If it already has a protocol, return as is
  if (trimmed.match(/^https?:\/\//i)) {
    return trimmed
  }
  
  // If it starts with //, add https:
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`
  }
  
  // Otherwise, add https://
  return `https://${trimmed}`
}

/**
 * Extract hostname from URL
 */
function getHostname(url: string): string {
  try {
    const normalizedUrl = normalizeUrl(url)
    const urlObj = new URL(normalizedUrl)
    return urlObj.hostname.replace('www.', '')
  } catch {
    // If URL parsing fails, try to extract hostname manually
    const cleaned = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
    return cleaned || ''
  }
}

/**
 * Download and store an image from URL to Supabase storage
 */
async function downloadAndStoreImage(
  imageUrl: string,
  noteId: string,
  filename: string
): Promise<string | undefined> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AusnaBot/1.0)',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const blob = await response.blob()
    
    // Compress the image (preserves PNG format for transparency)
    const compressedBlob = await compressImageToBlob(blob, {
      maxWidth: 1200,
      maxHeight: 630, // Standard og:image dimensions
      quality: 85,
      // Don't force format - let it auto-detect to preserve PNG transparency
    })

    // Upload to Supabase storage
    const supabase = await createClient()
    
    // Ensure filename extension matches the format
    const format = compressedBlob.format || 'jpg'
    const extension = format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpg'
    const finalFilename = filename.endsWith(`.${extension}`) 
      ? filename 
      : filename.replace(/\.[^.]+$/, `.${extension}`)
    const filePath = `notes/${noteId}/url-assets/${finalFilename}`
    
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, compressedBlob, {
        cacheControl: '3600',
        upsert: true,
      })

    if (error) {
      throw new Error(`Failed to upload image: ${error.message}`)
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath)

    return urlData.publicUrl
  } catch (error) {
    console.error('Failed to download and store image:', error)
    return undefined
  }
}

/**
 * Get favicon URL for a hostname
 */
function getFaviconUrl(hostname: string): string {
  try {
    // Try common favicon locations
    const protocol = 'https://'
    return `${protocol}${hostname}/favicon.ico`
  } catch {
    return ''
  }
}

/**
 * Fetch URL metadata (title, description, etc.) using basic fetch
 * @param url - The URL to fetch metadata from
 * @param noteId - The note ID for storing images (optional, only needed if storing images)
 * @param storeImages - Whether to download and store images in storage
 */
async function fetchUrlMetadataBasic(
  url: string,
  noteId?: string,
  storeImages: boolean = false
): Promise<Partial<UrlReference>> {
  try {
    // Normalize URL to ensure it has a protocol
    const normalizedUrl = normalizeUrl(url)
    
    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AusnaBot/1.0)',
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()
    const hostname = getHostname(normalizedUrl)
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : undefined

    // Extract description from meta tags
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
    const description = descMatch ? descMatch[1].trim() : undefined

    // Extract og:image for header image
    const imageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    let headerImageUrl = imageMatch ? imageMatch[1].trim() : undefined
    
    // Normalize header image URL if it's relative
    if (headerImageUrl && !headerImageUrl.match(/^https?:\/\//i)) {
      try {
        const baseUrl = new URL(normalizedUrl)
        headerImageUrl = new URL(headerImageUrl, baseUrl).href
      } catch {
        // If normalization fails, keep original
      }
    }

    // Download and store images if requested
    let headerImage = headerImageUrl
    let hostIcon: string | undefined

    if (storeImages && noteId) {
      // Store header image
      if (headerImageUrl) {
        // Detect format from URL to preserve PNG transparency
        const urlLower = headerImageUrl.toLowerCase()
        const format = urlLower.includes('.png') ? 'png' : urlLower.includes('.webp') ? 'webp' : 'jpg'
        const storedHeaderImage = await downloadAndStoreImage(
          headerImageUrl,
          noteId,
          `header-${Date.now()}.${format}`
        )
        if (storedHeaderImage) {
          headerImage = storedHeaderImage
        }
      }

      // Try to get and store favicon
      const faviconUrl = getFaviconUrl(hostname)
      if (faviconUrl) {
        // Favicons are typically ICO or PNG, preserve format
        const storedFavicon = await downloadAndStoreImage(
          faviconUrl,
          noteId,
          `favicon-${Date.now()}.png` // Default to PNG for favicons to preserve transparency
        )
        if (storedFavicon) {
          hostIcon = storedFavicon
        }
      }
    } else {
      // Just use the favicon URL if not storing
      hostIcon = getFaviconUrl(hostname)
    }

    // Ensure hostName is always set
    const finalHostName = hostname || getHostname(normalizedUrl)
    
    return {
      url: normalizedUrl, // Return normalized URL
      hostName: finalHostName,
      hostIcon: hostIcon || getFaviconUrl(finalHostName), // Always provide a host icon
      title,
      description,
      headerImage,
    }
  } catch (error) {
    console.error('Failed to fetch URL metadata:', error)
    const normalizedUrl = normalizeUrl(url)
    const hostname = getHostname(normalizedUrl)
    return { 
      url: normalizedUrl, 
      hostName: hostname,
      hostIcon: getFaviconUrl(hostname), // Always provide a host icon
    }
  }
}

/**
 * Use ChatGPT with web search to get URL metadata
 */
async function fetchUrlMetadataWithAI(url: string): Promise<Partial<UrlReference>> {
  try {
    const normalizedUrl = normalizeUrl(url)
    const hostname = getHostname(normalizedUrl)
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that extracts metadata from URLs. Return a JSON object with title, description, and any other relevant information about the URL.',
        },
        {
          role: 'user',
          content: `Please provide metadata for this URL: ${normalizedUrl}\n\nReturn JSON with fields: title, description, hostName.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from AI')
    }

    const metadata = JSON.parse(content)
    
    return {
      url: normalizedUrl,
      hostName: metadata.hostName || hostname,
      title: metadata.title,
      description: metadata.description,
    }
  } catch (error) {
    console.error('Failed to fetch URL metadata with AI:', error)
    const normalizedUrl = normalizeUrl(url)
    return { url: normalizedUrl, hostName: getHostname(normalizedUrl) }
  }
}

/**
 * Fetch URL metadata with fallback to ChatGPT
 * First tries basic fetch, then falls back to AI if title/description are missing
 * @param url - The URL to fetch metadata from
 * @param noteId - The note ID for storing images (optional)
 * @param storeImages - Whether to download and store images in storage (default: true)
 */
export async function fetchUrlMetadata(
  url: string,
  noteId?: string,
  storeImages: boolean = true
): Promise<UrlReference> {
  // Normalize URL first
  const normalizedUrl = normalizeUrl(url)
  const defaultHostname = getHostname(normalizedUrl)
  
  // First try basic fetch
  const basicMetadata = await fetchUrlMetadataBasic(normalizedUrl, noteId, storeImages)
  
  // Ensure hostName and hostIcon are always set
  const hostName = basicMetadata.hostName || defaultHostname
  const hostIcon = basicMetadata.hostIcon || getFaviconUrl(hostName)
  
  // If we got title and description, return it
  if (basicMetadata.title && basicMetadata.description) {
    return {
      type: 'url',
      url: basicMetadata.url || normalizedUrl,
      hostName,
      hostIcon,
      title: basicMetadata.title,
      description: basicMetadata.description,
      headerImage: basicMetadata.headerImage,
    }
  }

  // Fallback to AI if title or description is missing
  const aiMetadata = await fetchUrlMetadataWithAI(normalizedUrl)
  
  // Ensure hostName and hostIcon are always set (use AI metadata if available)
  const finalHostName = aiMetadata.hostName || hostName || defaultHostname
  const finalHostIcon = basicMetadata.hostIcon || getFaviconUrl(finalHostName)
  
  return {
    type: 'url',
    url: aiMetadata.url || normalizedUrl,
    hostName: finalHostName,
    hostIcon: finalHostIcon,
    title: aiMetadata.title || basicMetadata.title,
    description: aiMetadata.description || basicMetadata.description,
    headerImage: basicMetadata.headerImage,
  }
}

/**
 * Fetch URL metadata with fallback (alias for consistency)
 */
export async function fetchUrlMetadataWithFallback(
  url: string,
  noteId?: string,
  storeImages: boolean = true
): Promise<UrlReference> {
  return fetchUrlMetadata(url, noteId, storeImages)
}

