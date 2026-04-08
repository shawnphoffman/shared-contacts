import { describe, it, expect } from 'vitest'
import type { Contact } from './db'
import {
	normalizeEmail,
	normalizePhone,
	emailsMatch,
	phonesMatch,
	normalizeName,
	namesMatch,
	namesFuzzyMatch,
	getContactEmails,
	getContactPhones,
	mergeContacts,
	detectDuplicates,
} from './merge'

/** Factory helper – returns a minimal valid Contact with overrides. */
function makeContact(overrides: Partial<Contact> = {}): Contact {
	return {
		id: crypto.randomUUID(),
		vcard_id: null,
		full_name: null,
		first_name: null,
		last_name: null,
		middle_name: null,
		name_prefix: null,
		name_suffix: null,
		nickname: null,
		maiden_name: null,
		email: null,
		phone: null,
		phones: null,
		emails: null,
		organization: null,
		org_units: null,
		job_title: null,
		role: null,
		address: null,
		addresses: null,
		address_street: null,
		address_extended: null,
		address_city: null,
		address_state: null,
		address_postal: null,
		address_country: null,
		birthday: null,
		homepage: null,
		urls: null,
		categories: null,
		labels: null,
		logos: null,
		sounds: null,
		keys: null,
		mailer: null,
		time_zone: null,
		geo: null,
		agent: null,
		prod_id: null,
		revision: null,
		sort_string: null,
		class: null,
		custom_fields: null,
		notes: null,
		photo_blob: null,
		photo_mime: null,
		photo_width: null,
		photo_height: null,
		photo_updated_at: null,
		photo_hash: null,
		vcard_data: null,
		created_at: new Date('2024-01-01'),
		updated_at: new Date('2024-01-01'),
		last_synced_from_radicale_at: null,
		last_synced_to_radicale_at: null,
		vcard_hash: null,
		sync_source: null,
		radicale_file_mtime: null,
		...overrides,
	}
}

// ---------------------------------------------------------------------------
// normalizeEmail
// ---------------------------------------------------------------------------
describe('normalizeEmail', () => {
	it('returns null for null/empty input', () => {
		expect(normalizeEmail(null)).toBeNull()
		expect(normalizeEmail('')).toBeNull()
	})

	it('lowercases and trims', () => {
		expect(normalizeEmail('  Alice@Example.COM  ')).toBe('alice@example.com')
	})
})

// ---------------------------------------------------------------------------
// normalizePhone
// ---------------------------------------------------------------------------
describe('normalizePhone', () => {
	it('returns null for null/empty input', () => {
		expect(normalizePhone(null)).toBeNull()
		expect(normalizePhone('')).toBeNull()
		expect(normalizePhone('---')).toBeNull()
	})

	it('strips non-digit characters', () => {
		expect(normalizePhone('(555) 123-4567')).toBe('5551234567')
	})

	it('removes leading 1 from 11-digit US numbers', () => {
		expect(normalizePhone('+1 (555) 123-4567')).toBe('5551234567')
		expect(normalizePhone('15551234567')).toBe('5551234567')
	})

	it('keeps non-US numbers unchanged', () => {
		expect(normalizePhone('+44 20 7946 0958')).toBe('442079460958')
	})
})

// ---------------------------------------------------------------------------
// emailsMatch / phonesMatch
// ---------------------------------------------------------------------------
describe('emailsMatch', () => {
	it('matches case-insensitively', () => {
		expect(emailsMatch('a@b.com', 'A@B.COM')).toBe(true)
	})

	it('returns false when either is null', () => {
		expect(emailsMatch(null, 'a@b.com')).toBe(false)
		expect(emailsMatch('a@b.com', null)).toBe(false)
	})
})

describe('phonesMatch', () => {
	it('matches after normalization', () => {
		expect(phonesMatch('(555) 123-4567', '+15551234567')).toBe(true)
	})

	it('returns false when either is null', () => {
		expect(phonesMatch(null, '555')).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// normalizeName / namesMatch
// ---------------------------------------------------------------------------
describe('normalizeName', () => {
	it('returns null for null/empty', () => {
		expect(normalizeName(null)).toBeNull()
	})

	it('lowercases, trims, collapses spaces, removes punctuation', () => {
		expect(normalizeName('  John  Q.  Smith, Jr.  ')).toBe('john q smith jr')
	})
})

describe('namesMatch', () => {
	it('matches after normalization', () => {
		expect(namesMatch('John Smith', 'john smith')).toBe(true)
	})

	it('returns false for different names', () => {
		expect(namesMatch('John Smith', 'Jane Doe')).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// namesFuzzyMatch
// ---------------------------------------------------------------------------
describe('namesFuzzyMatch', () => {
	it('matches exact after normalization', () => {
		expect(namesFuzzyMatch('John Smith', 'JOHN SMITH')).toBe(true)
	})

	it('matches common name variations', () => {
		expect(namesFuzzyMatch('Robert Smith', 'Bob Smith')).toBe(true)
		expect(namesFuzzyMatch('William Jones', 'Bill Jones')).toBe(true)
		expect(namesFuzzyMatch('Elizabeth Taylor', 'Liz Taylor')).toBe(true)
	})

	it('matches when middle initial is added/removed', () => {
		expect(namesFuzzyMatch('John Smith', 'John A Smith')).toBe(true)
	})

	it('returns false for null inputs', () => {
		expect(namesFuzzyMatch(null, 'John')).toBe(false)
		expect(namesFuzzyMatch('John', null)).toBe(false)
	})

	it('returns false for clearly different names', () => {
		expect(namesFuzzyMatch('Alice Johnson', 'Bob Williams')).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// getContactEmails / getContactPhones
// ---------------------------------------------------------------------------
describe('getContactEmails', () => {
	it('returns empty array when no emails', () => {
		expect(getContactEmails(makeContact())).toEqual([])
	})

	it('includes single email field', () => {
		expect(getContactEmails(makeContact({ email: 'a@b.com' }))).toEqual(['a@b.com'])
	})

	it('includes emails from array', () => {
		const contact = makeContact({
			emails: [{ value: 'x@y.com', type: 'work' }, { value: 'z@w.com' }],
		})
		expect(getContactEmails(contact)).toEqual(['x@y.com', 'z@w.com'])
	})

	it('combines single and array emails', () => {
		const contact = makeContact({
			email: 'a@b.com',
			emails: [{ value: 'x@y.com' }],
		})
		expect(getContactEmails(contact)).toEqual(['a@b.com', 'x@y.com'])
	})
})

describe('getContactPhones', () => {
	it('returns empty array when no phones', () => {
		expect(getContactPhones(makeContact())).toEqual([])
	})

	it('includes single phone field', () => {
		expect(getContactPhones(makeContact({ phone: '555-1234' }))).toEqual(['555-1234'])
	})

	it('includes phones from array', () => {
		const contact = makeContact({
			phones: [{ value: '111-2222' }, { value: '333-4444' }],
		})
		expect(getContactPhones(contact)).toEqual(['111-2222', '333-4444'])
	})
})

// ---------------------------------------------------------------------------
// mergeContacts
// ---------------------------------------------------------------------------
describe('mergeContacts', () => {
	it('throws on empty array', () => {
		expect(() => mergeContacts([])).toThrow('Cannot merge empty contact list')
	})

	it('returns the single contact when given one', () => {
		const c = makeContact({ full_name: 'Solo' })
		expect(mergeContacts([c])).toBe(c)
	})

	it('uses oldest contact as primary', () => {
		const older = makeContact({ id: 'old', full_name: 'Old', created_at: new Date('2020-01-01') })
		const newer = makeContact({ id: 'new', full_name: 'New', created_at: new Date('2024-01-01') })
		const result = mergeContacts([newer, older])
		expect(result.id).toBe('old')
		expect(result.full_name).toBe('Old')
	})

	it('prefers primary fields but falls back to others', () => {
		const primary = makeContact({ created_at: new Date('2020-01-01'), organization: null })
		const secondary = makeContact({ created_at: new Date('2024-01-01'), organization: 'Acme' })
		const result = mergeContacts([primary, secondary])
		expect(result.organization).toBe('Acme')
	})

	it('deduplicates emails across contacts', () => {
		const c1 = makeContact({ email: 'A@B.com', created_at: new Date('2020-01-01') })
		const c2 = makeContact({ email: 'a@b.com', created_at: new Date('2024-01-01') })
		const result = mergeContacts([c1, c2])
		// Only one email should survive (the first encountered)
		expect(result.email).toBe('A@B.com')
	})

	it('deduplicates phones across contacts', () => {
		const c1 = makeContact({ phone: '(555) 123-4567', created_at: new Date('2020-01-01') })
		const c2 = makeContact({ phone: '+15551234567', created_at: new Date('2024-01-01') })
		const result = mergeContacts([c1, c2])
		expect(result.phone).toBe('(555) 123-4567')
	})

	it('combines notes from all contacts', () => {
		const c1 = makeContact({ full_name: 'Alice', notes: 'Note A', created_at: new Date('2020-01-01') })
		const c2 = makeContact({ full_name: 'Alice 2', notes: 'Note B', created_at: new Date('2024-01-01') })
		const result = mergeContacts([c1, c2])
		expect(result.notes).toContain('Note A')
		expect(result.notes).toContain('Note B')
		expect(result.notes).toContain('Merged from contact')
	})
})

// ---------------------------------------------------------------------------
// detectDuplicates
// ---------------------------------------------------------------------------
describe('detectDuplicates', () => {
	it('returns empty for no contacts', () => {
		expect(detectDuplicates([])).toEqual([])
	})

	it('returns empty when no duplicates', () => {
		const contacts = [
			makeContact({ email: 'a@b.com', full_name: 'Alice' }),
			makeContact({ email: 'c@d.com', full_name: 'Bob' }),
		]
		expect(detectDuplicates(contacts)).toEqual([])
	})

	it('groups contacts by matching email', () => {
		const contacts = [
			makeContact({ email: 'same@test.com', full_name: 'Contact 1' }),
			makeContact({ email: 'SAME@TEST.COM', full_name: 'Contact 2' }),
		]
		const groups = detectDuplicates(contacts)
		expect(groups).toHaveLength(1)
		expect(groups[0].matchType).toBe('email')
		expect(groups[0].contacts).toHaveLength(2)
	})

	it('groups contacts by matching phone', () => {
		const contacts = [
			makeContact({ phone: '(555) 123-4567', full_name: 'Phone 1' }),
			makeContact({ phone: '+15551234567', full_name: 'Phone 2' }),
		]
		const groups = detectDuplicates(contacts)
		expect(groups).toHaveLength(1)
		expect(groups[0].matchType).toBe('phone')
	})

	it('groups contacts by exact name', () => {
		const contacts = [
			makeContact({ full_name: 'John Smith' }),
			makeContact({ full_name: 'john smith' }),
		]
		const groups = detectDuplicates(contacts)
		expect(groups).toHaveLength(1)
		expect(groups[0].matchType).toBe('name')
	})

	it('groups contacts by fuzzy name match', () => {
		const contacts = [
			makeContact({ full_name: 'Robert Smith' }),
			makeContact({ full_name: 'Bob Smith' }),
		]
		const groups = detectDuplicates(contacts)
		expect(groups).toHaveLength(1)
		expect(groups[0].matchType).toBe('fuzzy_name')
	})

	it('does not double-group contacts already matched by email', () => {
		const contacts = [
			makeContact({ email: 'same@test.com', full_name: 'John Smith' }),
			makeContact({ email: 'same@test.com', full_name: 'john smith' }),
		]
		const groups = detectDuplicates(contacts)
		// Should only appear in the email group, not also in the name group
		expect(groups).toHaveLength(1)
		expect(groups[0].matchType).toBe('email')
	})
})
