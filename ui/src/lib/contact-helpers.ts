import crypto from 'node:crypto'
import { json } from '@tanstack/react-start'
import { logger } from './logger'
import { getAddressBookBySlug } from './db'
import type { Contact } from './db'

const NodeBuffer = (globalThis as { Buffer?: any }).Buffer

const MAX_PHOTO_BYTES = 10 * 1024 * 1024 // 10 MB

/** Canonical MIME types we accept for contact photos. */
export const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

/** Thrown when an uploaded photo is too large or is not an allowed raster image. */
export class BadPhotoError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'BadPhotoError'
	}
}

/**
 * Sniff the real image type from the leading bytes. Returns the canonical MIME
 * for supported raster formats, or null for anything else (e.g. SVG or HTML,
 * which must never be stored or served as an image; that enables stored XSS).
 */
function detectImageMime(buffer: Uint8Array): string | null {
	if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
	if (
		buffer.length >= 8 &&
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4e &&
		buffer[3] === 0x47 &&
		buffer[4] === 0x0d &&
		buffer[5] === 0x0a &&
		buffer[6] === 0x1a &&
		buffer[7] === 0x0a
	)
		return 'image/png'
	if (buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return 'image/gif'
	if (
		buffer.length >= 12 &&
		buffer[0] === 0x52 &&
		buffer[1] === 0x49 &&
		buffer[2] === 0x46 &&
		buffer[3] === 0x46 &&
		buffer[8] === 0x57 &&
		buffer[9] === 0x45 &&
		buffer[10] === 0x42 &&
		buffer[11] === 0x50
	)
		return 'image/webp'
	return null
}

type PhotoPayload = {
	photo_data?: string | null
	photo_mime?: string | null
	photo_width?: number | null
	photo_height?: number | null
	photo_remove?: boolean
}

export interface DecodedPhoto {
	photo_blob: Uint8Array | null
	photo_mime: string | null
	photo_width: number | null
	photo_height: number | null
	photo_hash: string | null
	photo_updated_at: Date | null
}

export interface DecodedPhotoWithFlag extends DecodedPhoto {
	hasPhotoUpdate: boolean
}

/** Strip the photo_blob binary from a contact before sending to the client. */
export function sanitizeContact(contact: Contact): Omit<Contact, 'photo_blob'> {
	const { photo_blob, ...rest } = contact
	return rest
}

/**
 * Resolve address book IDs — falls back to the default "shared-contacts" book
 * when none are provided.
 */
export async function resolveAddressBookIds(rawIds?: Array<string>): Promise<Array<string>> {
	if (Array.isArray(rawIds) && rawIds.length > 0) {
		return rawIds
	}
	const defaultBook = await getAddressBookBySlug('shared-contacts')
	return defaultBook ? [defaultBook.id] : []
}

/**
 * Decode a photo payload from a create-contact request body.
 * Returns decoded photo fields; `photo_updated_at` is set only when a photo
 * is present (so callers can distinguish "no photo sent" from "photo removed").
 */
export function decodePhotoPayload(payload: PhotoPayload): DecodedPhoto {
	if (payload.photo_remove) {
		return {
			photo_blob: null,
			photo_mime: null,
			photo_width: null,
			photo_height: null,
			photo_hash: null,
			photo_updated_at: new Date(),
		}
	}

	if (!payload.photo_data) {
		return {
			photo_blob: null,
			photo_mime: null,
			photo_width: null,
			photo_height: null,
			photo_hash: null,
			photo_updated_at: null,
		}
	}

	const dataUrlMatch = payload.photo_data.match(/^data:(.+);base64,(.*)$/)
	const base64Data = dataUrlMatch ? dataUrlMatch[2] : payload.photo_data
	if (!NodeBuffer) {
		return {
			photo_blob: null,
			photo_mime: null,
			photo_width: null,
			photo_height: null,
			photo_hash: null,
			photo_updated_at: null,
		}
	}

	const buffer = NodeBuffer.from(base64Data, 'base64')
	if (buffer.length > MAX_PHOTO_BYTES) {
		throw new BadPhotoError(`Photo exceeds the ${Math.floor(MAX_PHOTO_BYTES / (1024 * 1024))} MB limit`)
	}
	// Derive the MIME from the actual bytes, not the client-declared type, and
	// reject anything that is not a known raster image (blocks SVG/HTML XSS).
	const detectedMime = detectImageMime(buffer)
	if (!detectedMime) {
		throw new BadPhotoError('Photo must be a JPEG, PNG, GIF, or WebP image')
	}
	const hash = crypto.createHash('sha256').update(buffer).digest('hex')

	return {
		photo_blob: buffer,
		photo_mime: detectedMime,
		photo_width: payload.photo_width ?? null,
		photo_height: payload.photo_height ?? null,
		photo_hash: hash,
		photo_updated_at: new Date(),
	}
}

/**
 * Variant of decodePhotoPayload that includes a `hasPhotoUpdate` flag
 * (used by the update-contact endpoint to decide whether to overwrite existing photos).
 */
export function decodePhotoPayloadForUpdate(payload: PhotoPayload): DecodedPhotoWithFlag {
	if (payload.photo_remove) {
		return { ...decodePhotoPayload(payload), hasPhotoUpdate: true }
	}
	if (payload.photo_data) {
		return { ...decodePhotoPayload(payload), hasPhotoUpdate: true }
	}
	return { ...decodePhotoPayload(payload), hasPhotoUpdate: false }
}

/**
 * Catch a ZodError and return a 400 JSON response. Returns null if no error.
 * Usage:
 *   const parsed = MySchema.safeParse(data)
 *   if (!parsed.success) return zodError(parsed.error)
 */
export function zodError(error: { issues: Array<{ message: string; path: Array<PropertyKey> }> }) {
	// Log the detailed issues server-side, but return only a generic message to
	// the client so the request does not disclose the internal schema shape.
	logger.warn({ issues: error.issues.map(i => ({ path: i.path.map(String).join('.'), message: i.message })) }, 'Request validation failed')
	return json({ error: 'Validation failed' }, { status: 400 })
}
