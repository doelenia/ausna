import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'
import type { Note, NoteReference, UrlReference } from '@/types/note'

export const runtime = 'edge'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

function normalizeNoteText(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function excerpt(text: string, maxLen: number): string {
  const t = normalizeNoteText(text)
  if (!t) return ''
  if (t.length <= maxLen) return t
  return `${t.slice(0, Math.max(0, maxLen - 3)).trimEnd()}...`
}

function firstOfType<T extends NoteReference['type']>(
  refs: NoteReference[],
  type: T
): Extract<NoteReference, { type: T }> | null {
  for (const r of refs || []) {
    if (r && r.type === type) return r as any
  }
  return null
}

function LinkIcon() {
  return (
    <svg
      width="220"
      height="220"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10.5 13.5L13.5 10.5"
        stroke="#111827"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.8 15.2L7.4 16.6C5.8 18.2 3.2 18.2 1.6 16.6C0 15 0 12.4 1.6 10.8L3 9.4C4.6 7.8 7.2 7.8 8.8 9.4"
        stroke="#111827"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(5.2 0)"
      />
      <path
        d="M15.2 8.8L16.6 7.4C18.2 5.8 18.2 3.2 16.6 1.6C15 0 12.4 0 10.8 1.6L9.4 3"
        stroke="#111827"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(0 5.2)"
      />
    </svg>
  )
}

export default async function Image({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()

  const { data: noteRow } = await supabase
    .from('notes')
    .select('id, owner_account_id, text, references, metadata, mentioned_note_id, parent_note_id, deleted_at')
    .eq('id', params.id)
    .single()

  const note = noteRow as unknown as Note | null

  if (!note || note.deleted_at) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: '#F9FAFB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#111827',
            fontSize: 42,
            fontWeight: 700,
          }}
        >
          Note
        </div>
      ),
      size
    )
  }

  const references = Array.isArray(note.references) ? (note.references as NoteReference[]) : []
  const imageRef = firstOfType(references, 'image')
  const urlRef = firstOfType(references, 'url') as UrlReference | null

  if (imageRef?.url) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: '#000000',
            display: 'flex',
          }}
        >
          <img
            src={imageRef.url}
            alt="Cover"
            width={1200}
            height={630}
            style={{ width: 1200, height: 630, objectFit: 'cover' }}
          />
        </div>
      ),
      size
    )
  }

  if (urlRef?.url) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: '#F9FAFB',
            padding: 72,
            display: 'flex',
            flexDirection: 'row',
            gap: 56,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: 360,
              height: 360,
              borderRadius: 72,
              background: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow:
                '0 20px 25px -5px rgba(0,0,0,0.10), 0 10px 10px -5px rgba(0,0,0,0.04)',
              border: '1px solid #E5E7EB',
            }}
          >
            <LinkIcon />
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 48,
                fontWeight: 800,
                color: '#111827',
                letterSpacing: -1,
                lineHeight: 1.1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {(urlRef.title || urlRef.hostName || 'Link').toString()}
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 500,
                color: '#374151',
                lineHeight: 1.3,
                display: 'block',
                overflow: 'hidden',
                maxHeight: 30 * 5 * 1.3,
              }}
            >
              {urlRef.description || urlRef.url}
            </div>
          </div>
        </div>
      ),
      size
    )
  }

  const content = excerpt(note.text || '', 220)
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#F9FAFB',
          padding: 72,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 48,
            background: '#FFFFFF',
            border: '1px solid #E5E7EB',
            boxShadow:
              '0 20px 25px -5px rgba(0,0,0,0.10), 0 10px 10px -5px rgba(0,0,0,0.04)',
            padding: 64,
            display: 'flex',
            alignItems: 'center',
            color: '#111827',
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1.25,
          }}
        >
          {content || 'Note'}
        </div>
      </div>
    ),
    size
  )
}

