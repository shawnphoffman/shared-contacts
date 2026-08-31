import { normalizeBirthday } from './csv'
import { isSafeVCardId } from './vcard'
import type { Contact, ContactField } from './db'

/**
 * Read vCards into contact rows.
 *
 * The counterpart to generateVCard in vcard.ts: between them the app can read
 * back what it exports, which it could not before - import took CSV only while
 * export produced `.vcf`. Anything this does not model is preserved anyway,
 * because the card's own text is kept verbatim as vcard_data.
 *
 * vCard 3.0 and 4.0, which is what Contacts.app, Google Contacts and this app
 * emit. Deliberately not a general-purpose parser: no vCard 2.1
 * quoted-printable, no nested AGENT cards.
 */

const GROUP_KIND = 'group'
const INDIVIDUAL_KIND = 'individual'

export interface ParsedVCard {
	contact: Partial<Contact>
	/** The card verbatim, stored as vcard_data so nothing is lost in translation. */
	raw: string
	uid: string | null
	/** Base64 PHOTO payload, left for the caller to validate and decode. */
	photoData: string | null
}

/** Split on a separator, ignoring ones escaped with a backslash. */
function splitUnescaped(value: string, separator: string): Array<string> {
	const parts: Array<string> = []
	let current = ''
	for (let i = 0; i < value.length; i++) {
		const char = value[i]
		if (char === '\\' && i + 1 < value.length) {
			current += char + value[i + 1]
			i++
			continue
		}
		if (char === separator) {
			parts.push(current)
			current = ''
			continue
		}
		current += char
	}
	parts.push(current)
	return parts
}

function unescapeText(value: string): string {
	return value.replace(/\\([\\,;nN])/g, (_match, char: string) => (char === 'n' || char === 'N' ? '\n' : char))
}

/** Undo RFC 6350 line folding: a line starting with space or tab continues the previous one. */
function unfold(text: string): Array<string> {
	const lines = text.replace(/\r\n?/g, '\n').split('\n')
	const unfolded: Array<string> = []
	for (const line of lines) {
		if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
			unfolded[unfolded.length - 1] += line.slice(1)
			continue
		}
		unfolded.push(line)
	}
	return unfolded
}

interface VCardLine {
	name: string
	params: Array<{ key: string; value: string }>
	value: string
}

function parseLine(line: string): VCardLine | null {
	// The value can hold colons (a URL, say), so the split is at the first colon
	// outside a quoted parameter.
	let colon = -1
	let inQuotes = false
	for (let i = 0; i < line.length; i++) {
		if (line[i] === '"') inQuotes = !inQuotes
		else if (line[i] === ':' && !inQuotes) {
			colon = i
			break
		}
	}
	if (colon === -1) return null

	const head = line.slice(0, colon)
	const value = line.slice(colon + 1)
	const segments = splitUnescaped(head, ';')
	// Property names can carry a group prefix, e.g. `item1.EMAIL`.
	const rawName = segments[0]
	const name = rawName.slice(rawName.indexOf('.') + 1).toUpperCase()

	const params = segments.slice(1).map(segment => {
		const equals = segment.indexOf('=')
		// A bare parameter is vCard 2.1 shorthand for a TYPE, e.g. `TEL;CELL:`.
		if (equals === -1) return { key: 'TYPE', value: segment.replace(/^"|"$/g, '') }
		return { key: segment.slice(0, equals).toUpperCase(), value: segment.slice(equals + 1).replace(/^"|"$/g, '') }
	})

	return { name, params, value }
}

function typeOf(line: VCardLine): string | undefined {
	const types = line.params
		.filter(param => param.key === 'TYPE')
		.flatMap(param => param.value.split(','))
		.map(type => type.trim().toUpperCase())
		.filter(type => type !== '' && type !== 'PREF')
	return types.length > 0 ? Array.from(new Set(types)).join(',') : undefined
}

function push(list: Array<ContactField>, line: VCardLine, value: string): void {
	if (!value) return
	list.push({ value, ...(typeOf(line) ? { type: typeOf(line) } : {}) })
}

/** Split a card into its BEGIN:VCARD / END:VCARD blocks. */
export function splitVCards(text: string): Array<string> {
	const cards: Array<string> = []
	let current: Array<string> | null = null
	for (const line of unfold(text)) {
		const upper = line.trim().toUpperCase()
		if (upper === 'BEGIN:VCARD') {
			current = [line.trim()]
			continue
		}
		if (current === null) continue
		current.push(line)
		if (upper === 'END:VCARD') {
			cards.push(current.join('\r\n'))
			current = null
		}
	}
	return cards
}

export function parseVCard(card: string): ParsedVCard {
	const contact: Partial<Contact> = {}
	const emails: Array<ContactField> = []
	const phones: Array<ContactField> = []
	const addresses: Array<ContactField> = []
	const urls: Array<ContactField> = []
	const members: Array<string> = []
	let uid: string | null = null
	let photoData: string | null = null
	let firstAdrParts: Array<string> | null = null

	for (const rawLine of unfold(card)) {
		const line = parseLine(rawLine.trim())
		if (!line || line.name === 'BEGIN' || line.name === 'END') continue
		const value = unescapeText(line.value).trim()

		switch (line.name) {
			case 'UID':
				uid = value
				break
			case 'FN':
				contact.full_name = value || null
				break
			case 'N': {
				const [family, given, additional, prefix, suffix] = splitUnescaped(line.value, ';').map(part => unescapeText(part).trim())
				contact.last_name = family || null
				contact.first_name = given || null
				contact.middle_name = additional || null
				contact.name_prefix = prefix || null
				contact.name_suffix = suffix || null
				break
			}
			case 'NICKNAME':
				contact.nickname = value || null
				break
			case 'EMAIL':
				push(emails, line, value)
				break
			case 'TEL':
				push(phones, line, value)
				break
			case 'ADR': {
				// ADR is PO box; extended; street; locality; region; postal; country.
				const parts = splitUnescaped(line.value, ';').map(part => unescapeText(part).trim())
				const formatted = [parts[2], parts[3], parts[4], parts[5], parts[6]].filter(Boolean).join(', ')
				push(addresses, line, formatted)
				if (!firstAdrParts && formatted) firstAdrParts = parts
				break
			}
			case 'URL':
				push(urls, line, value)
				break
			case 'ORG': {
				const units = splitUnescaped(line.value, ';').map(part => unescapeText(part).trim())
				contact.organization = units[0] || null
				const rest = units.slice(1).filter(Boolean)
				contact.org_units = rest.length > 0 ? rest : null
				break
			}
			case 'TITLE':
				contact.job_title = value || null
				break
			case 'ROLE':
				contact.role = value || null
				break
			case 'BDAY':
				contact.birthday = normalizeBirthday(value)
				break
			case 'NOTE':
				contact.notes = value || null
				break
			case 'CATEGORIES': {
				const categories = splitUnescaped(line.value, ',')
					.map(part => unescapeText(part).trim())
					.filter(Boolean)
				contact.categories = categories.length > 0 ? categories : null
				break
			}
			case 'PHOTO':
				// Only inline base64 is imported; a PHOTO that is a URL is left
				// alone rather than fetched.
				if (!/^https?:/i.test(value)) photoData = value.replace(/\s+/g, '')
				break
			case 'KIND':
			case 'X-ADDRESSBOOKSERVER-KIND':
				contact.kind = value.toLowerCase() === GROUP_KIND ? GROUP_KIND : INDIVIDUAL_KIND
				break
			case 'MEMBER':
			case 'X-ADDRESSBOOKSERVER-MEMBER':
				if (value) members.push(value)
				break
			default:
				break
		}
	}

	if (emails.length > 0) {
		contact.emails = emails
		contact.email = emails[0].value
	}
	if (phones.length > 0) {
		contact.phones = phones
		contact.phone = phones[0].value
	}
	if (addresses.length > 0) {
		contact.addresses = addresses
		contact.address = addresses[0].value
	}
	if (urls.length > 0) {
		contact.urls = urls
		contact.homepage = urls[0].value
	}
	if (firstAdrParts) {
		contact.address_street = firstAdrParts[2] || null
		contact.address_city = firstAdrParts[3] || null
		contact.address_state = firstAdrParts[4] || null
		contact.address_postal = firstAdrParts[5] || null
		contact.address_country = firstAdrParts[6] || null
	}
	if (members.length > 0) {
		contact.group_members = members
	}
	// A card with no FN still needs a name to show up as anything in the UI.
	if (!contact.full_name) {
		const assembled = [contact.first_name, contact.middle_name, contact.last_name].filter(Boolean).join(' ').trim()
		contact.full_name = assembled || contact.email || contact.phone || null
	}

	return { contact, raw: card, uid: isSafeVCardId(uid) ? uid : null, photoData }
}

export function parseVCards(text: string): Array<ParsedVCard> {
	return splitVCards(text).map(parseVCard)
}
