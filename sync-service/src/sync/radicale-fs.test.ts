import { describe, it, expect, vi } from 'vitest'
import * as path from 'path'

// Mock external dependencies
vi.mock('../htpasswd', () => ({
	getUsers: vi.fn().mockResolvedValue([]),
	getCompositeUsername: vi.fn((user: string, bookId: string) => `${user}-${bookId}`),
	isCompositeUsername: vi.fn((username: string) => username.includes('-') && username.split('-').length >= 2),
	parseCompositeUsername: vi.fn((username: string) => {
		const parts = username.split('-')
		if (parts.length < 2) return null
		return { username: parts[0], bookId: parts.slice(1).join('-') }
	}),
}))

vi.mock('../fs-utils', () => ({
	atomicWriteFileSync: vi.fn(),
}))

vi.mock('../logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('./address-books', () => ({
	getAddressBooksForSync: vi.fn(),
}))

vi.mock('../db', () => ({}))

import { getAddressBookPath, extractVCardId, extractBookPathSegmentFromPath } from './radicale-fs'

// ---------------------------------------------------------------------------
// getAddressBookPath
// ---------------------------------------------------------------------------
describe('getAddressBookPath', () => {
	it('returns path under collection-root', () => {
		const result = getAddressBookPath('book-123')
		expect(result).toBe(path.join('/data/collections', 'collection-root', 'book-123'))
	})
})

// ---------------------------------------------------------------------------
// extractVCardId
// ---------------------------------------------------------------------------
describe('extractVCardId', () => {
	it('extracts UID from vCard content', () => {
		const content = 'BEGIN:VCARD\nVERSION:3.0\nUID:abc-123\nFN:Test\nEND:VCARD'
		const result = extractVCardId('/path/to/file.vcf', content)
		expect(result).toBe('abc-123')
	})

	it('falls back to filename when no UID in content', () => {
		const content = 'BEGIN:VCARD\nVERSION:3.0\nFN:Test\nEND:VCARD'
		const result = extractVCardId('/path/to/my-contact.vcf', content)
		expect(result).toBe('my-contact')
	})

	it('strips extension from filename fallback', () => {
		const content = 'BEGIN:VCARD\nFN:Test\nEND:VCARD'
		const result = extractVCardId('/path/to/contact-id.vcf', content)
		expect(result).toBe('contact-id')
	})

	it('trims whitespace from UID', () => {
		const content = 'BEGIN:VCARD\nUID:  abc-123  \nEND:VCARD'
		const result = extractVCardId('/path/to/file.vcf', content)
		expect(result).toBe('abc-123')
	})
})

// ---------------------------------------------------------------------------
// extractBookPathSegmentFromPath
// ---------------------------------------------------------------------------
describe('extractBookPathSegmentFromPath', () => {
	it('extracts book ID from master path (non-composite first segment)', () => {
		// Use a single segment name (no hyphen) so it's not parsed as composite
		const filePath = '/data/collections/collection-root/bookid/something/contact.vcf'
		const result = extractBookPathSegmentFromPath(filePath)
		expect(result).toBe('something')
	})

	it('returns null for path without collection-root', () => {
		const result = extractBookPathSegmentFromPath('/some/random/path.vcf')
		expect(result).toBeNull()
	})

	it('returns null for path with insufficient segments after collection-root', () => {
		const result = extractBookPathSegmentFromPath('/data/collections/collection-root/only-one')
		expect(result).toBeNull()
	})

	it('extracts book ID from composite username path', () => {
		// Composite username: "alice-book123" -> bookId is "book123"
		const filePath = '/data/collections/collection-root/alice-book123/contact.vcf'
		const result = extractBookPathSegmentFromPath(filePath)
		expect(result).toBe('book123')
	})
})
