import { openai } from '@/lib/openai/client'

/**
 * Extract description of an image using ChatGPT vision API
 * @param imageUrl - URL of the image to describe
 * @param noteText - The note text that provides context for what information is needed from the image
 */
export async function describeImage(imageUrl: string, noteText?: string): Promise<string> {
  try {
    // Build prompt based on whether we have note context
    let promptText: string
    if (noteText && noteText.trim().length > 0) {
      promptText = `Describe the content of this image in detail, focusing on information relevant to the following note context: "${noteText}"

Extract information from the image that is relevant to the note's topic, purpose, or what the user is looking for. Focus on:
- Elements that relate to the note's context or purpose
- Any text, objects, people, scenes, or concepts that are relevant
- Details that would help understand how the image relates to the note

Be concise but comprehensive, prioritizing information that connects to the note's context.`
    } else {
      promptText = `Describe the content of this image in detail. Focus on what is visible, any text, objects, people, scenes, or concepts shown. Be concise but comprehensive.`
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: promptText,
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 300,
      temperature: 0.3,
    })

    const description = response.choices[0]?.message?.content
    return description || 'Image description unavailable'
  } catch (error) {
    console.error('Failed to describe image:', error)
    return 'Image description unavailable'
  }
}

