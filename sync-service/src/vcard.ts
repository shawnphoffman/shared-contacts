/**
 * vCard parsing and generation utilities
 * Supports vCard 3.0 and 4.0 formats
 */

export interface VCardField {
	value: string
	type?: string // e.g., "CELL", "WORK", "HOME", "INTERNET"
}

export interface VCardData {
	uid?: string
	fn?: string // Full name
	n?: string // Name (structured: Family;Given;Additional;Prefix;Suffix)
	nickname?: string
	email?: string // Deprecated: use emails array
	tel?: string // Deprecated: use tels array
	emails?: VCardField[] // Multiple emails
	tels?: VCardField[] // Multiple phone numbers
	org?: string
	orgUnits?: string[]
	title?: string
	role?: string
	mailer?: string
	tz?: string
	geo?: string
	agent?: string
	prodid?: string
	rev?: string
	sortString?: string
	class?: string
	adr?: string // Deprecated: use addresses array
	addresses?: VCardField[] // Multiple addresses
	bday?: string // Birthday (YYYYMMDD or YYYY-MM-DD)
	url?: string // Deprecated: use urls array
	urls?: VCardField[] // Multiple URLs
	categories?: string[]
	labels?: VCardField[]
	logos?: VCardField[]
	sounds?: VCardField[]
	keys?: VCardField[]
	customFields?: Array<{ key: string; value: string; params?: string[] }>
	note?: string
	photo?: { data: string; type?: string }
	version?: string
}

/**
 * Parse a vCard string into structured data
 */
export function parseVCard(vcardString: string): VCardData {
	const lines = vcardString.split(/\r?\n/)
	const data: VCardData = {
		emails: [],
		tels: [],
		addresses: [],
		urls: [],
		labels: [],
		logos: [],
		sounds: [],
		keys: [],
		customFields: [],
	}

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

	// For backward compatibility, set single values from arrays
	if (data.emails && data.emails.length > 0 && !data.email) {
		data.email = data.emails[0].value
	}
	if (data.tels && data.tels.length > 0 && !data.tel) {
		data.tel = data.tels[0].value
	}
	if (data.addresses && data.addresses.length > 0 && !data.adr) {
		data.adr = data.addresses[0].value
	}
	if (data.url && data.urls && data.urls.length > 0 && !data.url) {
		data.url = data.urls[0].value
	}

	return data
}

function normalizeVCardTypes(types: string[]): string | undefined {
	const normalized = types
		.flatMap(type => type.split(','))
		.map(type => type.trim().replace(/^"|"$/g, ''))
		.filter(Boolean)
		.map(type => type.toUpperCase())

	if (normalized.length === 0) return undefined

	const unique = Array.from(new Set(normalized))
	return unique.join(',')
}

function normalizeVCardText(value: string): string {
	return value.replace(/\r\n|\r|\n/g, '\\n')
}

function unescapeVCardText(value: string): string {
	return value.replace(/\\n/g, '\n')
}

function parseVCardLine(line: string, data: VCardData): void {
	if (!line || line.startsWith('BEGIN:') || line.startsWith('END:')) {
		return
	}

	const colonIndex = line.indexOf(':')
	if (colonIndex === -1) return

	const key = line.substring(0, colonIndex).toUpperCase()
	const value = line.substring(colonIndex + 1)

	// Parse parameters (e.g., "TEL;TYPE=CELL;PREF=1" or "TEL;WORK;VOICE")
	const parts = key.split(';')
	const baseKey = parts[0]
	const typeParts: string[] = []
	for (let i = 1; i < parts.length; i++) {
		const param = parts[i].split('=')
		if (param.length === 2) {
			const paramKey = param[0].toLowerCase()
			const paramValue = param[1]
			if (paramKey === 'type') {
				typeParts.push(paramValue)
			}
		} else if (param.length === 1 && param[0]) {
			typeParts.push(param[0])
		}
	}

	// Extract type (case-insensitive, allow custom types)
	const type = normalizeVCardTypes(typeParts)

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
			if (!data.emails) data.emails = []
			data.emails.push({ value, type: type || 'INTERNET' })
			// Backward compatibility
			if (!data.email) {
				data.email = value
			}
			break
		case 'TEL':
			if (!data.tels) data.tels = []
			data.tels.push({ value, type: type || 'CELL' })
			// Backward compatibility
			if (!data.tel) {
				data.tel = value
			}
			break
		case 'ORG':
			if (value.includes(';')) {
				const parts = value.split(';')
				data.org = parts[0] || ''
				data.orgUnits = parts.slice(1).filter(Boolean)
			} else {
				data.org = value
			}
			break
		case 'TITLE':
			data.title = value
			break
		case 'ROLE':
			data.role = value
			break
		case 'MAILER':
			data.mailer = value
			break
		case 'TZ':
			data.tz = value
			break
		case 'GEO':
			data.geo = value
			break
		case 'AGENT':
			data.agent = unescapeVCardText(value)
			break
		case 'PRODID':
			data.prodid = value
			break
		case 'REV':
			data.rev = value
			break
		case 'SORT-STRING':
			data.sortString = value
			break
		case 'CLASS':
			data.class = value
			break
		case 'ADR':
			if (!data.addresses) data.addresses = []
			// vCard address format: ;;street;city;state;postal;country
			// For now, we'll store the full address string, but could parse it
			data.addresses.push({ value, type: type || 'HOME' })
			// Backward compatibility - extract street address (3rd component)
			if (!data.adr) {
				const adrParts = value.split(';')
				data.adr = adrParts[2] || value // Street address is 3rd component
			}
			break
		case 'BDAY':
			data.bday = value
			break
		case 'URL':
			if (!data.urls) data.urls = []
			data.urls.push({ value, type: type || 'HOME' })
			// Backward compatibility
			if (!data.url) {
				data.url = value
			}
			break
		case 'NOTE':
			data.note = unescapeVCardText(value)
			break
		case 'CATEGORIES':
			data.categories = value
				.split(',')
				.map(entry => entry.trim())
				.filter(Boolean)
			break
		case 'LABEL':
			if (!data.labels) data.labels = []
			data.labels.push({ value: unescapeVCardText(value), type })
			break
		case 'LOGO':
			if (!data.logos) data.logos = []
			data.logos.push({ value: unescapeVCardText(value), type })
			break
		case 'SOUND':
			if (!data.sounds) data.sounds = []
			data.sounds.push({ value: unescapeVCardText(value), type })
			break
		case 'KEY':
			if (!data.keys) data.keys = []
			data.keys.push({ value: unescapeVCardText(value), type })
			break
		case 'PHOTO':
			data.photo = {
				data: value,
				type,
			}
			break
		default:
			if (baseKey.startsWith('X-')) {
				if (!data.customFields) data.customFields = []
				const params = parts.slice(1)
				data.customFields.push({
					key: baseKey,
					value: unescapeVCardText(value),
					params: params.length > 0 ? params : undefined,
				})
			}
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
		name_prefix?: string | null
		name_suffix?: string | null
		nickname?: string | null
		maiden_name?: string | null
		email?: string | null
		phone?: string | null
		organization?: string | null
		org_units?: string[] | null
		job_title?: string | null
		role?: string | null
		address?: string | null
		address_street?: string | null
		address_extended?: string | null
		address_city?: string | null
		address_state?: string | null
		address_postal?: string | null
		address_country?: string | null
		birthday?: Date | string | null
		homepage?: string | null
		categories?: string[] | null
		labels?: Array<{ value: string; type?: string }> | null
		logos?: Array<{ value: string; type?: string }> | null
		sounds?: Array<{ value: string; type?: string }> | null
		keys?: Array<{ value: string; type?: string }> | null
		mailer?: string | null
		time_zone?: string | null
		geo?: string | null
		agent?: string | null
		prod_id?: string | null
		revision?: string | null
		sort_string?: string | null
		class?: string | null
		custom_fields?: Array<{ key: string; value: string; params?: string[] }> | null
		notes?: string | null
		photo_blob?: Buffer | null
		photo_mime?: string | null
		phones?: Array<{ value: string; type?: string }> | null
		emails?: Array<{ value: string; type?: string }> | null
		addresses?: Array<{ value: string; type?: string }> | null
		urls?: Array<{ value: string; type?: string }> | null
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
	const prefix = nameParts[3] || contact?.name_prefix || ''
	const suffix = nameParts[4] || contact?.name_suffix || ''

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

	// Photo (base64)
	const photoBase64 = getPhotoBase64(data, contact)
	if (photoBase64) {
		const type = getPhotoType(data, contact)
		const photoLine = `PHOTO;ENCODING=b;TYPE=${type}:${photoBase64}`
		lines.push(...foldVCardLine(photoLine))
	}

	// Emails - use arrays if available, fall back to single values
	const emails = contact?.emails || data.emails || []
	if (emails.length > 0) {
		for (const email of emails) {
			if (email.value) {
				const type = email.type || 'INTERNET'
				lines.push(`EMAIL;TYPE=${type}:${email.value}`)
			}
		}
	} else {
		// Backward compatibility: single email
		const email = data.email || contact?.email
		if (email) {
			lines.push(`EMAIL;TYPE=INTERNET:${email}`)
		}
	}

	// Phones - use arrays if available, fall back to single values
	const phones = contact?.phones || data.tels || []
	if (phones.length > 0) {
		for (const phone of phones) {
			if (phone.value) {
				const type = phone.type || 'CELL'
				lines.push(`TEL;TYPE=${type}:${phone.value}`)
			}
		}
	} else {
		// Backward compatibility: single phone
		const phone = data.tel || contact?.phone
		if (phone) {
			lines.push(`TEL;TYPE=CELL:${phone}`)
		}
	}

	// Organization
	const org = data.org || contact?.organization || ''
	const units = data.orgUnits || contact?.org_units || []
	if (org || units.length > 0) {
		const orgParts = [org, ...units.filter(Boolean)]
		lines.push(`ORG:${orgParts.join(';')}`)
	}

	// Job title
	const title = data.title || contact?.job_title
	if (title) {
		lines.push(`TITLE:${title}`)
	}
	const role = data.role || contact?.role
	if (role) {
		lines.push(`ROLE:${role}`)
	}
	const mailer = data.mailer || contact?.mailer
	if (mailer) {
		lines.push(`MAILER:${mailer}`)
	}
	const tz = data.tz || contact?.time_zone
	if (tz) {
		lines.push(`TZ:${tz}`)
	}
	const geo = data.geo || contact?.geo
	if (geo) {
		lines.push(`GEO:${geo}`)
	}
	const agent = data.agent || contact?.agent
	if (agent) {
		lines.push(...foldVCardLine(`AGENT:${normalizeVCardText(agent)}`))
	}
	const prodid = data.prodid || contact?.prod_id
	if (prodid) {
		lines.push(`PRODID:${prodid}`)
	}
	const rev = data.rev || contact?.revision
	if (rev) {
		lines.push(`REV:${rev}`)
	}
	const sortString = data.sortString || contact?.sort_string
	if (sortString) {
		lines.push(`SORT-STRING:${sortString}`)
	}
	const classValue = data.class || contact?.class
	if (classValue) {
		lines.push(`CLASS:${classValue}`)
	}

	const formatStructuredAddress = () => {
		const street = [contact?.address_street, contact?.address_extended].filter(Boolean).join(', ')
		const parts = [
			'',
			'',
			street,
			contact?.address_city || '',
			contact?.address_state || '',
			contact?.address_postal || '',
			contact?.address_country || '',
		]
		return parts.join(';')
	}

	const formatAddressValue = (value: string): string => {
		const trimmed = value.trim()
		if (!trimmed) return ''
		if (trimmed.includes(';')) {
			const parts = trimmed.split(';')
			const poBox = parts[0] || ''
			const extended = parts[1] || ''
			if (parts.length >= 8) {
				const street = [parts[2] || '', parts[3] || ''].filter(Boolean).join(', ')
				const city = parts[4] || ''
				const state = parts[5] || ''
				const postal = parts[6] || ''
				const country = parts[7] || ''
				return [poBox, '', street, city, state, postal, country].join(';')
			}
			if (parts.length >= 7) {
				const street = [parts[2] || '', extended].filter(Boolean).join(', ')
				const city = parts[3] || ''
				const state = parts[4] || ''
				const postal = parts[5] || ''
				const country = parts[6] || ''
				return [poBox, '', street, city, state, postal, country].join(';')
			}
			return `;;${trimmed};;;;`
		}
		return `;;${trimmed};;;;`
	}

	const hasStructuredAddress =
		contact?.address_street ||
		contact?.address_extended ||
		contact?.address_city ||
		contact?.address_state ||
		contact?.address_postal ||
		contact?.address_country

	// Addresses - use arrays if available, fall back to single values
	const addresses = contact?.addresses || data.addresses || []
	if (addresses.length > 0) {
		for (const address of addresses) {
			if (address.value) {
				const type = address.type || 'HOME'
				const formatted = formatAddressValue(address.value)
				if (formatted) {
					lines.push(`ADR;TYPE=${type}:${formatted}`)
				}
			}
		}
	} else if (hasStructuredAddress) {
		lines.push(`ADR;TYPE=HOME:${formatStructuredAddress()}`)
	} else {
		// Backward compatibility: single address
		const address = data.adr || contact?.address
		if (address) {
			const formatted = formatAddressValue(address)
			if (formatted) {
				lines.push(`ADR;TYPE=HOME:${formatted}`)
			}
		}
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

	// URLs - use arrays if available, fall back to single values
	const urls = contact?.urls || data.urls || []
	if (urls.length > 0) {
		for (const url of urls) {
			if (url.value) {
				const type = url.type || 'HOME'
				lines.push(`URL;TYPE=${type}:${url.value}`)
			}
		}
	} else {
		// Backward compatibility: single URL
		const homepage = data.url || contact?.homepage
		if (homepage) {
			lines.push(`URL:${homepage}`)
		}
	}

	// Notes (include maiden name if present)
	let note = data.note || contact?.notes || ''
	if (contact?.maiden_name) {
		const maidenNote = `Maiden name: ${contact.maiden_name}`
		note = note ? `${note}\n${maidenNote}` : maidenNote
	}
	if (note) {
		const normalizedNote = note.replace(/\r\n|\r|\n/g, '\\n')
		lines.push(...foldVCardLine(`NOTE:${normalizedNote}`))
	}

	const categories = data.categories || contact?.categories || []
	if (categories.length > 0) {
		const formatted = categories.map(entry => entry.trim()).filter(Boolean)
		if (formatted.length > 0) {
			lines.push(`CATEGORIES:${formatted.join(',')}`)
		}
	}

	const labels = contact?.labels || data.labels || []
	for (const label of labels) {
		if (label.value) {
			const type = label.type ? `;TYPE=${label.type}` : ''
			lines.push(...foldVCardLine(`LABEL${type}:${normalizeVCardText(label.value)}`))
		}
	}

	const logos = contact?.logos || data.logos || []
	for (const logo of logos) {
		if (logo.value) {
			const type = logo.type ? `;TYPE=${logo.type}` : ''
			lines.push(...foldVCardLine(`LOGO${type}:${normalizeVCardText(logo.value)}`))
		}
	}

	const sounds = contact?.sounds || data.sounds || []
	for (const sound of sounds) {
		if (sound.value) {
			const type = sound.type ? `;TYPE=${sound.type}` : ''
			lines.push(...foldVCardLine(`SOUND${type}:${normalizeVCardText(sound.value)}`))
		}
	}

	const keys = contact?.keys || data.keys || []
	for (const key of keys) {
		if (key.value) {
			const type = key.type ? `;TYPE=${key.type}` : ''
			lines.push(...foldVCardLine(`KEY${type}:${normalizeVCardText(key.value)}`))
		}
	}

	const customFields = data.customFields || contact?.custom_fields || []
	for (const customField of customFields) {
		if (!customField.key || !customField.value) continue
		const params = customField.params?.length ? `;${customField.params.join(';')}` : ''
		lines.push(...foldVCardLine(`${customField.key}${params}:${normalizeVCardText(customField.value)}`))
	}

	lines.push('END:VCARD')
	return lines.join('\r\n')
}

function foldVCardLine(line: string): string[] {
	const maxLength = 75
	const lines: string[] = []
	let remaining = line

	while (remaining.length > maxLength) {
		lines.push(remaining.slice(0, maxLength))
		remaining = ` ${remaining.slice(maxLength)}`
	}

	lines.push(remaining)
	return lines
}

function getPhotoBase64(data: VCardData, contact?: { photo_blob?: Buffer | null }): string | null {
	if (data.photo?.data) return data.photo.data
	if (contact?.photo_blob) {
		return contact.photo_blob.toString('base64')
	}
	return null
}

function getPhotoType(data: VCardData, contact?: { photo_mime?: string | null }): string {
	if (data.photo?.type) {
		return data.photo.type.toUpperCase()
	}
	const mime = contact?.photo_mime || 'image/jpeg'
	return mime.toLowerCase().includes('png') ? 'PNG' : 'JPEG'
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
