import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { createContact, getAllContacts, getAllContactsPaginated, getContactById, setContactAddressBooks } from '../../lib/db'
import { extractUID, generateVCard } from '../../lib/vcard'
import { normalizePhoneNumber } from '../../lib/utils'
import { decodePhotoPayload, resolveAddressBookIds, sanitizeContact, zodError } from '../../lib/contact-helpers'
import { CreateContactSchema } from '../../lib/schemas'
import type { Contact } from '../../lib/db'

export const Route = createFileRoute('/api/contacts')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url)
					const limitParam = url.searchParams.get('limit')
					const offsetParam = url.searchParams.get('offset')

					// If pagination params are present, return paginated envelope
					if (limitParam !== null || offsetParam !== null) {
						const result = await getAllContactsPaginated({
							limit: limitParam ? parseInt(limitParam, 10) : undefined,
							offset: offsetParam ? parseInt(offsetParam, 10) : undefined,
						})
						return json({
							data: result.data.map(sanitizeContact),
							total: result.total,
							limit: result.limit,
							offset: result.offset,
						})
					}

					// Default: return flat array for backward compatibility
					const contacts = await getAllContacts()
					return json(contacts.map(sanitizeContact))
				} catch (error) {
					logger.error({ err: error }, 'Error fetching contacts')
					return json({ error: 'Failed to fetch contacts' }, { status: 500 })
				}
			},
			POST: async ({ request }) => {
				try {
					const body = await request.json()
					const parsed = CreateContactSchema.safeParse(body)
					if (!parsed.success) return zodError(parsed.error)
					const photoFields = decodePhotoPayload(parsed.data)
					const addressBookIds = await resolveAddressBookIds(parsed.data.address_book_ids)

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
						...(photoFields.photo_updated_at
							? photoFields
							: {
									photo_blob: undefined,
									photo_mime: undefined,
									photo_width: undefined,
									photo_height: undefined,
									photo_hash: undefined,
									photo_updated_at: undefined,
								}),
					}

					// Generate vCard data
					const vcardData = generateVCard(contactData)
					const vcardId = extractUID(vcardData) || undefined

					const contact = await createContact({
						...contactData,
						vcard_id: vcardId,
						vcard_data: vcardData,
						sync_source: 'api',
						last_synced_to_radicale_at: null, // Force sync to Radicale
					})

					if (addressBookIds.length > 0) {
						await setContactAddressBooks(contact.id, addressBookIds)
					}
					const contactWithBooks = await getContactById(contact.id)
					return json(sanitizeContact(contactWithBooks || contact), { status: 201 })
				} catch (error) {
					logger.error({ err: error }, 'Error creating contact')
					return json({ error: 'Failed to create contact' }, { status: 500 })
				}
			},
		},
	},
})
