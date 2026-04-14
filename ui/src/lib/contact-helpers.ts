import crypto from 'node:crypto'
import { json } from '@tanstack/react-start'
import { getAddressBookBySlug } from './db'
import type { Contact } from './db'

const NodeBuffer = (globalThis as { Buffer?: any }).Buffer

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
	const mime = payload.photo_mime || (dataUrlMatch ? dataUrlMatch[1] : null)
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
	const hash = crypto.createHash('sha256').update(buffer).digest('hex')

	return {
		photo_blob: buffer,
		photo_mime: mime,
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
	return json(
		{
			error: 'Validation failed',
			issues: error.issues.map(i => ({ path: i.path.map(String).join('.'), message: i.message })),
		},
		{ status: 400 }
	)
}
