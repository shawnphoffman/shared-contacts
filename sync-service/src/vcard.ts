/**
 * vCard parsing and generation utilities
 * Supports vCard 3.0 and 4.0 formats
 */

export interface VCardData {
	uid?: string
	fn?: string // Full name
	n?: string // Name (structured: Family;Given;Additional;Prefix;Suffix)
	nickname?: string
	email?: string
	tel?: string
	org?: string
	title?: string
	adr?: string // Address
	bday?: string // Birthday (YYYYMMDD or YYYY-MM-DD)
	url?: string // Homepage/URL
	note?: string
	version?: string
}

/**
 * Parse a vCard string into structured data
 */
export function parseVCard(vcardString: string): VCardData {
	const lines = vcardString.split(/\r?\n/)
	const data: VCardData = {}

	let currentLine = ''
	for (const line of lines) {
		// Handle line folding (lines starting with space continue previous line)
		if (line.startsWith(' ') || line.startsWith('\t')) {
			currentLine += line.substring(1)
			continue
		}

		if (currentLine) {
			parseVCardLine(currentLine, data)
		}
		currentLine = line
	}
	if (currentLine) {
		parseVCardLine(currentLine, data)
	}

	return data
}

function parseVCardLine(line: string, data: VCardData): void {
	if (!line || line.startsWith('BEGIN:') || line.startsWith('END:')) {
		return
	}

	const colonIndex = line.indexOf(':')
	if (colonIndex === -1) return

	const key = line.substring(0, colonIndex).toUpperCase()
	const value = line.substring(colonIndex + 1)

	// Remove parameters from key (e.g., "TEL;TYPE=CELL:123" -> "TEL")
	const baseKey = key.split(';')[0]

	switch (baseKey) {
		case 'VERSION':
			data.version = value
			break
		case 'UID':
			data.uid = value
			break
		case 'FN':
			data.fn = value
			break
		case 'N':
			data.n = value
			break
		case 'NICKNAME':
			data.nickname = value
			break
		case 'EMAIL':
		case 'EMAIL;TYPE=INTERNET':
			if (!data.email) {
				data.email = value
			}
			break
		case 'TEL':
			if (!data.tel) {
				data.tel = value
			}
			break
		case 'ORG':
			data.org = value
			break
		case 'TITLE':
			data.title = value
			break
		case 'ADR':
			if (!data.adr) {
				data.adr = value
			}
			break
		case 'BDAY':
			data.bday = value
			break
		case 'URL':
			data.url = value
			break
		case 'NOTE':
			data.note = value
			break
	}
}

/**
 * Generate a vCard string from structured data
 */
export function generateVCard(
	data: VCardData,
	contact?: {
		full_name?: string | null
		first_name?: string | null
		last_name?: string | null
		middle_name?: string | null
		nickname?: string | null
		maiden_name?: string | null
		email?: string | null
		phone?: string | null
		organization?: string | null
		job_title?: string | null
		address?: string | null
		birthday?: Date | string | null
		homepage?: string | null
		notes?: string | null
	}
): string {
	const version = data.version || '3.0'
	const lines: string[] = ['BEGIN:VCARD', `VERSION:${version}`]

	// UID (required for vCard 4.0, recommended for 3.0)
	const uid = data.uid || generateUID()
	lines.push(`UID:${uid}`)

	// Full name (FN is required)
	const fullName = data.fn || contact?.full_name || 'Unknown'
	lines.push(`FN:${fullName}`)

	// Structured name (N)
	const nameParts = data.n ? data.n.split(';') : []
	const lastName = nameParts[0] || contact?.last_name || ''
	const firstName = nameParts[1] || contact?.first_name || ''
	const additional = nameParts[2] || contact?.middle_name || ''
	const prefix = nameParts[3] || ''
	const suffix = nameParts[4] || ''

	if (lastName || firstName || additional || prefix || suffix) {
		lines.push(`N:${lastName};${firstName};${additional};${prefix};${suffix}`)
	} else if (contact?.first_name || contact?.last_name) {
		lines.push(`N:${contact.last_name || ''};${contact.first_name || ''};${contact.middle_name || ''};;`)
	}

	// Nickname
	const nickname = data.nickname || contact?.nickname
	if (nickname) {
		lines.push(`NICKNAME:${nickname}`)
	}

	// Email
	const email = data.email || contact?.email
	if (email) {
		lines.push(`EMAIL;TYPE=INTERNET:${email}`)
	}

	// Phone
	const phone = data.tel || contact?.phone
	if (phone) {
		lines.push(`TEL;TYPE=CELL:${phone}`)
	}

	// Organization
	const org = data.org || contact?.organization
	if (org) {
		lines.push(`ORG:${org}`)
	}

	// Job title
	const title = data.title || contact?.job_title
	if (title) {
		lines.push(`TITLE:${title}`)
	}

	// Address
	const address = data.adr || contact?.address
	if (address) {
		// vCard address format: ;;street;city;state;postal;country
		lines.push(`ADR;TYPE=HOME:;;${address};;;;`)
	}

	// Birthday
	const birthday = data.bday || contact?.birthday
	if (birthday) {
		let bdayStr: string
		if (birthday instanceof Date) {
			const year = birthday.getFullYear()
			const month = String(birthday.getMonth() + 1).padStart(2, '0')
			const day = String(birthday.getDate()).padStart(2, '0')
			bdayStr = `${year}${month}${day}`
		} else if (typeof birthday === 'string') {
			// Handle string dates (YYYY-MM-DD format)
			bdayStr = birthday.replace(/-/g, '')
		} else {
			bdayStr = String(birthday)
		}
		lines.push(`BDAY:${bdayStr}`)
	}

	// Homepage/URL
	const homepage = data.url || contact?.homepage
	if (homepage) {
		lines.push(`URL:${homepage}`)
	}

	// Notes (include maiden name if present)
	let note = data.note || contact?.notes || ''
	if (contact?.maiden_name) {
		const maidenNote = `Maiden name: ${contact.maiden_name}`
		note = note ? `${note}\n${maidenNote}` : maidenNote
	}
	if (note) {
		lines.push(`NOTE:${note}`)
	}

	lines.push('END:VCARD')
	return lines.join('\r\n')
}

/**
 * Generate a unique ID for vCard
 */
function generateUID(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

/**
 * Extract structured name parts from vCard N field
 */
export function parseName(nField: string): {
	lastName: string
	firstName: string
	additional: string
	prefix: string
	suffix: string
} {
	const parts = nField.split(';')
	return {
		lastName: parts[0] || '',
		firstName: parts[1] || '',
		additional: parts[2] || '',
		prefix: parts[3] || '',
		suffix: parts[4] || '',
	}
}
