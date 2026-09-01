import { beforeEach, describe, expect, it, vi } from 'vitest'

import { emptyTrash, getContactById, getDeletedContacts, permanentlyDeleteContact, recordPurgedVcardIds } from '../../lib/db'
import { contactEdgeNeighborIds, deleteOrphanPlaceholders, refreshRelatedNamesVcards } from '../../lib/relationships'

vi.mock('../../lib/db', () => ({
	emptyTrash: vi.fn(),
	getContactById: vi.fn(),
	getDeletedContacts: vi.fn(),
	permanentlyDeleteContact: vi.fn(),
	recordPurgedVcardIds: vi.fn(),
	restoreContact: vi.fn(),
}))

vi.mock('../../lib/history', () => ({
	actorFromRequest: vi.fn().mockReturnValue({ actor: null, actorType: null, userAgent: null, clientIp: null, source: 'web' }),
	recordHistory: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../lib/logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../lib/relationships', () => ({
	contactEdgeNeighborIds: vi.fn(),
	deleteOrphanPlaceholders: vi.fn(),
	refreshRelatedNamesVcards: vi.fn(),
}))

const getHandler = async () => {
	const mod = await import('./contacts.trash')
	const route = mod.Route as unknown as Record<string, unknown>
	const options = route.options as Record<string, unknown>
	const server = options.server as Record<string, unknown>
	const handlers = server.handlers as Record<string, (...args: Array<unknown>) => Promise<Response>>
	return handlers
}

const trashRequest = (body: Record<string, unknown>) =>
	new Request('http://localhost/api/contacts/trash', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	})

describe('POST /api/contacts/trash', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(contactEdgeNeighborIds).mockResolvedValue([])
		vi.mocked(deleteOrphanPlaceholders).mockResolvedValue(0)
		vi.mocked(refreshRelatedNamesVcards).mockResolvedValue(0)
		vi.mocked(getContactById).mockResolvedValue({ id: 'id-1', full_name: 'Alice' } as never)
		vi.mocked(permanentlyDeleteContact).mockResolvedValue(undefined)
		vi.mocked(emptyTrash).mockResolvedValue(2)
		vi.mocked(getDeletedContacts).mockResolvedValue([{ id: 'id-1' }, { id: 'id-2' }] as never)
	})

	it('snapshots relationship neighbours before purging, then sweeps and refreshes', async () => {
		vi.mocked(contactEdgeNeighborIds).mockResolvedValue(['neighbor-1'])

		const handlers = await getHandler()
		const response = await handlers.POST({ request: trashRequest({ action: 'permanent-delete', id: 'id-1' }) })
		expect(response.status).toBe(200)

		expect(contactEdgeNeighborIds).toHaveBeenCalledWith(['id-1'])
		// Neighbours must be captured before the FK cascade erases the edges.
		expect(vi.mocked(contactEdgeNeighborIds).mock.invocationCallOrder[0]).toBeLessThan(
			vi.mocked(permanentlyDeleteContact).mock.invocationCallOrder[0]
		)
		expect(deleteOrphanPlaceholders).toHaveBeenCalled()
		expect(refreshRelatedNamesVcards).toHaveBeenCalledWith(['neighbor-1'])
	})

	it('tombstones the vCard id before the row goes', async () => {
		// The cards outlive the row until the outbound sweep clears them, and the
		// inbound sync reads a card with no row behind it as a new contact - so a
		// purge without this put the contact straight back.
		vi.mocked(getContactById).mockResolvedValue({ id: 'id-1', full_name: 'Alice', vcard_id: 'alice-uid' } as never)

		const handlers = await getHandler()
		await handlers.POST({ request: trashRequest({ action: 'permanent-delete', id: 'id-1' }) })

		expect(recordPurgedVcardIds).toHaveBeenCalledWith(['alice-uid'])
		expect(vi.mocked(recordPurgedVcardIds).mock.invocationCallOrder[0]).toBeLessThan(
			vi.mocked(permanentlyDeleteContact).mock.invocationCallOrder[0]
		)
	})

	it('tombstones every card when the trash is emptied', async () => {
		vi.mocked(getDeletedContacts).mockResolvedValue([
			{ id: 'id-1', vcard_id: 'alice-uid' },
			{ id: 'id-2', vcard_id: 'bob-uid' },
		] as never)

		const handlers = await getHandler()
		await handlers.POST({ request: trashRequest({ action: 'empty' }) })

		expect(recordPurgedVcardIds).toHaveBeenCalledWith(['alice-uid', 'bob-uid'])
		expect(vi.mocked(recordPurgedVcardIds).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(emptyTrash).mock.invocationCallOrder[0])
	})

	it('skips the vCard refresh when the purged contact had no edges', async () => {
		const handlers = await getHandler()
		await handlers.POST({ request: trashRequest({ action: 'permanent-delete', id: 'id-1' }) })
		expect(deleteOrphanPlaceholders).toHaveBeenCalled()
		expect(refreshRelatedNamesVcards).not.toHaveBeenCalled()
	})

	it('cleans up around emptying the trash using every trashed contact id', async () => {
		vi.mocked(contactEdgeNeighborIds).mockResolvedValue(['neighbor-2'])

		const handlers = await getHandler()
		const response = await handlers.POST({ request: trashRequest({ action: 'empty' }) })
		expect(response.status).toBe(200)

		expect(contactEdgeNeighborIds).toHaveBeenCalledWith(['id-1', 'id-2'])
		expect(vi.mocked(contactEdgeNeighborIds).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(emptyTrash).mock.invocationCallOrder[0])
		expect(refreshRelatedNamesVcards).toHaveBeenCalledWith(['neighbor-2'])
	})

	it('still purges when relationship cleanup fails', async () => {
		vi.mocked(contactEdgeNeighborIds).mockRejectedValue(new Error('relationships unavailable'))
		vi.mocked(deleteOrphanPlaceholders).mockRejectedValue(new Error('sweep failed'))

		const handlers = await getHandler()
		const response = await handlers.POST({ request: trashRequest({ action: 'permanent-delete', id: 'id-1' }) })
		expect(response.status).toBe(200)
		expect(permanentlyDeleteContact).toHaveBeenCalledWith('id-1')
	})
})
