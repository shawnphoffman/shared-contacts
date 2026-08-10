import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deleteContact, getContactById, updateContact } from '../../lib/db'
import { recordHistory } from '../../lib/history'

vi.mock('../../lib/db', () => ({
	deleteContact: vi.fn(),
	getContactById: vi.fn(),
	updateContact: vi.fn(),
}))

vi.mock('../../lib/history', () => ({
	actorFromRequest: vi.fn().mockReturnValue({ actor: null, actorType: null, userAgent: null, clientIp: null, source: 'web' }),
	recordHistory: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../lib/logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const getHandlers = async () => {
	const mod = await import('./lists.$id')
	const route = mod.Route as unknown as Record<string, unknown>
	const options = route.options as Record<string, unknown>
	const server = options.server as Record<string, unknown>
	return server.handlers as Record<string, (...args: Array<unknown>) => Promise<Response>>
}

const groupCard = ['BEGIN:VCARD', 'VERSION:3.0', 'N:CA Alpine Club;;;;', 'FN:CA Alpine Club', 'X-ADDRESSBOOKSERVER-KIND:group', 'X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:person-1', 'UID:group-1', 'END:VCARD'].join('\r\n') // prettier-ignore

const list = {
	id: 'list-1',
	full_name: 'CA Alpine Club',
	kind: 'group',
	vcard_id: 'group-1',
	vcard_data: groupCard,
	group_members: ['urn:uuid:person-1'],
}

const renameRequest = (body: Record<string, unknown>) =>
	new Request('http://localhost/api/lists/list-1', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	})

const deleteRequest = () => new Request('http://localhost/api/lists/list-1', { method: 'DELETE' })

describe('PUT /api/lists/$id', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(getContactById).mockResolvedValue(list as never)
		vi.mocked(updateContact).mockImplementation((id, contact) => Promise.resolve({ id, ...contact }) as never)
	})

	it('rewrites the stored card in place, preserving the member lines', async () => {
		const handlers = await getHandlers()
		const response = await handlers.PUT({ params: { id: 'list-1' }, request: renameRequest({ name: 'Alpine Crew' }) })

		expect(response.status).toBe(200)
		const written = vi.mocked(updateContact).mock.calls[0][1]
		expect(written.vcard_data).toContain('FN:Alpine Crew')
		expect(written.vcard_data).toContain('N:Alpine Crew;;;;')
		expect(written.vcard_data).toContain('X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:person-1')
		expect(written.full_name).toBe('Alpine Crew')
	})

	it('clears the outbound watermark so the rename reaches every subscriber', async () => {
		const handlers = await getHandlers()
		await handlers.PUT({ params: { id: 'list-1' }, request: renameRequest({ name: 'Alpine Crew' }) })

		expect(vi.mocked(updateContact).mock.calls[0][1].last_synced_to_radicale_at).toBeNull()
	})

	it('leaves sync_source alone, or the sync service stops honouring client-side deletes', async () => {
		const handlers = await getHandlers()
		await handlers.PUT({ params: { id: 'list-1' }, request: renameRequest({ name: 'Alpine Crew' }) })

		expect(vi.mocked(updateContact).mock.calls[0][1]).not.toHaveProperty('sync_source')
	})

	it('mirrors the name into last_name the way the inbound parser reads N', async () => {
		const handlers = await getHandlers()
		await handlers.PUT({ params: { id: 'list-1' }, request: renameRequest({ name: 'Alpine Crew' }) })

		const written = vi.mocked(updateContact).mock.calls[0][1]
		expect(written.last_name).toBe('Alpine Crew')
		expect(written.first_name).toBeNull()
	})

	it('refuses to rename a person', async () => {
		vi.mocked(getContactById).mockResolvedValue({ ...list, kind: 'individual' } as never)
		const handlers = await getHandlers()
		const response = await handlers.PUT({ params: { id: 'list-1' }, request: renameRequest({ name: 'Alpine Crew' }) })

		expect(response.status).toBe(400)
		expect(updateContact).not.toHaveBeenCalled()
	})

	it('404s for an unknown list', async () => {
		vi.mocked(getContactById).mockResolvedValue(null)
		const handlers = await getHandlers()
		const response = await handlers.PUT({ params: { id: 'list-1' }, request: renameRequest({ name: 'Alpine Crew' }) })

		expect(response.status).toBe(404)
	})

	it('rejects a blank name', async () => {
		const handlers = await getHandlers()
		const response = await handlers.PUT({ params: { id: 'list-1' }, request: renameRequest({ name: '   ' }) })

		expect(response.status).toBe(400)
		expect(updateContact).not.toHaveBeenCalled()
	})
})

describe('DELETE /api/lists/$id', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(getContactById).mockResolvedValue(list as never)
		vi.mocked(deleteContact).mockResolvedValue(undefined)
	})

	it('soft-deletes the group card and records why', async () => {
		const handlers = await getHandlers()
		const response = await handlers.DELETE({ params: { id: 'list-1' }, request: deleteRequest() })

		expect(response.status).toBe(200)
		expect(deleteContact).toHaveBeenCalledWith('list-1')
		expect(vi.mocked(recordHistory).mock.calls[0][0]).toMatchObject({
			contactId: 'list-1',
			operation: 'delete',
			summary: 'Deleted list CA Alpine Club',
		})
	})

	it('refuses to delete a person', async () => {
		vi.mocked(getContactById).mockResolvedValue({ ...list, kind: 'individual' } as never)
		const handlers = await getHandlers()
		const response = await handlers.DELETE({ params: { id: 'list-1' }, request: deleteRequest() })

		expect(response.status).toBe(400)
		expect(deleteContact).not.toHaveBeenCalled()
	})

	it('404s for an unknown list', async () => {
		vi.mocked(getContactById).mockResolvedValue(null)
		const handlers = await getHandlers()
		const response = await handlers.DELETE({ params: { id: 'list-1' }, request: deleteRequest() })

		expect(response.status).toBe(404)
		expect(deleteContact).not.toHaveBeenCalled()
	})
})
