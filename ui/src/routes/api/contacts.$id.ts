import crypto from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { deleteContact, getAddressBookBySlug, getContactById, setContactAddressBooks, updateContact } from '../../lib/db'
import { extractUID, generateVCard } from '../../lib/vcard'
import { normalizePhoneNumber } from '../../lib/utils'
import type { Contact } from '../../lib/db'

const NodeBuffer = (globalThis as { Buffer?: any }).Buffer

type PhotoPayload = {
	photo_data?: string
	photo_mime?: string
	photo_width?: number
	photo_height?: number
	photo_remove?: boolean
}

function sanitizeContact(contact: Contact): Omit<Contact, 'photo_blob'> {
	const { photo_blob, ...rest } = contact
	return rest
}

async function resolveAddressBookIds(rawIds?: Array<string>): Promise<Array<string>> {
	if (Array.isArray(rawIds) && rawIds.length > 0) {
		return rawIds
	}
	const defaultBook = await getAddressBookBySlug('shared-contacts')
	return defaultBook ? [defaultBook.id] : []
}

function decodePhotoPayload(payload: PhotoPayload): {
	photo_blob: Uint8Array | null
	photo_mime: string | null
	photo_width: number | null
	photo_height: number | null
	photo_hash: string | null
	photo_updated_at: Date | null
	hasPhotoUpdate: boolean
} {
	if (payload.photo_remove) {
		return {
			photo_blob: null,
			photo_mime: null,
			photo_width: null,
			photo_height: null,
			photo_hash: null,
			photo_updated_at: new Date(),
			hasPhotoUpdate: true,
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
			hasPhotoUpdate: false,
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
			hasPhotoUpdate: false,
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
		hasPhotoUpdate: true,
	}
}

export const Route = createFileRoute('/api/contacts/$id')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const contact = await getContactById(params.id)
					if (!contact) {
						return json({ error: 'Contact not found' }, { status: 404 })
					}
					return json(sanitizeContact(contact))
				} catch (error) {
					console.error('Error fetching contact:', error)
					return json({ error: 'Failed to fetch contact' }, { status: 500 })
				}
			},
			PUT: async ({ params, request }) => {
				try {
					const body = await request.json()
					const photoPayload = body as PhotoPayload
					const photoFields = decodePhotoPayload(photoPayload)
					const hasAddressBookIds = Array.isArray(body.address_book_ids)
					const addressBookIds = hasAddressBookIds ? await resolveAddressBookIds(body.address_book_ids) : []
					const normalizedPhones = Array.isArray(body.phones)
						? body.phones.map((phone: { value?: string }) => ({
								...phone,
								value: normalizePhoneNumber(phone.value) ?? '',
							}))
						: body.phones

					const contactData: Partial<Contact> = {
						full_name: body.full_name,
						first_name: body.first_name,
						last_name: body.last_name,
						middle_name: body.middle_name,
						name_prefix: body.name_prefix,
						name_suffix: body.name_suffix,
						nickname: body.nickname,
						maiden_name: body.maiden_name,
						email: body.email,
						phone: normalizePhoneNumber(body.phone),
						phones: normalizedPhones,
						emails: body.emails,
						organization: body.organization,
						org_units: body.org_units,
						job_title: body.job_title,
						role: body.role,
						address: body.address,
						addresses: body.addresses,
						address_street: body.address_street,
						address_city: body.address_city,
						address_state: body.address_state,
						address_postal: body.address_postal,
						address_country: body.address_country,
						birthday: body.birthday ? new Date(body.birthday) : null,
						homepage: body.homepage,
						urls: body.urls,
						categories: body.categories,
						labels: body.labels,
						logos: body.logos,
						sounds: body.sounds,
						keys: body.keys,
						mailer: body.mailer,
						time_zone: body.time_zone,
						geo: body.geo,
						agent: body.agent,
						prod_id: body.prod_id,
						revision: body.revision,
						sort_string: body.sort_string,
						class: body.class,
						custom_fields: body.custom_fields,
						notes: body.notes,
						...(photoFields.hasPhotoUpdate
							? {
									photo_blob: photoFields.photo_blob,
									photo_mime: photoFields.photo_mime,
									photo_width: photoFields.photo_width,
									photo_height: photoFields.photo_height,
									photo_hash: photoFields.photo_hash,
									photo_updated_at: photoFields.photo_updated_at,
								}
							: {}),
					}

					// Generate vCard data
					const existingContact = await getContactById(params.id)
					if (!existingContact) {
						return json({ error: 'Contact not found' }, { status: 404 })
					}

					const vcardData = generateVCard({
						...existingContact,
						...contactData,
						phones: contactData.phones || existingContact.phones,
						emails: contactData.emails || existingContact.emails,
						addresses: contactData.addresses || existingContact.addresses,
						urls: contactData.urls || existingContact.urls,
						photo_blob: photoFields.hasPhotoUpdate ? photoFields.photo_blob : existingContact.photo_blob,
						photo_mime: photoFields.hasPhotoUpdate ? photoFields.photo_mime : existingContact.photo_mime,
					})
					const vcardId = extractUID(vcardData) || existingContact.vcard_id

					const contact = await updateContact(params.id, {
						...contactData,
						vcard_id: vcardId,
						vcard_data: vcardData,
						sync_source: 'api',
						last_synced_to_radicale_at: null, // Force sync to Radicale
					})

					if (hasAddressBookIds) {
						await setContactAddressBooks(params.id, addressBookIds)
					}
					const contactWithBooks = await getContactById(params.id)
					return json(sanitizeContact(contactWithBooks || contact))
				} catch (error) {
					console.error('Error updating contact:', error)
					return json({ error: 'Failed to update contact' }, { status: 500 })
				}
			},
			DELETE: async ({ params }) => {
				try {
					const contact = await getContactById(params.id)
					if (!contact) {
						return json({ error: 'Contact not found' }, { status: 404 })
					}

					// Delete from database
					await deleteContact(params.id)

					// Note: The sync service will handle deleting the vCard file from Radicale
					// on the next sync cycle (every 5 seconds). For immediate deletion,
					// you could trigger a sync here, but the periodic sync should handle it.

					return json({ message: 'Contact deleted' })
				} catch (error) {
					console.error('Error deleting contact:', error)
					return json({ error: 'Failed to delete contact' }, { status: 500 })
				}
			},
		},
	},
})
