import { normalizePhoneNumber } from './utils'
import type { Contact } from './db'

/**
 * Simple CSV parser that handles quoted fields
 */
export function parseCSVLine(line: string): Array<string> {
	const values: Array<string> = []
	let current = ''
	let inQuotes = false

	for (let i = 0; i < line.length; i++) {
		const char = line[i]

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

export const headerAliases: Record<string, string> = {
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

export function normalizeHeader(header: string): string {
	return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function toCanonicalHeader(header: string): string | null {
	const normalized = normalizeHeader(header)
	return headerAliases[normalized] || null
}

export function parseCSV(csvText: string): Array<Record<string, string>> {
	const lines = csvText
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
		.split('\n')
		.filter(line => line.trim())
	if (lines.length === 0) return []

	// Parse header
	const headers = parseCSVLine(lines[0]).map(h => h.trim())
	const rows: Array<Record<string, string>> = []

	// Parse data rows
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i]
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
export function mapCSVRowToContact(row: Record<string, string>): Partial<Contact> {
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

// --- Export functions ---

export const CSV_COLUMNS = [
	'first_name',
	'last_name',
	'full_name',
	'email',
	'phone',
	'organization',
	'job_title',
	'address',
	'notes',
	'birthday',
	'homepage',
	'nickname',
	'middle_name',
	'maiden_name',
] as const

export function escapeCsvField(value: string | null | undefined): string {
	if (value == null || value === '') return ''
	const str = String(value)
	if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
		return `"${str.replace(/"/g, '""')}"`
	}
	return str
}

export function contactsToCsv(contacts: Array<Contact>): string {
	const header = CSV_COLUMNS.join(',')
	const rows = contacts.map(contact => CSV_COLUMNS.map(col => escapeCsvField(contact[col as keyof Contact] as string)).join(','))
	return [header, ...rows].join('\r\n')
}
