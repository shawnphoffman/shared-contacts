import { describe, it, expect } from 'vitest'
import {
	CreateContactSchema,
	UpdateContactSchema,
	MergeContactsSchema,
	BulkBooksSchema,
	CreateAddressBookSchema,
	UpdateAddressBookSchema,
	CreateRadicaleUserSchema,
	PaginationSchema,
	ContactFieldSchema,
	CustomFieldSchema,
} from './schemas'

// ---------------------------------------------------------------------------
// ContactFieldSchema
// ---------------------------------------------------------------------------
describe('ContactFieldSchema', () => {
	it('accepts value with optional type', () => {
		expect(ContactFieldSchema.parse({ value: 'test@example.com', type: 'work' })).toEqual({
			value: 'test@example.com',
			type: 'work',
		})
	})

	it('accepts value without type', () => {
		expect(ContactFieldSchema.parse({ value: '555-1234' })).toEqual({ value: '555-1234' })
	})

	it('rejects missing value', () => {
		const result = ContactFieldSchema.safeParse({ type: 'home' })
		expect(result.success).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// CustomFieldSchema
// ---------------------------------------------------------------------------
describe('CustomFieldSchema', () => {
	it('accepts key + value with optional params', () => {
		expect(CustomFieldSchema.parse({ key: 'X-FOO', value: 'bar', params: ['TYPE=home'] })).toEqual({
			key: 'X-FOO',
			value: 'bar',
			params: ['TYPE=home'],
		})
	})

	it('accepts without params', () => {
		expect(CustomFieldSchema.parse({ key: 'X-FOO', value: 'bar' })).toEqual({ key: 'X-FOO', value: 'bar' })
	})
})

// ---------------------------------------------------------------------------
// CreateContactSchema
// ---------------------------------------------------------------------------
describe('CreateContactSchema', () => {
	it('accepts empty object (all fields optional)', () => {
		const result = CreateContactSchema.safeParse({})
		expect(result.success).toBe(true)
	})

	it('accepts full contact data', () => {
		const result = CreateContactSchema.safeParse({
			full_name: 'John Smith',
			first_name: 'John',
			last_name: 'Smith',
			email: 'john@example.com',
			phones: [{ value: '555-1234', type: 'mobile' }],
			emails: [{ value: 'john@example.com', type: 'work' }],
			organization: 'Acme Corp',
			notes: 'Some notes',
		})
		expect(result.success).toBe(true)
	})

	it('accepts null fields', () => {
		const result = CreateContactSchema.safeParse({
			full_name: null,
			email: null,
			phone: null,
		})
		expect(result.success).toBe(true)
	})

	it('passes through unknown fields (passthrough)', () => {
		const result = CreateContactSchema.safeParse({ unknown_field: 'value' })
		expect(result.success).toBe(true)
		if (result.success) {
			expect((result.data as any).unknown_field).toBe('value')
		}
	})

	it('rejects invalid phones array', () => {
		const result = CreateContactSchema.safeParse({
			phones: [{ invalid: true }],
		})
		expect(result.success).toBe(false)
	})

	it('accepts photo fields', () => {
		const result = CreateContactSchema.safeParse({
			photo_data: 'data:image/png;base64,abc123',
			photo_mime: 'image/png',
			photo_width: 100,
			photo_height: 100,
			photo_remove: false,
		})
		expect(result.success).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// UpdateContactSchema
// ---------------------------------------------------------------------------
describe('UpdateContactSchema', () => {
	it('accepts partial updates', () => {
		const result = UpdateContactSchema.safeParse({ full_name: 'Updated Name' })
		expect(result.success).toBe(true)
	})

	it('accepts empty object', () => {
		const result = UpdateContactSchema.safeParse({})
		expect(result.success).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// MergeContactsSchema
// ---------------------------------------------------------------------------
describe('MergeContactsSchema', () => {
	it('accepts array of 2+ IDs', () => {
		const result = MergeContactsSchema.safeParse({
			contactIds: ['id1', 'id2'],
		})
		expect(result.success).toBe(true)
	})

	it('rejects single ID', () => {
		const result = MergeContactsSchema.safeParse({
			contactIds: ['id1'],
		})
		expect(result.success).toBe(false)
	})

	it('rejects missing contactIds', () => {
		const result = MergeContactsSchema.safeParse({})
		expect(result.success).toBe(false)
	})

	it('rejects non-array contactIds', () => {
		const result = MergeContactsSchema.safeParse({
			contactIds: 'not-an-array',
		})
		expect(result.success).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// BulkBooksSchema
// ---------------------------------------------------------------------------
describe('BulkBooksSchema', () => {
	it('accepts valid bulk operation', () => {
		const result = BulkBooksSchema.safeParse({
			contact_ids: ['c1', 'c2'],
			add_to_book_ids: ['b1'],
		})
		expect(result.success).toBe(true)
	})

	it('accepts remove-only operation', () => {
		const result = BulkBooksSchema.safeParse({
			contact_ids: ['c1'],
			remove_from_book_ids: ['b1'],
		})
		expect(result.success).toBe(true)
	})

	it('rejects empty contact_ids', () => {
		const result = BulkBooksSchema.safeParse({
			contact_ids: [],
			add_to_book_ids: ['b1'],
		})
		expect(result.success).toBe(false)
	})

	it('rejects when both book arrays are empty', () => {
		const result = BulkBooksSchema.safeParse({
			contact_ids: ['c1'],
			add_to_book_ids: [],
			remove_from_book_ids: [],
		})
		expect(result.success).toBe(false)
	})

	it('defaults optional arrays to empty', () => {
		const result = BulkBooksSchema.safeParse({
			contact_ids: ['c1'],
			add_to_book_ids: ['b1'],
		})
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.remove_from_book_ids).toEqual([])
		}
	})
})

// ---------------------------------------------------------------------------
// CreateAddressBookSchema
// ---------------------------------------------------------------------------
describe('CreateAddressBookSchema', () => {
	it('accepts name with defaults', () => {
		const result = CreateAddressBookSchema.safeParse({ name: 'My Book' })
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.name).toBe('My Book')
			expect(result.data.is_public).toBe(true)
		}
	})

	it('rejects empty name', () => {
		const result = CreateAddressBookSchema.safeParse({ name: '' })
		expect(result.success).toBe(false)
	})

	it('rejects whitespace-only name', () => {
		const result = CreateAddressBookSchema.safeParse({ name: '   ' })
		expect(result.success).toBe(false)
	})

	it('trims name', () => {
		const result = CreateAddressBookSchema.safeParse({ name: '  Trimmed  ' })
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.name).toBe('Trimmed')
		}
	})

	it('accepts custom slug and is_public', () => {
		const result = CreateAddressBookSchema.safeParse({
			name: 'Test',
			slug: 'custom-slug',
			is_public: false,
		})
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.slug).toBe('custom-slug')
			expect(result.data.is_public).toBe(false)
		}
	})
})

// ---------------------------------------------------------------------------
// UpdateAddressBookSchema
// ---------------------------------------------------------------------------
describe('UpdateAddressBookSchema', () => {
	it('accepts partial update', () => {
		const result = UpdateAddressBookSchema.safeParse({ name: 'New Name' })
		expect(result.success).toBe(true)
	})

	it('accepts empty object', () => {
		const result = UpdateAddressBookSchema.safeParse({})
		expect(result.success).toBe(true)
	})

	it('rejects empty name string', () => {
		const result = UpdateAddressBookSchema.safeParse({ name: '' })
		expect(result.success).toBe(false)
	})

	it('accepts readonly fields', () => {
		const result = UpdateAddressBookSchema.safeParse({
			readonly_enabled: true,
			readonly_password: 'secret',
		})
		expect(result.success).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// CreateRadicaleUserSchema
// ---------------------------------------------------------------------------
describe('CreateRadicaleUserSchema', () => {
	it('accepts valid username and password', () => {
		const result = CreateRadicaleUserSchema.safeParse({
			username: 'alice',
			password: 'secret123',
		})
		expect(result.success).toBe(true)
	})

	it('rejects missing username', () => {
		const result = CreateRadicaleUserSchema.safeParse({
			password: 'secret',
		})
		expect(result.success).toBe(false)
	})

	it('rejects missing password', () => {
		const result = CreateRadicaleUserSchema.safeParse({
			username: 'alice',
		})
		expect(result.success).toBe(false)
	})

	it('rejects empty username', () => {
		const result = CreateRadicaleUserSchema.safeParse({
			username: '',
			password: 'secret',
		})
		expect(result.success).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// PaginationSchema
// ---------------------------------------------------------------------------
describe('PaginationSchema', () => {
	it('uses defaults when empty', () => {
		const result = PaginationSchema.safeParse({})
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.limit).toBe(100)
			expect(result.data.offset).toBe(0)
		}
	})

	it('coerces string values', () => {
		const result = PaginationSchema.safeParse({ limit: '50', offset: '10' })
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.limit).toBe(50)
			expect(result.data.offset).toBe(10)
		}
	})

	it('clamps limit to max 500', () => {
		const result = PaginationSchema.safeParse({ limit: 1000 })
		expect(result.success).toBe(false)
	})

	it('rejects negative offset', () => {
		const result = PaginationSchema.safeParse({ offset: -1 })
		expect(result.success).toBe(false)
	})

	it('rejects limit below 1', () => {
		const result = PaginationSchema.safeParse({ limit: 0 })
		expect(result.success).toBe(false)
	})
})
