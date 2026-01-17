import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { createContact, updateContact, findDuplicateContact, type Contact } from '../../lib/db'
import { generateVCard, extractUID } from '../../lib/vcard'
import { normalizePhoneNumber } from '../../lib/utils'

/**
 * Simple CSV parser that handles quoted fields
 */
function parseCSVLine(line: string): string[] {
	const values: string[] = []
	let current = ''
	let inQuotes = false

	for (let i = 0; i < line.length; i++) {
		const char = line[i]!

		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				// Escaped quote
				current += '"'
				i++ // Skip next quote
			} else {
				// Toggle quote state
				inQuotes = !inQuotes
			}
		} else if (char === ',' && !inQuotes) {
			// End of field
			values.push(current.trim())
			current = ''
		} else {
			current += char
		}
	}

	// Add last field
	values.push(current.trim())

	return values
}

const headerAliases: Record<string, string> = {
	// Name fields
	first: 'first',
	firstname: 'first',
	given: 'first',
	givenname: 'first',
	last: 'last',
	lastname: 'last',
	surname: 'last',
	familyname: 'last',
	family: 'last',
	fullname: 'full_name',
	name: 'full_name',
	displayname: 'full_name',
	middle: 'middle',
	middlename: 'middle',
	nickname: 'nick',
	nick: 'nick',
	maiden: 'maiden',
	maidenname: 'maiden',
	// Contact fields
	email: 'email',
	emailaddress: 'email',
	phone: 'phone',
	phonenumber: 'phone',
	mobile: 'phone',
	cell: 'phone',
	telephone: 'phone',
	tel: 'phone',
	// Organization fields
	organization: 'company',
	org: 'company',
	company: 'company',
	companyname: 'company',
	employer: 'company',
	jobtitle: 'job_title',
	title: 'job_title',
	position: 'job_title',
	role: 'job_title',
	// Other fields
	address: 'address',
	street: 'address',
	streetaddress: 'address',
	mailingaddress: 'address',
	notes: 'notes',
	note: 'notes',
	comment: 'notes',
	comments: 'notes',
	birthday: 'bday',
	bday: 'bday',
	dateofbirth: 'bday',
	dob: 'bday',
	homepage: 'homepage',
	website: 'homepage',
	url: 'homepage',
}

function normalizeHeader(header: string): string {
	return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function toCanonicalHeader(header: string): string | null {
	const normalized = normalizeHeader(header)
	return headerAliases[normalized] || null
}

function parseCSV(csvText: string): Array<Record<string, string>> {
	const lines = csvText
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
		.split('\n')
		.filter(line => line.trim())
	if (lines.length === 0) return []

	// Parse header
	const headers = parseCSVLine(lines[0]!).map(h => h.trim())
	const rows: Array<Record<string, string>> = []

	// Parse data rows
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i]!
		const values = parseCSVLine(line)
		const row: Record<string, string> = {}

		for (let j = 0; j < headers.length; j++) {
			const value = values[j] || ''
			const header = headers[j] || ''
			const canonical = toCanonicalHeader(header)
			if (!canonical) continue

			// Remove surrounding quotes if present
			const cleanValue = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value
			const trimmed = cleanValue.trim()

			if (!trimmed) continue
			if (!row[canonical]) {
				row[canonical] = trimmed
			}
		}

		rows.push(row)
	}

	return rows
}

/**
 * Map CSV row to Contact format
 */
function mapCSVRowToContact(row: Record<string, string>): Partial<Contact> {
	const first = row.first || ''
	const last = row.last || ''
	const fallbackFullName = `${first} ${last}`.trim()
	const fullName = row.full_name || fallbackFullName || 'Unnamed Contact'

	// Prefer phone, fallback to phone_home
	const phone = normalizePhoneNumber(row.phone || row.phone_home || null)

	// Prefer email, then email_work, then email_other
	const email = row.email || row.email_work || row.email_other || null

	// Parse birthday (format: YYYY-MM-DD)
	let birthday: Date | null = null
	if (row.bday) {
		const bdayDate = new Date(row.bday)
		if (!isNaN(bdayDate.getTime())) {
			birthday = bdayDate
		}
	}

	return {
		first_name: first || null,
		last_name: last || null,
		middle_name: row.middle || null,
		full_name: fullName,
		nickname: row.nick || null,
		maiden_name: row.maiden || null,
		email: email,
		phone: phone,
		organization: row.company || null,
		job_title: row.job_title || null,
		birthday: birthday,
		homepage: row.homepage || null,
		address: row.address || null,
		notes: row.notes || null,
	}
}

export const Route = createFileRoute('/api/contacts/import')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
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
							const contactData = mapCSVRowToContact(rows[i]!)

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
								await createContact({
									...contactData,
									vcard_id: vcardId,
									vcard_data: vcardData,
									sync_source: 'api',
									last_synced_to_radicale_at: null, // Force sync to Radicale
								})
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
					console.error('Error importing CSV:', error)
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
