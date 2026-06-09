import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getContactById, getPool, setContactAddressBooks, tableExists, updateContact } from '../../lib/db'
import { generateVCard } from '../../lib/vcard'
import { UpdateContactSchema } from '../../lib/schemas'

// db is mocked, but ../../lib/history is intentionally NOT mocked: we want the
// real recordHistory()/snapshotContact() path to run so this is a genuine
// regression test for the embedded-photo OOM, asserting that what gets written
// to contact_history stays small.
vi.mock('../../lib/db', () => ({
	getContactById: vi.fn(),
	updateContact: vi.fn(),
	deleteContact: vi.fn(),
	setContactAddressBooks: vi.fn(),
	getPool: vi.fn(),
	tableExists: vi.fn(),
}))

vi.mock('../../lib/logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../lib/vcard', () => ({
	extractUID: vi.fn().mockReturnValue('test-uid'),
	generateVCard: vi.fn(),
}))

vi.mock('../../lib/csv', () => ({
	normalizeBirthday: vi.fn((v: string | null) => v),
}))

vi.mock('../../lib/utils', () => ({
	normalizePhoneNumber: vi.fn((v: string | null) => v),
}))

vi.mock('../../lib/contact-helpers', () => ({
	sanitizeContact: vi.fn((c: Record<string, unknown>) => c),
	resolveAddressBookIds: vi.fn().mockResolvedValue([]),
	decodePhotoPayloadForUpdate: vi.fn().mockReturnValue({ hasPhotoUpdate: false }),
	zodError: vi.fn().mockReturnValue(Response.json({ error: 'Validation failed' }, { status: 400 })),
}))

vi.mock('../../lib/schemas', () => ({
	UpdateContactSchema: { safeParse: vi.fn() },
}))

const getHandlers = async () => {
	const mod = await import('./contacts.$id')
	const route = mod.Route as Record<string, unknown>
	const options = route.options as Record<string, unknown>
	const server = options.server as Record<string, unknown>
	return server.handlers as Record<string, (...args: Array<unknown>) => Promise<Response>>
}

describe('PUT /api/contacts/$id with a large embedded photo', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('succeeds and does not write multi-MB vcard_data into contact_history', async () => {
		// ~1.8MB vcard_data: a base64 PHOTO line embedded inline, the shape that
		// previously took the app down (502/OOM) on update.
		const hugeVcard = `BEGIN:VCARD\nVERSION:3.0\nFN:Shawn Hoffman\nPHOTO;ENCODING=b;TYPE=JPEG:${'A'.repeat(1_800_000)}\nEND:VCARD`
		const existingContact = {
			id: 'c1',
			full_name: 'Shawn Hoffman',
			email: 'shawn@example.com',
			vcard_id: 'test-uid',
			vcard_data: hugeVcard,
			photo_blob: Buffer.from('binary-photo-data'),
			photo_mime: 'image/jpeg',
		}

		vi.mocked(UpdateContactSchema.safeParse).mockReturnValue({
			success: true,
			data: { full_name: 'Shawn Hoffman', notes: 'edited' },
		} as never)
		const updatedContact = { ...existingContact, notes: 'edited' }
		vi.mocked(generateVCard).mockReturnValue(hugeVcard)
		// The handler reads the contact twice: the pre-update state, then the
		// post-update state it records as newState. They must differ or the
		// no-op idempotence guard skips the history write.
		vi.mocked(getContactById)
			.mockResolvedValueOnce(existingContact as never)
			.mockResolvedValueOnce(updatedContact as never)
		vi.mocked(updateContact).mockResolvedValue(updatedContact as never)
		vi.mocked(setContactAddressBooks).mockResolvedValue(undefined as never)

		const query = vi.fn().mockResolvedValue({ rows: [{ id: 'h1' }] })
		vi.mocked(getPool).mockReturnValue({ query } as never)
		vi.mocked(tableExists).mockResolvedValue(true as never)

		const handlers = await getHandlers()
		// A tiny request body, yet the contact it targets carries a 1.8MB photo.
		const request = new Request('http://localhost/api/contacts/c1', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ full_name: 'Shawn Hoffman', notes: 'edited' }),
		})

		const response = await handlers.PUT({ params: { id: 'c1' }, request })

		// The app stays up and the update succeeds.
		expect(response.status).toBe(200)

		// History was recorded, and the previous/new state payloads sent to
		// Postgres do NOT carry the multi-MB vcard_data blob.
		expect(query).toHaveBeenCalledTimes(1)
		const params = query.mock.calls[0][1] as Array<unknown>
		const previousState = params[9] as string | null
		const newState = params[10] as string | null
		expect(previousState).not.toContain('PHOTO')
		expect(newState).not.toContain('PHOTO')
		expect((previousState?.length ?? 0) + (newState?.length ?? 0)).toBeLessThan(10_000)
	})
})
