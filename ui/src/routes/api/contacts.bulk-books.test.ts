import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/db', () => ({
	getBulkContactAddressBookIds: vi.fn(),
	bulkSetContactAddressBooks: vi.fn(),
}))

vi.mock('../../lib/logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../lib/contact-helpers', () => ({
	zodError: vi.fn().mockReturnValue(Response.json({ error: 'Validation failed' }, { status: 400 })),
}))

vi.mock('../../lib/schemas', () => ({
	BulkBooksSchema: {
		safeParse: vi.fn(),
	},
}))

import { getBulkContactAddressBookIds, bulkSetContactAddressBooks } from '../../lib/db'
import { BulkBooksSchema } from '../../lib/schemas'

const getHandler = async () => {
	const mod = await import('./contacts.bulk-books')
	const route = mod.Route as Record<string, unknown>
	const options = route.options as Record<string, unknown>
	const server = options.server as Record<string, unknown>
	const handlers = server.handlers as Record<string, Function>
	return handlers
}

describe('POST /api/contacts/bulk-books', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('returns 400 on invalid schema', async () => {
		vi.mocked(BulkBooksSchema.safeParse).mockReturnValue({
			success: false,
			error: { issues: [{ message: 'Required', path: ['contact_ids'] }] },
		} as never)

		const handlers = await getHandler()
		const request = new Request('http://localhost/api/contacts/bulk-books', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		})
		const response = await handlers.POST({ request })
		expect(response.status).toBe(400)
	})

	it('adds and removes book assignments', async () => {
		vi.mocked(BulkBooksSchema.safeParse).mockReturnValue({
			success: true,
			data: {
				contact_ids: ['c1', 'c2'],
				add_to_book_ids: ['book-a'],
				remove_from_book_ids: ['book-b'],
			},
		} as never)

		const currentMap = new Map([
			['c1', ['book-b', 'book-c']],
			['c2', ['book-b']],
		])
		vi.mocked(getBulkContactAddressBookIds).mockResolvedValue(currentMap)
		vi.mocked(bulkSetContactAddressBooks).mockResolvedValue(undefined)

		const handlers = await getHandler()
		const request = new Request('http://localhost/api/contacts/bulk-books', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contact_ids: ['c1', 'c2'],
				add_to_book_ids: ['book-a'],
				remove_from_book_ids: ['book-b'],
			}),
		})
		const response = await handlers.POST({ request })
		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.updated).toBe(2)

		// Verify bulk set was called with correct assignments
		expect(bulkSetContactAddressBooks).toHaveBeenCalledWith([
			{ contactId: 'c1', bookIds: expect.arrayContaining(['book-c', 'book-a']) },
			{ contactId: 'c2', bookIds: ['book-a'] },
		])
	})

	it('returns 500 on database error', async () => {
		vi.mocked(BulkBooksSchema.safeParse).mockReturnValue({
			success: true,
			data: { contact_ids: ['c1'], add_to_book_ids: [], remove_from_book_ids: [] },
		} as never)
		vi.mocked(getBulkContactAddressBookIds).mockRejectedValue(new Error('DB error'))

		const handlers = await getHandler()
		const request = new Request('http://localhost/api/contacts/bulk-books', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ contact_ids: ['c1'], add_to_book_ids: [], remove_from_book_ids: [] }),
		})
		const response = await handlers.POST({ request })
		expect(response.status).toBe(500)
	})
})
