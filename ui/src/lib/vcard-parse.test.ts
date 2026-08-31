import { describe, expect, it } from 'vitest'
import { generateVCard } from './vcard'
import { parseVCard, parseVCards, splitVCards } from './vcard-parse'

const APPLE_CARD = [
	'BEGIN:VCARD',
	'VERSION:3.0',
	'N:Hoffman;Shawn;Patrick;Dr.;Jr.',
	'FN:Shawn Hoffman',
	'NICKNAME:Shawnie',
	'ORG:Anthropic;Engineering',
	'TITLE:Engineer',
	'item1.EMAIL;type=INTERNET;type=HOME;type=pref:shawn@example.com',
	'EMAIL;TYPE=WORK:work@example.com',
	'TEL;type=CELL;type=VOICE;type=pref:+1 555 555 0123',
	'ADR;TYPE=HOME:;;123 Main St;Springfield;IL;62704;USA',
	'URL;TYPE=HOME:https://example.com/~shawn',
	'BDAY:1985-04-12',
	'CATEGORIES:Family,Friends',
	'NOTE:Two lines\\nof note',
	'UID:shawn-uid-1',
	'END:VCARD',
].join('\r\n')

describe('splitVCards', () => {
	it('separates the cards in a multi-card file', () => {
		const file = `${APPLE_CARD}\r\n${APPLE_CARD.replace('shawn-uid-1', 'shawn-uid-2')}`
		expect(splitVCards(file)).toHaveLength(2)
	})

	it('ignores anything outside a card', () => {
		expect(splitVCards('junk before\r\n' + APPLE_CARD + '\r\njunk after')).toHaveLength(1)
	})

	it('returns nothing for a file with no cards', () => {
		expect(splitVCards('full_name,email\r\nShawn,shawn@example.com')).toEqual([])
	})
})

describe('parseVCard', () => {
	const { contact, uid, photoData } = parseVCard(APPLE_CARD)

	it('reads the structured name', () => {
		expect(contact.full_name).toBe('Shawn Hoffman')
		expect(contact.last_name).toBe('Hoffman')
		expect(contact.first_name).toBe('Shawn')
		expect(contact.middle_name).toBe('Patrick')
		expect(contact.name_prefix).toBe('Dr.')
		expect(contact.name_suffix).toBe('Jr.')
		expect(contact.nickname).toBe('Shawnie')
	})

	it('keeps every email and phone, not just the first', () => {
		expect(contact.emails).toEqual([
			{ value: 'shawn@example.com', type: 'INTERNET,HOME' },
			{ value: 'work@example.com', type: 'WORK' },
		])
		expect(contact.email).toBe('shawn@example.com')
		expect(contact.phones).toEqual([{ value: '+1 555 555 0123', type: 'CELL,VOICE' }])
	})

	it('strips the item group prefix Contacts.app writes', () => {
		// `item1.EMAIL` is the same property as `EMAIL`.
		expect(contact.emails?.[0].value).toBe('shawn@example.com')
	})

	it('formats the address and keeps its parts', () => {
		expect(contact.address).toBe('123 Main St, Springfield, IL, 62704, USA')
		expect(contact.address_street).toBe('123 Main St')
		expect(contact.address_city).toBe('Springfield')
		expect(contact.address_state).toBe('IL')
		expect(contact.address_postal).toBe('62704')
		expect(contact.address_country).toBe('USA')
	})

	it('reads organization, title, birthday, categories and notes', () => {
		expect(contact.organization).toBe('Anthropic')
		expect(contact.org_units).toEqual(['Engineering'])
		expect(contact.job_title).toBe('Engineer')
		expect(contact.birthday).toBe('1985-04-12')
		expect(contact.categories).toEqual(['Family', 'Friends'])
		expect(contact.notes).toBe('Two lines\nof note')
	})

	it('keeps the card verbatim and takes its UID', () => {
		expect(uid).toBe('shawn-uid-1')
		expect(photoData).toBeNull()
	})

	it('unfolds a long line rather than truncating it', () => {
		const note = 'x'.repeat(200)
		const folded = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Folded', `NOTE:${note.slice(0, 60)}`, ` ${note.slice(60)}`, 'END:VCARD'].join('\r\n')
		expect(parseVCard(folded).contact.notes).toBe(note)
	})

	it('does not cut a value at a colon inside it', () => {
		const card = ['BEGIN:VCARD', 'FN:Test', 'URL:https://example.com:8443/path', 'END:VCARD'].join('\r\n')
		expect(parseVCard(card).contact.homepage).toBe('https://example.com:8443/path')
	})

	it('unescapes commas and semicolons in a value', () => {
		const card = ['BEGIN:VCARD', 'FN:Test', 'NOTE:Comma\\, semicolon\\; done', 'END:VCARD'].join('\r\n')
		expect(parseVCard(card).contact.notes).toBe('Comma, semicolon; done')
	})

	it('falls back to a name when the card has no FN', () => {
		const card = ['BEGIN:VCARD', 'N:Hoffman;Shawn;;;', 'END:VCARD'].join('\r\n')
		expect(parseVCard(card).contact.full_name).toBe('Shawn Hoffman')
	})

	it('rejects a UID that could steer a path, rather than storing it', () => {
		const card = ['BEGIN:VCARD', 'FN:Test', 'UID:../../escape', 'END:VCARD'].join('\r\n')
		expect(parseVCard(card).uid).toBeNull()
	})

	it('takes an inline photo but not a linked one', () => {
		const inline = ['BEGIN:VCARD', 'FN:Test', 'PHOTO;ENCODING=b;TYPE=PNG:aGVsbG8=', 'END:VCARD'].join('\r\n')
		expect(parseVCard(inline).photoData).toBe('aGVsbG8=')

		const linked = ['BEGIN:VCARD', 'FN:Test', 'PHOTO;VALUE=URI:https://example.com/face.png', 'END:VCARD'].join('\r\n')
		expect(parseVCard(linked).photoData).toBeNull()
	})

	it('recognizes a group card in both spellings', () => {
		const apple = ['BEGIN:VCARD', 'FN:Family', 'X-ADDRESSBOOKSERVER-KIND:group', 'X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:abc', 'END:VCARD']
		expect(parseVCard(apple.join('\r\n')).contact.kind).toBe('group')
		expect(parseVCard(apple.join('\r\n')).contact.group_members).toEqual(['urn:uuid:abc'])

		const v4 = ['BEGIN:VCARD', 'FN:Family', 'KIND:group', 'MEMBER:urn:uuid:abc', 'END:VCARD'].join('\r\n')
		expect(parseVCard(v4).contact.kind).toBe('group')
	})
})

describe('round-tripping this app’s own export', () => {
	it('reads back everything generateVCard writes', () => {
		// The gap this closes: export produced .vcf and import took CSV only, so
		// the app could not read its own output.
		const original = {
			vcard_id: 'round-trip-uid',
			full_name: 'Madison Hoffman',
			first_name: 'Madison',
			last_name: 'Hoffman',
			middle_name: 'Rae',
			nickname: 'Maddie',
			organization: 'Anthropic',
			job_title: 'Engineer',
			birthday: '1990-12-25',
			notes: 'Likes commas, semicolons; and newlines\nlike this',
			emails: [{ value: 'maddie@example.com', type: 'HOME' }],
			phones: [{ value: '+15555550199', type: 'CELL' }],
			urls: [{ value: 'https://example.com/maddie', type: 'HOME' }],
			addresses: null,
		}

		const { contact, uid } = parseVCard(generateVCard(original))

		expect(uid).toBe('round-trip-uid')
		expect(contact.full_name).toBe(original.full_name)
		expect(contact.first_name).toBe(original.first_name)
		expect(contact.last_name).toBe(original.last_name)
		expect(contact.middle_name).toBe(original.middle_name)
		expect(contact.nickname).toBe(original.nickname)
		expect(contact.organization).toBe(original.organization)
		expect(contact.job_title).toBe(original.job_title)
		expect(contact.birthday).toBe(original.birthday)
		expect(contact.notes).toBe(original.notes)
		expect(contact.email).toBe('maddie@example.com')
		expect(contact.phone).toBe('+15555550199')
		expect(contact.homepage).toBe('https://example.com/maddie')
	})
})

describe('parseVCards', () => {
	it('parses every card in the file', () => {
		const file = `${APPLE_CARD}\r\n${APPLE_CARD.replace('shawn-uid-1', 'shawn-uid-2').replace('Shawn Hoffman', 'Other Person')}`
		const parsed = parseVCards(file)
		expect(parsed.map(entry => entry.uid)).toEqual(['shawn-uid-1', 'shawn-uid-2'])
		expect(parsed[1].contact.full_name).toBe('Other Person')
	})
})
