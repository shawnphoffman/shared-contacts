import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deleteContact, getContactsByIds, updateContact } from '../../lib/db'
import { recordHistory } from '../../lib/history'
import { refreshRelatedNamesVcards, transferRelationshipEdges } from '../../lib/relationships'
import { MergeContactsSchema } from '../../lib/schemas'

vi.mock('../../lib/db', () => ({
	getContactsByIds: vi.fn(),
	getContactById: vi.fn(),
	deleteContact: vi.fn(),
	updateContact: vi.fn(),
	setContactAddressBooks: vi.fn(),
}))

vi.mock('../../lib/history', () => ({
	actorFromRequest: vi.fn().mockReturnValue({ actor: null, actorType: null, userAgent: null, clientIp: null, source: 'web' }),
	recordHistory: vi.fn().mockResolvedValue(null),
	snapshotContact: vi.fn((c: unknown) => c),
}))

vi.mock('../../lib/logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../lib/vcard', () => ({
	extractUID: vi.fn().mockReturnValue('test-uid'),
	generateVCard: vi.fn().mockReturnValue('BEGIN:VCARD\nVERSION:3.0\nFN:Test\nEND:VCARD'),
}))

vi.mock('../../lib/merge', () => ({
	mergeContacts: vi.fn((contacts: Array<Record<string, unknown>>) => ({
		full_name: contacts[0]?.full_name || 'Merged',
	})),
}))

vi.mock('../../lib/contact-helpers', () => ({
	sanitizeContact: vi.fn((c: Record<string, unknown>) => c),
	zodError: vi.fn().mockReturnValue(Response.json({ error: 'Validation failed' }, { status: 400 })),
}))

vi.mock('../../lib/schemas', () => ({
	MergeContactsSchema: {
		safeParse: vi.fn(),
	},
}))

vi.mock('../../lib/relationships', () => ({
	transferRelationshipEdges: vi.fn(),
	refreshRelatedNamesVcards: vi.fn(),
}))

const getHandler = async () => {
	const mod = await import('./contacts.merge')
	const route = mod.Route as unknown as Record<string, unknown>
	const options = route.options as Record<string, unknown>
	const server = options.server as Record<string, unknown>
	const handlers = server.handlers as Record<string, (...args: Array<unknown>) => Promise<Response>>
	return handlers
}

describe('POST /api/contacts/merge', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(transferRelationshipEdges).mockResolvedValue({ repointed: [], dropped: [] })
	})

	it('returns 400 on invalid schema', async () => {
		vi.mocked(MergeContactsSchema.safeParse).mockReturnValue({
			success: false,
			error: { issues: [{ message: 'Required', path: ['contactIds'] }] },
		} as never)

		const handlers = await getHandler()
		const request = new Request('http://localhost/api/contacts/merge', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		})
		const response = await handlers.POST({ request })
		expect(response.status).toBe(400)
	})

	it('returns 404 when a contact is not found', async () => {
		vi.mocked(MergeContactsSchema.safeParse).mockReturnValue({
			success: true,
			data: { contactIds: ['id-1', 'id-2'] },
		} as never)
		// Return only one contact (id-2 missing)
		vi.mocked(getContactsByIds).mockResolvedValue([{ id: 'id-1', full_name: 'Alice', created_at: new Date('2024-01-01') }] as never)

		const handlers = await getHandler()
		const request = new Request('http://localhost/api/contacts/merge', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ contactIds: ['id-1', 'id-2'] }),
		})
		const response = await handlers.POST({ request })
		expect(response.status).toBe(404)
		const data = await response.json()
		expect(data.error).toContain('id-2')
	})

	it('merges contacts successfully', async () => {
		vi.mocked(MergeContactsSchema.safeParse).mockReturnValue({
			success: true,
			data: { contactIds: ['id-1', 'id-2'] },
		} as never)
		vi.mocked(getContactsByIds).mockResolvedValue([
			{ id: 'id-1', full_name: 'Alice', created_at: new Date('2024-01-01'), address_books: [] },
			{ id: 'id-2', full_name: 'Bob', created_at: new Date('2024-06-01'), address_books: [] },
		] as never)
		vi.mocked(updateContact).mockResolvedValue({ id: 'id-1', full_name: 'Alice' } as never)
		vi.mocked(deleteContact).mockResolvedValue(undefined)

		const handlers = await getHandler()
		const request = new Request('http://localhost/api/contacts/merge', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ contactIds: ['id-1', 'id-2'] }),
		})
		const response = await handlers.POST({ request })
		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.primaryContactId).toBe('id-1')
		expect(data.deletedContactIds).toContain('id-2')
		expect(updateContact).toHaveBeenCalled()
		expect(deleteContact).toHaveBeenCalledWith('id-2')
	})

	const mergeRequest = () =>
		new Request('http://localhost/api/contacts/merge', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ contactIds: ['id-1', 'id-2'] }),
		})

	const setupTwoContacts = () => {
		vi.mocked(MergeContactsSchema.safeParse).mockReturnValue({
			success: true,
			data: { contactIds: ['id-1', 'id-2'] },
		} as never)
		vi.mocked(getContactsByIds).mockResolvedValue([
			{ id: 'id-1', full_name: 'Alice', created_at: new Date('2024-01-01'), address_books: [] },
			{ id: 'id-2', full_name: 'Bob', created_at: new Date('2024-06-01'), address_books: [] },
		] as never)
		vi.mocked(updateContact).mockResolvedValue({ id: 'id-1', full_name: 'Alice' } as never)
		vi.mocked(deleteContact).mockResolvedValue(undefined)
	}

	it('transfers relationship edges to the primary and records them in history', async () => {
		setupTwoContacts()
		const before = {
			id: 'edge-1',
			a_contact_id: 'id-2',
			a_placeholder_id: null,
			b_contact_id: 'other-id',
			b_placeholder_id: null,
			type: 'spouse',
			qualifier: null,
		}
		vi.mocked(transferRelationshipEdges).mockResolvedValue({
			repointed: [{ before, after: { ...before, a_contact_id: 'id-1' } }],
			dropped: [],
		} as never)

		const handlers = await getHandler()
		const response = await handlers.POST({ request: mergeRequest() })
		expect(response.status).toBe(200)
		expect(transferRelationshipEdges).toHaveBeenCalledWith('id-1', ['id-2'])
		expect(refreshRelatedNamesVcards).toHaveBeenCalledWith(['id-1'])
		const historyEntry = vi.mocked(recordHistory).mock.calls[0][0]
		expect(historyEntry.metadata?.relationshipTransfers).toEqual({ repointed: [before], dropped: [] })
	})

	it('still merges when the edge transfer fails', async () => {
		setupTwoContacts()
		vi.mocked(transferRelationshipEdges).mockRejectedValue(new Error('relationships table unavailable'))

		const handlers = await getHandler()
		const response = await handlers.POST({ request: mergeRequest() })
		expect(response.status).toBe(200)
		expect(refreshRelatedNamesVcards).not.toHaveBeenCalled()
		const historyEntry = vi.mocked(recordHistory).mock.calls[0][0]
		expect(historyEntry.metadata?.relationshipTransfers).toBeUndefined()
	})
})
