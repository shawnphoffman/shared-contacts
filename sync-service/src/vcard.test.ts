import { describe, it, expect } from 'vitest'
import { parseVCard, generateVCard, parseName } from './vcard'

describe('parseVCard', () => {
	it('parses a minimal vCard 3.0', () => {
		const vcard = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:John Doe', 'N:Doe;John;;;', 'UID:test-uid-123', 'END:VCARD'].join('\r\n')

		const result = parseVCard(vcard)
		expect(result.fn).toBe('John Doe')
		expect(result.n).toBe('Doe;John;;;')
		expect(result.uid).toBe('test-uid-123')
		expect(result.version).toBe('3.0')
	})

	it('parses multiple phones with types', () => {
		const vcard = [
			'BEGIN:VCARD',
			'VERSION:3.0',
			'FN:John Doe',
			'TEL;TYPE=CELL:+1-555-0100',
			'TEL;TYPE=WORK:+1-555-0200',
			'TEL;TYPE=HOME:+1-555-0300',
			'END:VCARD',
		].join('\r\n')

		const result = parseVCard(vcard)
		expect(result.tels).toHaveLength(3)
		expect(result.tels![0]).toEqual({ value: '+1-555-0100', type: 'CELL' })
		expect(result.tels![1]).toEqual({ value: '+1-555-0200', type: 'WORK' })
		expect(result.tels![2]).toEqual({ value: '+1-555-0300', type: 'HOME' })
		// Backward compat: first phone is set
		expect(result.tel).toBe('+1-555-0100')
	})

	it('parses multiple emails with types', () => {
		const vcard = [
			'BEGIN:VCARD',
			'VERSION:3.0',
			'FN:John Doe',
			'EMAIL;TYPE=INTERNET:john@example.com',
			'EMAIL;TYPE=WORK:john@work.com',
			'END:VCARD',
		].join('\r\n')

		const result = parseVCard(vcard)
		expect(result.emails).toHaveLength(2)
		expect(result.emails![0]).toEqual({ value: 'john@example.com', type: 'INTERNET' })
		expect(result.emails![1]).toEqual({ value: 'john@work.com', type: 'WORK' })
		expect(result.email).toBe('john@example.com')
	})

	it('parses structured addresses', () => {
		const vcard = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:John Doe', 'ADR;TYPE=HOME:;;123 Main St;Springfield;IL;62704;US', 'END:VCARD'].join(
			'\r\n'
		)

		const result = parseVCard(vcard)
		expect(result.addresses).toHaveLength(1)
		expect(result.addresses![0].value).toBe(';;123 Main St;Springfield;IL;62704;US')
		expect(result.addresses![0].type).toBe('HOME')
	})

	it('handles line folding (continuation lines)', () => {
		const vcard = [
			'BEGIN:VCARD',
			'VERSION:3.0',
			'FN:John Doe',
			'NOTE:This is a very long note that has been folded across',
			' multiple lines in the vCard format',
			'END:VCARD',
		].join('\r\n')

		const result = parseVCard(vcard)
		expect(result.note).toBe('This is a very long note that has been folded acrossmultiple lines in the vCard format')
	})

	it('parses organization with units', () => {
		const vcard = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:John Doe', 'ORG:Acme Corp;Engineering;Backend', 'END:VCARD'].join('\r\n')

		const result = parseVCard(vcard)
		expect(result.org).toBe('Acme Corp')
		expect(result.orgUnits).toEqual(['Engineering', 'Backend'])
	})

	it('parses categories', () => {
		const vcard = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:John Doe', 'CATEGORIES:Family,Friends,VIP', 'END:VCARD'].join('\r\n')

		const result = parseVCard(vcard)
		expect(result.categories).toEqual(['Family', 'Friends', 'VIP'])
	})

	it('parses birthday', () => {
		const vcard = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:John Doe', 'BDAY:19900115', 'END:VCARD'].join('\r\n')

		const result = parseVCard(vcard)
		expect(result.bday).toBe('19900115')
	})

	it('parses custom X- fields', () => {
		const vcard = [
			'BEGIN:VCARD',
			'VERSION:3.0',
			'FN:John Doe',
			'X-CUSTOM-FIELD:some value',
			'X-MANAGER;TYPE=WORK:Jane Smith',
			'END:VCARD',
		].join('\r\n')

		const result = parseVCard(vcard)
		expect(result.customFields).toHaveLength(2)
		expect(result.customFields![0].key).toBe('X-CUSTOM-FIELD')
		expect(result.customFields![0].value).toBe('some value')
	})

	it('handles escaped newlines in notes', () => {
		const vcard = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:John Doe', 'NOTE:Line one\\nLine two\\nLine three', 'END:VCARD'].join('\r\n')

		const result = parseVCard(vcard)
		expect(result.note).toBe('Line one\nLine two\nLine three')
	})

	it('parses photo data', () => {
		const vcard = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:John Doe', 'PHOTO;ENCODING=b;TYPE=JPEG:dGVzdA==', 'END:VCARD'].join('\r\n')

		const result = parseVCard(vcard)
		expect(result.photo).toBeDefined()
		expect(result.photo!.data).toBe('dGVzdA==')
	})

	it('handles empty/missing fields gracefully', () => {
		const vcard = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:John Doe', 'END:VCARD'].join('\r\n')

		const result = parseVCard(vcard)
		expect(result.fn).toBe('John Doe')
		expect(result.tels).toEqual([])
		expect(result.emails).toEqual([])
		expect(result.addresses).toEqual([])
		expect(result.note).toBeUndefined()
		expect(result.org).toBeUndefined()
	})

	it('parses URLs with types', () => {
		const vcard = [
			'BEGIN:VCARD',
			'VERSION:3.0',
			'FN:John Doe',
			'URL;TYPE=HOME:https://johndoe.com',
			'URL;TYPE=WORK:https://acme.com/john',
			'END:VCARD',
		].join('\r\n')

		const result = parseVCard(vcard)
		expect(result.urls).toHaveLength(2)
		expect(result.urls![0]).toEqual({ value: 'https://johndoe.com', type: 'HOME' })
	})

	it('parses vCard with \\n line endings', () => {
		const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:John Doe\nEND:VCARD'
		const result = parseVCard(vcard)
		expect(result.fn).toBe('John Doe')
	})
})

describe('generateVCard', () => {
	it('generates a minimal valid vCard', () => {
		const data = { uid: 'test-123', fn: 'John Doe', version: '3.0' }
		const result = generateVCard(data)

		expect(result).toContain('BEGIN:VCARD')
		expect(result).toContain('VERSION:3.0')
		expect(result).toContain('UID:test-123')
		expect(result).toContain('FN:John Doe')
		expect(result).toContain('END:VCARD')
	})

	it('generates phone entries with types', () => {
		const data = {
			uid: 'test-123',
			fn: 'John Doe',
			version: '3.0',
			tels: [
				{ value: '+1-555-0100', type: 'CELL' },
				{ value: '+1-555-0200', type: 'WORK' },
			],
		}
		const result = generateVCard(data)

		expect(result).toContain('TEL;TYPE=CELL:+1-555-0100')
		expect(result).toContain('TEL;TYPE=WORK:+1-555-0200')
	})

	it('generates email entries with types', () => {
		const data = {
			uid: 'test-123',
			fn: 'John Doe',
			version: '3.0',
			emails: [{ value: 'john@example.com', type: 'INTERNET' }],
		}
		const result = generateVCard(data)
		expect(result).toContain('EMAIL;TYPE=INTERNET:john@example.com')
	})

	it('generates structured name', () => {
		const data = {
			uid: 'test-123',
			fn: 'Dr. John M. Doe Jr.',
			n: 'Doe;John;M.;Dr.;Jr.',
			version: '3.0',
		}
		const result = generateVCard(data)
		expect(result).toContain('N:Doe;John;M.;Dr.;Jr.')
	})

	it('generates organization with units', () => {
		const data = {
			uid: 'test-123',
			fn: 'John Doe',
			version: '3.0',
			org: 'Acme Corp',
			orgUnits: ['Engineering'],
		}
		const result = generateVCard(data)
		expect(result).toContain('ORG:Acme Corp;Engineering')
	})

	it('generates addresses', () => {
		const data = {
			uid: 'test-123',
			fn: 'John Doe',
			version: '3.0',
			addresses: [{ value: ';;123 Main St;Springfield;IL;62704;US', type: 'HOME' }],
		}
		const result = generateVCard(data)
		expect(result).toContain('ADR;TYPE=HOME:')
		expect(result).toContain('123 Main St')
	})

	it('uses \\r\\n line endings per vCard spec', () => {
		const data = { uid: 'test-123', fn: 'John Doe', version: '3.0' }
		const result = generateVCard(data)
		expect(result).toContain('\r\n')
		expect(result).not.toMatch(/[^\r]\n/) // no bare \n without \r
	})

	it('folds long lines at 75 characters', () => {
		const longNote = 'A'.repeat(200)
		const data = {
			uid: 'test-123',
			fn: 'John Doe',
			version: '3.0',
		}
		const result = generateVCard(data, { notes: longNote })
		const lines = result.split('\r\n')
		for (const line of lines) {
			expect(line.length).toBeLessThanOrEqual(75)
		}
	})

	it('omits empty fields', () => {
		const data = {
			uid: 'test-123',
			fn: 'John Doe',
			version: '3.0',
		}
		const result = generateVCard(data)
		expect(result).not.toContain('TEL')
		expect(result).not.toContain('EMAIL')
		expect(result).not.toContain('ORG')
		expect(result).not.toContain('NOTE')
	})
})

describe('round-trip: parse → generate → parse', () => {
	it('preserves basic contact data through round-trip', () => {
		const original = [
			'BEGIN:VCARD',
			'VERSION:3.0',
			'UID:roundtrip-test',
			'FN:John Doe',
			'N:Doe;John;;;',
			'TEL;TYPE=CELL:+1-555-0100',
			'EMAIL;TYPE=INTERNET:john@example.com',
			'ORG:Acme Corp',
			'TITLE:Engineer',
			'BDAY:19900115',
			'NOTE:A test contact',
			'END:VCARD',
		].join('\r\n')

		const parsed = parseVCard(original)
		const generated = generateVCard(parsed)
		const reparsed = parseVCard(generated)

		expect(reparsed.uid).toBe(parsed.uid)
		expect(reparsed.fn).toBe(parsed.fn)
		expect(reparsed.org).toBe(parsed.org)
		expect(reparsed.title).toBe(parsed.title)
		expect(reparsed.bday).toBe(parsed.bday)
		expect(reparsed.tels).toEqual(parsed.tels)
		expect(reparsed.emails).toEqual(parsed.emails)
	})
})

describe('parseName', () => {
	it('parses structured name field', () => {
		const result = parseName('Doe;John;M.;Dr.;Jr.')
		expect(result).toEqual({
			lastName: 'Doe',
			firstName: 'John',
			additional: 'M.',
			prefix: 'Dr.',
			suffix: 'Jr.',
		})
	})

	it('handles minimal name', () => {
		const result = parseName('Doe;John;;;')
		expect(result.lastName).toBe('Doe')
		expect(result.firstName).toBe('John')
		expect(result.additional).toBe('')
	})
})
