import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { deleteContact, getContactById, setContactAddressBooks, updateContact } from '../../lib/db'
import { extractUID, generateVCard } from '../../lib/vcard'
import { normalizePhoneNumber } from '../../lib/utils'
import { sanitizeContact, resolveAddressBookIds, decodePhotoPayloadForUpdate, zodError } from '../../lib/contact-helpers'
import { UpdateContactSchema } from '../../lib/schemas'
import type { Contact } from '../../lib/db'

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
					logger.error({ err: error }, 'Error fetching contact')
					return json({ error: 'Failed to fetch contact' }, { status: 500 })
				}
			},
			PUT: async ({ params, request }) => {
				try {
					const body = await request.json()
					const parsed = UpdateContactSchema.safeParse(body)
					if (!parsed.success) return zodError(parsed.error)
					const photoFields = decodePhotoPayloadForUpdate(parsed.data)
					const hasAddressBookIds = Array.isArray(parsed.data.address_book_ids)
					const addressBookIds = hasAddressBookIds ? await resolveAddressBookIds(parsed.data.address_book_ids) : []
					const normalizedPhones = Array.isArray(parsed.data.phones)
						? parsed.data.phones.map((phone: { value?: string }) => ({
								...phone,
								value: normalizePhoneNumber(phone.value) ?? '',
							}))
						: parsed.data.phones

					const contactData: Partial<Contact> = {
						full_name: parsed.data.full_name,
						first_name: parsed.data.first_name,
						last_name: parsed.data.last_name,
						middle_name: parsed.data.middle_name,
						name_prefix: parsed.data.name_prefix,
						name_suffix: parsed.data.name_suffix,
						nickname: parsed.data.nickname,
						maiden_name: parsed.data.maiden_name,
						email: parsed.data.email,
						phone: normalizePhoneNumber(parsed.data.phone),
						phones: normalizedPhones,
						emails: parsed.data.emails,
						organization: parsed.data.organization,
						org_units: parsed.data.org_units,
						job_title: parsed.data.job_title,
						role: parsed.data.role,
						address: parsed.data.address,
						addresses: parsed.data.addresses,
						address_street: parsed.data.address_street,
						address_city: parsed.data.address_city,
						address_state: parsed.data.address_state,
						address_postal: parsed.data.address_postal,
						address_country: parsed.data.address_country,
						birthday: parsed.data.birthday ? new Date(parsed.data.birthday) : null,
						homepage: parsed.data.homepage,
						urls: parsed.data.urls,
						categories: parsed.data.categories,
						labels: parsed.data.labels,
						logos: parsed.data.logos,
						sounds: parsed.data.sounds,
						keys: parsed.data.keys,
						mailer: parsed.data.mailer,
						time_zone: parsed.data.time_zone,
						geo: parsed.data.geo,
						agent: parsed.data.agent,
						prod_id: parsed.data.prod_id,
						revision: parsed.data.revision,
						sort_string: parsed.data.sort_string,
						class: parsed.data.class,
						custom_fields: parsed.data.custom_fields,
						notes: parsed.data.notes,
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
					logger.error({ err: error }, 'Error updating contact')
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
					logger.error({ err: error }, 'Error deleting contact')
					return json({ error: 'Failed to delete contact' }, { status: 500 })
				}
			},
		},
	},
})
