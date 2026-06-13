import { createFileRoute } from '@tanstack/react-router'
import { getContactById } from '../../lib/db'
import { logger } from '../../lib/logger'
import { ALLOWED_IMAGE_MIME } from '../../lib/contact-helpers'

const NodeBuffer = (globalThis as { Buffer?: any }).Buffer

function decodeHexBytea(value: string): Uint8Array | null {
	if (!NodeBuffer) return null
	const hex = value.startsWith('\\x') ? value.slice(2) : value
	return NodeBuffer.from(hex, 'hex')
}

function normalizePhotoBlob(blob: Uint8Array | string | null | undefined): Uint8Array | null {
	if (!blob) return null
	if (NodeBuffer && NodeBuffer.isBuffer?.(blob)) {
		return NodeBuffer.from(blob)
	}
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
				try {
					const contact = await getContactById(params.id)
					if (!contact || !contact.photo_blob) {
						return new Response('Not Found', { status: 404 })
					}

					const buffer = normalizePhotoBlob(contact.photo_blob)
					if (!buffer) {
						return new Response('Not Found', { status: 404 })
					}

					const arrayBuffer =
						buffer.buffer instanceof ArrayBuffer
							? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
							: Uint8Array.from(buffer).buffer
					// Only serve a stored MIME we trust. Anything else (including any
					// svg/html photo stored before the upload-time allowlist existed) is
					// served as a non-renderable download, and the extra headers stop the
					// browser sniffing or executing it. This neutralizes stored XSS.
					const safeType =
						contact.photo_mime && ALLOWED_IMAGE_MIME.has(contact.photo_mime) ? contact.photo_mime : 'application/octet-stream'
					return new Response(arrayBuffer, {
						headers: {
							'Content-Type': safeType,
							'Content-Disposition': 'inline',
							'X-Content-Type-Options': 'nosniff',
							'Content-Security-Policy': "default-src 'none'; sandbox",
							'Cache-Control': 'private, max-age=3600',
						},
					})
				} catch (error) {
					logger.error({ err: error }, 'Error fetching contact photo')
					return new Response('Internal Server Error', { status: 500 })
				}
			},
		},
	},
})
