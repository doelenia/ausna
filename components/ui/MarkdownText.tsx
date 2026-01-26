'use client'

import { UIText, Content } from './Typography'

/**
 * Simple markdown renderer for form labels
 * Supports: **bold**, *italic*, line breaks, paragraphs
 * Uses UIText styling by default, only applies markdown formatting when specified
 */
export function MarkdownText({ children }: { children: string }) {
  if (!children) return null

  // Check if text contains any markdown formatting
  const hasMarkdown = /\*\*.*\*\*|\*[^*\n].*\*|\n\n/.test(children)

  // If no markdown, just return plain UIText
  if (!hasMarkdown) {
    return <UIText>{children}</UIText>
  }

  // First, handle bold (**text**) - do this before italic to avoid conflicts
  let html = children.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
  
  // Then handle italic (*text*) - but not if it's part of **
  html = html.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>')
  
  // Split by double newlines for paragraphs, preserve single newlines as line breaks
  const paragraphs = html.split(/\n\n+/)
  
  html = paragraphs
    .map((paragraph) => {
      // Convert single newlines within paragraphs to <br>
      const withBreaks = paragraph.split(/\n/).join('<br/>')
      return `<span>${withBreaks}</span>`
    })
    .join('')

  return (
    <span
      dangerouslySetInnerHTML={{ __html: html }}
      className="text-sm font-normal text-gray-700 leading-none [&_strong]:font-semibold [&_em]:italic [&_br]:block"
    />
  )
}

/**
 * Markdown renderer for content paragraphs
 * Uses UIText styling by default, applies markdown formatting when specified
 */
export function MarkdownContent({ children, className = '' }: { children: string; className?: string }) {
  if (!children) return null

  // Check if text contains any markdown formatting
  const hasMarkdown = /\*\*.*\*\*|\*[^*\n].*\*|\n\n/.test(children)

  // If no markdown, just return plain UIText
  if (!hasMarkdown) {
    return <UIText className={className}>{children}</UIText>
  }

  // First, handle bold (**text**) - do this before italic to avoid conflicts
  let html = children.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
  
  // Then handle italic (*text*) - but not if it's part of **
  html = html.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>')
  
  // Split by double newlines for paragraphs, preserve single newlines as line breaks
  const paragraphs = html.split(/\n\n+/)
  
  html = paragraphs
    .map((paragraph, index) => {
      // Convert single newlines within paragraphs to <br>
      const withBreaks = paragraph.split(/\n/).join('<br/>')
      // Add margin-bottom to all paragraphs except the last one
      const marginClass = index < paragraphs.length - 1 ? 'mb-4' : ''
      return `<p class="${marginClass}">${withBreaks}</p>`
    })
    .join('')

  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      className={`text-sm font-normal text-gray-700 leading-none [&_strong]:font-semibold [&_em]:italic [&_p]:leading-normal [&_br]:leading-normal ${className}`}
    />
  )
}

