import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { createContact, findDuplicateContact, getAddressBookBySlug, setContactAddressBooks, updateContact } from '../../lib/db'
import { extractUID, generateVCard } from '../../lib/vcard'
import { mapCSVRowToContact, parseCSV } from '../../lib/csv'
import type { Contact } from '../../lib/db'

export const Route = createFileRoute('/api/contacts/import')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const defaultBook = await getAddressBookBySlug('shared-contacts')
					const formData = await request.formData()
					const file = formData.get('file') as File | null

					if (!file) {
						return json({ error: 'No file provided' }, { status: 400 })
					}

					if (!file.name.endsWith('.csv')) {
						return json({ error: 'File must be a CSV' }, { status: 400 })
					}

					// Read file content
					const csvText = await file.text()
					const rows = parseCSV(csvText)

					if (rows.length === 0) {
						return json({ error: 'CSV file is empty' }, { status: 400 })
					}

					const results = {
						success: 0,
						updated: 0,
						skipped: 0,
						failed: 0,
						errors: [] as Array<{ row: number; error: string }>,
					}

					// Process each row
					for (let i = 0; i < rows.length; i++) {
						try {
							const contactData = mapCSVRowToContact(rows[i])

							// Skip if no meaningful data
							if (!contactData.full_name && !contactData.email && !contactData.phone) {
								results.skipped++
								continue
							}

							// Check for existing duplicate
							const existing = await findDuplicateContact(
								contactData.full_name || null,
								contactData.email || null,
								contactData.phone || null
							)

							// Generate vCard data
							const vcardData = generateVCard(contactData)
							const vcardId = extractUID(vcardData) || undefined

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
									// Always update vCard
									vcard_id: vcardId,
									vcard_data: vcardData,
								}

								await updateContact(existing.id, {
									...mergedData,
									sync_source: 'api',
									last_synced_to_radicale_at: null, // Force sync to Radicale
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
								results.success++
							}
						} catch (error) {
							results.failed++
							results.errors.push({
								row: i + 2, // +2 because row 1 is header, and we're 0-indexed
								error: error instanceof Error ? error.message : 'Unknown error',
							})
						}
					}

					return json({
						message: `Imported ${results.success} new contacts, updated ${results.updated} existing contacts${results.skipped > 0 ? `, skipped ${results.skipped} empty rows` : ''}${results.failed > 0 ? `, ${results.failed} failed` : ''}`,
						...results,
					})
				} catch (error) {
					logger.error({ err: error }, 'Error importing CSV')
					return json(
						{
							error: 'Failed to import CSV',
							details: error instanceof Error ? error.message : 'Unknown error',
						},
						{ status: 500 }
					)
				}
			},
		},
	},
})
