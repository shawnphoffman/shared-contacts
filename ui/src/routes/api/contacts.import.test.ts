import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createContact, findDuplicateContact, getContactByVcardId, updateContact } from '../../lib/db'

vi.mock('../../lib/db', () => ({
	createContact: vi.fn(),
	updateContact: vi.fn(),
	findDuplicateContact: vi.fn(),
	getContactByVcardId: vi.fn(),
	getAddressBookBySlug: vi.fn(),
	setContactAddressBooks: vi.fn(),
}))

vi.mock('../../lib/logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../lib/history', () => ({
	actorFromRequest: vi.fn().mockReturnValue({ actor: null, actorType: null, userAgent: null, clientIp: null, source: 'web' }),
	recordHistory: vi.fn(),
}))

vi.mock('../../lib/contact-helpers', () => ({
	BadPhotoError: class BadPhotoError extends Error {},
	decodePhotoPayload: vi.fn().mockReturnValue({ photo_mime: 'image/png' }),
}))

const CARD = [
	'BEGIN:VCARD',
	'VERSION:3.0',
	'N:Hoffman;Shawn;;;',
	'FN:Shawn Hoffman',
	'EMAIL;TYPE=HOME:shawn@example.com',
	'TEL;TYPE=CELL:+15555550123',
	'UID:shawn-uid-1',
	'END:VCARD',
].join('\r\n')

const getHandlers = async () => {
	const mod = await import('./contacts.import')
	const route = mod.Route as Record<string, unknown>
	const options = route.options as Record<string, unknown>
	const server = options.server as Record<string, unknown>
	return server.handlers as Record<string, (...args: Array<unknown>) => Promise<Response>>
}

function upload(name: string, body: string): { request: Request } {
	const formData = new FormData()
	formData.append('file', new File([body], name, { type: 'text/plain' }))
	return { request: new Request('http://localhost/api/contacts/import', { method: 'POST', body: formData }) }
}

beforeEach(() => {
	vi.clearAllMocks()
	vi.mocked(findDuplicateContact).mockResolvedValue(null)
	vi.mocked(getContactByVcardId).mockResolvedValue(null)
	vi.mocked(createContact).mockImplementation(contact => Promise.resolve({ id: 'new-id', ...contact } as never))
	vi.mocked(updateContact).mockImplementation((id, contact) => Promise.resolve({ id, ...contact } as never))
})

describe('POST /api/contacts/import', () => {
	it('refuses a file that is neither CSV nor vCard', async () => {
		const handlers = await getHandlers()
		const response = await handlers.POST(upload('contacts.txt', 'whatever'))
		expect(response.status).toBe(400)
	})

	it('imports a vCard, keeping the card and its UID', async () => {
		// Export produced .vcf while import took CSV only, so the app could not
		// read its own output.
		const handlers = await getHandlers()
		const response = await handlers.POST(upload('contacts.vcf', CARD))

		expect(response.status).toBe(200)
		expect(createContact).toHaveBeenCalledTimes(1)
		const created = vi.mocked(createContact).mock.calls[0][0]
		expect(created.full_name).toBe('Shawn Hoffman')
		expect(created.email).toBe('shawn@example.com')
		expect(created.phones).toEqual([{ value: '+15555550123', type: 'CELL' }])
		expect(created.vcard_id).toBe('shawn-uid-1')
		// The card is stored as it arrived, so properties this app does not model
		// survive the round trip.
		expect(created.vcard_data).toContain('UID:shawn-uid-1')
	})

	it('updates the contact a re-imported card came from instead of duplicating it', async () => {
		vi.mocked(getContactByVcardId).mockResolvedValue({ id: 'existing-id', full_name: 'Shawn Hoffman' } as never)
		const handlers = await getHandlers()

		await handlers.POST(upload('contacts.vcf', CARD))

		expect(getContactByVcardId).toHaveBeenCalledWith('shawn-uid-1')
		expect(updateContact).toHaveBeenCalledTimes(1)
		expect(createContact).not.toHaveBeenCalled()
	})

	it('imports every card in a multi-card file', async () => {
		const handlers = await getHandlers()
		const second = CARD.replace('shawn-uid-1', 'other-uid').replace('Shawn Hoffman', 'Other Person')

		const response = await handlers.POST(upload('contacts.vcf', `${CARD}\r\n${second}`))

		expect(await response.json()).toMatchObject({ success: 2 })
	})

	it('still imports a CSV', async () => {
		const handlers = await getHandlers()
		const csv = 'full_name,email\r\nMadison Hoffman,madison@example.com'

		const response = await handlers.POST(upload('contacts.csv', csv))

		expect(response.status).toBe(200)
		expect(createContact).toHaveBeenCalledTimes(1)
		expect(vi.mocked(createContact).mock.calls[0][0].full_name).toBe('Madison Hoffman')
	})

	it('reports an empty file rather than claiming success', async () => {
		const handlers = await getHandlers()
		const response = await handlers.POST(upload('contacts.vcf', 'not a vcard at all'))
		expect(response.status).toBe(400)
	})
})
