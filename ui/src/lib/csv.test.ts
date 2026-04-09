import { describe, it, expect } from 'vitest'
import {
	parseCSVLine,
	toCanonicalHeader,
	normalizeHeader,
	parseCSV,
	mapCSVRowToContact,
	escapeCsvField,
	contactsToCsv,
	CSV_COLUMNS,
} from './csv'
import type { Contact } from './db'

// ---------------------------------------------------------------------------
// parseCSVLine
// ---------------------------------------------------------------------------
describe('parseCSVLine', () => {
	it('parses simple comma-separated fields', () => {
		expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c'])
	})

	it('handles quoted fields with commas', () => {
		expect(parseCSVLine('"hello, world",b,c')).toEqual(['hello, world', 'b', 'c'])
	})

	it('handles escaped double quotes', () => {
		expect(parseCSVLine('"say ""hello""",b')).toEqual(['say "hello"', 'b'])
	})

	it('handles empty fields', () => {
		expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c'])
	})

	it('handles trailing comma', () => {
		expect(parseCSVLine('a,b,')).toEqual(['a', 'b', ''])
	})

	it('handles single field', () => {
		expect(parseCSVLine('hello')).toEqual(['hello'])
	})

	it('handles empty string', () => {
		expect(parseCSVLine('')).toEqual([''])
	})

	it('trims whitespace from fields', () => {
		expect(parseCSVLine(' a , b , c ')).toEqual(['a', 'b', 'c'])
	})

	it('handles quoted fields with newlines', () => {
		expect(parseCSVLine('"line1\nline2",b')).toEqual(['line1\nline2', 'b'])
	})
})

// ---------------------------------------------------------------------------
// normalizeHeader / toCanonicalHeader
// ---------------------------------------------------------------------------
describe('toCanonicalHeader', () => {
	it('maps "First Name" to "first"', () => {
		expect(toCanonicalHeader('First Name')).toBe('first')
	})

	it('maps "E-Mail" to "email"', () => {
		expect(toCanonicalHeader('E-Mail')).toBe('email')
	})

	it('maps "Email Address" to "email"', () => {
		expect(toCanonicalHeader('Email Address')).toBe('email')
	})

	it('maps "Last Name" to "last"', () => {
		expect(toCanonicalHeader('Last Name')).toBe('last')
	})

	it('maps "Company" to "company"', () => {
		expect(toCanonicalHeader('Company')).toBe('company')
	})

	it('maps "Organization" to "company"', () => {
		expect(toCanonicalHeader('Organization')).toBe('company')
	})

	it('maps "Job Title" to "job_title"', () => {
		expect(toCanonicalHeader('Job Title')).toBe('job_title')
	})

	it('maps "Birthday" to "bday"', () => {
		expect(toCanonicalHeader('Birthday')).toBe('bday')
	})

	it('maps "Website" to "homepage"', () => {
		expect(toCanonicalHeader('Website')).toBe('homepage')
	})

	it('returns null for unknown header', () => {
		expect(toCanonicalHeader('Favorite Color')).toBeNull()
	})

	it('is case-insensitive', () => {
		expect(toCanonicalHeader('EMAIL')).toBe('email')
		expect(toCanonicalHeader('firstName')).toBe('first')
	})

	it('strips non-alphanumeric characters', () => {
		expect(normalizeHeader('First-Name')).toBe('firstname')
		expect(normalizeHeader('E_Mail')).toBe('email')
	})
})

// ---------------------------------------------------------------------------
// parseCSV
// ---------------------------------------------------------------------------
describe('parseCSV', () => {
	it('parses a simple CSV', () => {
		const csv = 'First Name,Last Name,Email\nJohn,Smith,john@example.com'
		const rows = parseCSV(csv)
		expect(rows).toHaveLength(1)
		expect(rows[0]).toEqual({ first: 'John', last: 'Smith', email: 'john@example.com' })
	})

	it('handles multiple rows', () => {
		const csv = 'First Name,Email\nAlice,alice@test.com\nBob,bob@test.com'
		const rows = parseCSV(csv)
		expect(rows).toHaveLength(2)
	})

	it('skips empty lines', () => {
		const csv = 'First Name,Email\n\nAlice,alice@test.com\n\n'
		const rows = parseCSV(csv)
		expect(rows).toHaveLength(1)
	})

	it('handles Windows line endings (CRLF)', () => {
		const csv = 'First Name,Email\r\nAlice,alice@test.com\r\n'
		const rows = parseCSV(csv)
		expect(rows).toHaveLength(1)
		expect(rows[0].email).toBe('alice@test.com')
	})

	it('returns empty array for empty string', () => {
		expect(parseCSV('')).toEqual([])
	})

	it('returns empty rows for header-only CSV', () => {
		const csv = 'First Name,Email'
		const rows = parseCSV(csv)
		expect(rows).toHaveLength(0)
	})

	it('skips unknown columns', () => {
		const csv = 'First Name,Favorite Color,Email\nAlice,Blue,alice@test.com'
		const rows = parseCSV(csv)
		expect(rows[0]).toEqual({ first: 'Alice', email: 'alice@test.com' })
	})

	it('uses first value for duplicate canonical headers', () => {
		const csv = 'Phone,Cell\n555-1234,555-5678'
		const rows = parseCSV(csv)
		expect(rows[0].phone).toBe('555-1234')
	})
})

// ---------------------------------------------------------------------------
// mapCSVRowToContact
// ---------------------------------------------------------------------------
describe('mapCSVRowToContact', () => {
	it('maps basic fields', () => {
		const contact = mapCSVRowToContact({ first: 'John', last: 'Smith', email: 'john@test.com' })
		expect(contact.first_name).toBe('John')
		expect(contact.last_name).toBe('Smith')
		expect(contact.email).toBe('john@test.com')
		expect(contact.full_name).toBe('John Smith')
	})

	it('builds full_name from first + last', () => {
		const contact = mapCSVRowToContact({ first: 'Alice', last: 'Wonder' })
		expect(contact.full_name).toBe('Alice Wonder')
	})

	it('uses full_name if provided', () => {
		const contact = mapCSVRowToContact({ full_name: 'Dr. Alice Wonder', first: 'Alice' })
		expect(contact.full_name).toBe('Dr. Alice Wonder')
	})

	it('defaults to "Unnamed Contact" when no name data', () => {
		const contact = mapCSVRowToContact({})
		expect(contact.full_name).toBe('Unnamed Contact')
	})

	it('handles missing fields as null', () => {
		const contact = mapCSVRowToContact({ first: 'Alice' })
		expect(contact.last_name).toBeNull()
		expect(contact.email).toBeNull()
		expect(contact.phone).toBeNull()
		expect(contact.organization).toBeNull()
	})

	it('parses birthday', () => {
		const contact = mapCSVRowToContact({ first: 'Alice', bday: '1990-05-15' })
		expect(contact.birthday).toBeInstanceOf(Date)
		expect(contact.birthday!.getFullYear()).toBe(1990)
	})

	it('handles invalid birthday gracefully', () => {
		const contact = mapCSVRowToContact({ first: 'Alice', bday: 'not-a-date' })
		expect(contact.birthday).toBeNull()
	})

	it('maps organization fields', () => {
		const contact = mapCSVRowToContact({ first: 'Alice', company: 'Acme Corp', job_title: 'Engineer' })
		expect(contact.organization).toBe('Acme Corp')
		expect(contact.job_title).toBe('Engineer')
	})
})

// ---------------------------------------------------------------------------
// escapeCsvField
// ---------------------------------------------------------------------------
describe('escapeCsvField', () => {
	it('returns empty string for null', () => {
		expect(escapeCsvField(null)).toBe('')
	})

	it('returns empty string for undefined', () => {
		expect(escapeCsvField(undefined)).toBe('')
	})

	it('returns empty string for empty string', () => {
		expect(escapeCsvField('')).toBe('')
	})

	it('passes through clean strings', () => {
		expect(escapeCsvField('hello')).toBe('hello')
	})

	it('quotes fields with commas', () => {
		expect(escapeCsvField('hello, world')).toBe('"hello, world"')
	})

	it('quotes and escapes fields with double quotes', () => {
		expect(escapeCsvField('say "hello"')).toBe('"say ""hello"""')
	})

	it('quotes fields with newlines', () => {
		expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"')
	})

	it('quotes fields with carriage returns', () => {
		expect(escapeCsvField('line1\rline2')).toBe('"line1\rline2"')
	})
})

// ---------------------------------------------------------------------------
// contactsToCsv
// ---------------------------------------------------------------------------
describe('contactsToCsv', () => {
	it('produces correct header row', () => {
		const csv = contactsToCsv([])
		expect(csv).toBe(CSV_COLUMNS.join(','))
	})

	it('exports a contact row', () => {
		const contacts = [
			{
				first_name: 'Alice',
				last_name: 'Smith',
				full_name: 'Alice Smith',
				email: 'alice@test.com',
				phone: null,
				organization: null,
				job_title: null,
				address: null,
				notes: null,
				birthday: null,
				homepage: null,
				nickname: null,
				middle_name: null,
				maiden_name: null,
			},
		] as unknown as Array<Contact>
		const csv = contactsToCsv(contacts)
		const lines = csv.split('\r\n')
		expect(lines).toHaveLength(2)
		expect(lines[1]).toContain('Alice')
		expect(lines[1]).toContain('alice@test.com')
	})

	it('handles null values as empty strings', () => {
		const contacts = [
			{
				first_name: null,
				last_name: null,
				full_name: 'Test',
				email: null,
			},
		] as unknown as Array<Contact>
		const csv = contactsToCsv(contacts)
		const lines = csv.split('\r\n')
		// First two fields (first_name, last_name) should be empty
		expect(lines[1].startsWith(',,Test')).toBe(true)
	})

	it('escapes special characters in contact fields', () => {
		const contacts = [
			{
				first_name: 'Alice',
				last_name: null,
				full_name: 'Alice "The Great"',
				email: null,
			},
		] as unknown as Array<Contact>
		const csv = contactsToCsv(contacts)
		expect(csv).toContain('"Alice ""The Great"""')
	})
})
