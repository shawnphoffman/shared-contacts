import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import {
	createContact,
	findDuplicateContact,
	getAddressBookBySlug,
	getContactByVcardId,
	setContactAddressBooks,
	updateContact,
} from '../../lib/db'
import { extractUID, generateVCard } from '../../lib/vcard'
import { parseVCards } from '../../lib/vcard-parse'
import { mapCSVRowToContact, parseCSV } from '../../lib/csv'
import { actorFromRequest, recordHistory } from '../../lib/history'
import { BadPhotoError, decodePhotoPayload } from '../../lib/contact-helpers'
import type { Contact } from '../../lib/db'

/**
 * One row of an import, whatever the file format was.
 *
 * A vCard carries two things a CSV row cannot: its own UID, which identifies
 * the contact far better than name-and-email matching, and the card text
 * itself, which is kept verbatim so properties this app does not model survive
 * a round trip.
 */
interface ImportEntry {
	contact: Partial<Contact>
	/** 1-based position in the file, for error reporting. */
	position: number
	vcardId?: string
	vcardData?: string
}

export const Route = createFileRoute('/api/contacts/import')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const meta = actorFromRequest(request)
				try {
					const defaultBook = await getAddressBookBySlug('shared-contacts')
					const formData = await request.formData()
					const file = formData.get('file') as File | null

					if (!file) {
						return json({ error: 'No file provided' }, { status: 400 })
					}

					const name = file.name.toLowerCase()
					const isVCard = name.endsWith('.vcf') || name.endsWith('.vcard')
					if (!name.endsWith('.csv') && !isVCard) {
						return json({ error: 'File must be a CSV or vCard (.vcf)' }, { status: 400 })
					}

					const text = await file.text()
					const entries: Array<ImportEntry> = []

					if (isVCard) {
						for (const [index, card] of parseVCards(text).entries()) {
							const contact: Partial<Contact> = { ...card.contact }
							if (card.photoData) {
								try {
									Object.assign(contact, decodePhotoPayload({ photo_data: card.photoData }))
								} catch (error) {
									// An unreadable photo is not a reason to drop the contact.
									if (!(error instanceof BadPhotoError)) throw error
									logger.warn({ err: error }, 'Skipping the photo on an imported vCard')
								}
							}
							entries.push({
								contact,
								position: index + 1,
								vcardId: card.uid ?? undefined,
								vcardData: card.raw,
							})
						}
					} else {
						for (const [index, row] of parseCSV(text).entries()) {
							// +2: row 1 is the header, and the index is 0-based.
							entries.push({ contact: mapCSVRowToContact(row), position: index + 2 })
						}
					}

					if (entries.length === 0) {
						return json({ error: isVCard ? 'No vCards found in the file' : 'CSV file is empty' }, { status: 400 })
					}

					const results = {
						success: 0,
						updated: 0,
						skipped: 0,
						failed: 0,
						errors: [] as Array<{ row: number; error: string }>,
					}

					const sourceLabel = isVCard ? 'vCard' : 'CSV'

					for (const entry of entries) {
						try {
							const contactData = entry.contact

							// Skip if no meaningful data
							if (!contactData.full_name && !contactData.email && !contactData.phone) {
								results.skipped++
								continue
							}

							// A vCard brings its own identity. Matching on that first means
							// re-importing this app's own export updates the contacts it
							// came from instead of duplicating them; name-and-email matching
							// is the fallback, and all a CSV row has.
							const existing =
								(entry.vcardId ? await getContactByVcardId(entry.vcardId) : null) ||
								(await findDuplicateContact(contactData.full_name || null, contactData.email || null, contactData.phone || null))

							// Keep the card as it arrived; regenerate only for CSV rows,
							// which have no card of their own.
							const vcardData = entry.vcardData ?? generateVCard(contactData)
							const vcardId = entry.vcardId ?? extractUID(vcardData) ?? undefined

							if (existing) {
								// Merge with existing contact - prefer new non-null values
								const mergedData: Partial<Contact> = {
									// Keep existing ID and timestamps
									id: existing.id,
									created_at: existing.created_at,
									// Merge fields - prefer new non-null values
									full_name: contactData.full_name || existing.full_name,
									first_name: contactData.first_name || existing.first_name,
									last_name: contactData.last_name || existing.last_name,
									middle_name: contactData.middle_name || existing.middle_name,
									nickname: contactData.nickname || existing.nickname,
									maiden_name: contactData.maiden_name || existing.maiden_name,
									email: contactData.email || existing.email,
									phone: contactData.phone || existing.phone,
									organization: contactData.organization || existing.organization,
									job_title: contactData.job_title || existing.job_title,
									address: contactData.address || existing.address,
									birthday: contactData.birthday || existing.birthday,
									homepage: contactData.homepage || existing.homepage,
									notes: contactData.notes || existing.notes,
									// Fields a CSV row cannot carry, so they only move when the
									// import actually supplied them.
									phones: contactData.phones ?? existing.phones,
									emails: contactData.emails ?? existing.emails,
									addresses: contactData.addresses ?? existing.addresses,
									urls: contactData.urls ?? existing.urls,
									categories: contactData.categories ?? existing.categories,
									org_units: contactData.org_units ?? existing.org_units,
									role: contactData.role || existing.role,
									name_prefix: contactData.name_prefix || existing.name_prefix,
									name_suffix: contactData.name_suffix || existing.name_suffix,
									// Always update vCard
									vcard_id: vcardId,
									vcard_data: vcardData,
								}

								const updated = await updateContact(existing.id, {
									...mergedData,
									sync_source: 'api',
									last_synced_to_radicale_at: null, // Force sync to Radicale
								})
								await recordHistory({
									contactId: existing.id,
									operation: 'update',
									source: 'import',
									actor: meta.actor,
									actorType: meta.actorType,
									userAgent: meta.userAgent,
									clientIp: meta.clientIp,
									summary: `Updated from ${sourceLabel} import: ${updated.full_name || updated.email || 'contact'}`,
									previousState: existing,
									newState: updated,
									metadata: { source: sourceLabel, position: entry.position },
								})
								results.updated++
							} else {
								// Create new contact
								const created = await createContact({
									...contactData,
									vcard_id: vcardId,
									vcard_data: vcardData,
									sync_source: 'api',
									last_synced_to_radicale_at: null, // Force sync to Radicale
								})
								if (defaultBook) {
									await setContactAddressBooks(created.id, [defaultBook.id])
								}
								await recordHistory({
									contactId: created.id,
									operation: 'create',
									source: 'import',
									actor: meta.actor,
									actorType: meta.actorType,
									userAgent: meta.userAgent,
									clientIp: meta.clientIp,
									summary: `Imported from ${sourceLabel}: ${created.full_name || created.email || 'contact'}`,
									newState: created,
									metadata: { source: sourceLabel, position: entry.position },
								})
								results.success++
							}
						} catch (error) {
							results.failed++
							results.errors.push({
								row: entry.position,
								error: error instanceof Error ? error.message : 'Unknown error',
							})
						}
					}

					return json({
						message: `Imported ${results.success} new contacts, updated ${results.updated} existing contacts${results.skipped > 0 ? `, skipped ${results.skipped} empty ${isVCard ? 'cards' : 'rows'}` : ''}${results.failed > 0 ? `, ${results.failed} failed` : ''}`,
						...results,
					})
				} catch (error) {
					logger.error({ err: error }, 'Error importing contacts')
					return json(
						{
							error: 'Failed to import contacts',
							details: error instanceof Error ? error.message : 'Unknown error',
						},
						{ status: 500 }
					)
				}
			},
		},
	},
})
