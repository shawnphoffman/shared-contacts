import { createFileRoute } from '@tanstack/react-router'
import { getContactById } from '../../lib/db'

const NodeBuffer = (globalThis as { Buffer?: any }).Buffer

function decodeHexBytea(value: string): Uint8Array | null {
  if (!NodeBuffer) return null
  const hex = value.startsWith('\\x') ? value.slice(2) : value
  return NodeBuffer.from(hex, 'hex')
}

function normalizePhotoBlob(
  blob: Uint8Array | string | null | undefined,
): Uint8Array | null {
  if (!blob) return null
  if (NodeBuffer && NodeBuffer.isBuffer?.(blob)) return blob
  if (typeof blob === 'string') {
    // Postgres can return bytea as hex string (\\x...)
    if (blob.startsWith('\\x')) {
      return decodeHexBytea(blob)
    }
    // Fallback: assume base64
    return NodeBuffer ? NodeBuffer.from(blob, 'base64') : null
  }
  return NodeBuffer ? NodeBuffer.from(blob) : blob
}

export const Route = createFileRoute('/api/contacts/$id/photo')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const contact = await getContactById(params.id)
        if (!contact || !contact.photo_blob) {
          return new Response('Not Found', { status: 404 })
        }

        const buffer = normalizePhotoBlob(contact.photo_blob)
        if (!buffer) {
          return new Response('Not Found', { status: 404 })
        }

        return new Response(buffer, {
          headers: {
            'Content-Type': contact.photo_mime || 'image/jpeg',
            'Cache-Control': 'private, max-age=3600',
          },
        })
      },
    },
  },
})
