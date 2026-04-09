import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createContact, getAllContacts, getAllContactsPaginated } from '../../lib/db'
import { CreateContactSchema } from '../../lib/schemas'

// Mock db module before imports
vi.mock('../../lib/db', () => ({
	getAllContacts: vi.fn(),
	getAllContactsPaginated: vi.fn(),
	createContact: vi.fn(),
	getContactById: vi.fn(),
	setContactAddressBooks: vi.fn(),
	getAddressBookBySlug: vi.fn(),
}))

vi.mock('../../lib/logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../lib/vcard', () => ({
	extractUID: vi.fn().mockReturnValue('test-uid'),
	generateVCard: vi.fn().mockReturnValue('BEGIN:VCARD\nVERSION:3.0\nFN:Test\nEND:VCARD'),
}))

vi.mock('../../lib/utils', () => ({
	normalizePhoneNumber: vi.fn((v: string | null) => v),
	formatPhoneNumber: vi.fn((v: string | null) => v),
}))

vi.mock('../../lib/contact-helpers', () => ({
	sanitizeContact: vi.fn((c: Record<string, unknown>) => c),
	resolveAddressBookIds: vi.fn().mockResolvedValue([]),
	decodePhotoPayload: vi.fn().mockReturnValue({}),
	zodError: vi.fn().mockReturnValue(Response.json({ error: 'Validation failed' }, { status: 400 })),
}))

vi.mock('../../lib/schemas', () => ({
	CreateContactSchema: {
		safeParse: vi.fn(),
	},
}))

// Extract the handler from the route module
const getHandler = async () => {
	const mod = await import('./contacts')
	const route = mod.Route as Record<string, unknown>
	const options = route.options as Record<string, unknown>
	const server = options.server as Record<string, unknown>
	const handlers = server.handlers as Record<string, (...args: Array<unknown>) => unknown>
	return handlers
}

describe('GET /api/contacts', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('returns flat array without pagination params', async () => {
		const mockContacts = [{ id: '1', full_name: 'Alice' }]
		vi.mocked(getAllContacts).mockResolvedValue(mockContacts as never)

		const handlers = await getHandler()
		const request = new Request('http://localhost/api/contacts')
		const response = await handlers.GET({ request })
		const data = await response.json()

		expect(getAllContacts).toHaveBeenCalled()
		expect(Array.isArray(data)).toBe(true)
		expect(data).toHaveLength(1)
	})

	it('returns paginated envelope with limit/offset params', async () => {
		const mockResult = { data: [{ id: '1', full_name: 'Alice' }], total: 1, limit: 10, offset: 0 }
		vi.mocked(getAllContactsPaginated).mockResolvedValue(mockResult as never)

		const handlers = await getHandler()
		const request = new Request('http://localhost/api/contacts?limit=10&offset=0')
		const response = await handlers.GET({ request })
		const data = await response.json()

		expect(getAllContactsPaginated).toHaveBeenCalledWith({ limit: 10, offset: 0 })
		expect(data).toHaveProperty('data')
		expect(data).toHaveProperty('total')
	})

	it('returns 500 on database error', async () => {
		vi.mocked(getAllContacts).mockRejectedValue(new Error('DB error'))

		const handlers = await getHandler()
		const request = new Request('http://localhost/api/contacts')
		const response = await handlers.GET({ request })

		expect(response.status).toBe(500)
		const data = await response.json()
		expect(data.error).toBe('Failed to fetch contacts')
	})
})

describe('POST /api/contacts', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('returns 400 on invalid schema', async () => {
		vi.mocked(CreateContactSchema.safeParse).mockReturnValue({
			success: false,
			error: { issues: [{ message: 'Required', path: ['full_name'] }] },
		} as never)

		const handlers = await getHandler()
		const request = new Request('http://localhost/api/contacts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		})
		const response = await handlers.POST({ request })

		expect(response.status).toBe(400)
	})

	it('creates contact with valid data', async () => {
		const mockContact = { id: '1', full_name: 'Test Contact' }
		vi.mocked(CreateContactSchema.safeParse).mockReturnValue({
			success: true,
			data: { full_name: 'Test Contact' },
		} as never)
		vi.mocked(createContact).mockResolvedValue(mockContact as never)

		const handlers = await getHandler()
		const request = new Request('http://localhost/api/contacts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ full_name: 'Test Contact' }),
		})
		const response = await handlers.POST({ request })

		expect(createContact).toHaveBeenCalled()
		expect(response.status).toBe(201)
	})
})
