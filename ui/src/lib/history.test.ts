import { describe, expect, it } from 'vitest'

import { actorFromRequest, diffContacts, snapshotContact } from './history'

describe('snapshotContact', () => {
	it('returns null for null/undefined', () => {
		expect(snapshotContact(null)).toBeNull()
		expect(snapshotContact(undefined)).toBeNull()
	})

	it('omits photo_blob', () => {
		const result = snapshotContact({ id: '1', photo_blob: Buffer.from('blob'), photo_mime: 'image/png' })
		expect(result).not.toHaveProperty('photo_blob')
		expect(result?.photo_mime).toBe('image/png')
	})

	it('omits vcard_data so embedded-photo blobs do not bloat history rows', () => {
		// vcard_data with an embedded base64 PHOTO line is multi-MB for some
		// contacts; storing it (twice, in previous_state + new_state) OOM'd the
		// process. It is regenerated on undo, so the snapshot must drop it.
		const bigPhotoLine = `PHOTO;ENCODING=b;TYPE=JPEG:${'A'.repeat(1_800_000)}`
		const vcardData = `BEGIN:VCARD\nVERSION:3.0\nFN:Shawn Hoffman\n${bigPhotoLine}\nEND:VCARD`
		const result = snapshotContact({ id: '1', full_name: 'Shawn Hoffman', vcard_data: vcardData })
		expect(result).not.toHaveProperty('vcard_data')
		expect(result?.full_name).toBe('Shawn Hoffman')
		// The serialized snapshot must stay tiny, not carry the 1.8MB blob.
		expect(JSON.stringify(result).length).toBeLessThan(1_000)
	})

	it('drops node Buffer values', () => {
		const result = snapshotContact({ id: '1', some_buffer: Buffer.from('x') })
		expect(result).not.toHaveProperty('some_buffer')
	})

	it('drops serialized Buffer-shaped objects (e.g. JSON-roundtripped buffers)', () => {
		const result = snapshotContact({ id: '1', some_buffer: { type: 'Buffer', data: [1, 2, 3] } })
		expect(result).not.toHaveProperty('some_buffer')
	})

	it('serializes Date instances to ISO strings', () => {
		const created = new Date('2024-05-01T12:00:00Z')
		const result = snapshotContact({ id: '1', created_at: created })
		expect(result?.created_at).toBe('2024-05-01T12:00:00.000Z')
	})
})

describe('diffContacts', () => {
	it('returns empty array for identical snapshots', () => {
		expect(diffContacts({ id: '1', full_name: 'Jane' }, { id: '1', full_name: 'Jane' })).toEqual([])
	})

	it('detects scalar changes', () => {
		expect(diffContacts({ full_name: 'Jane' }, { full_name: 'Janet' })).toEqual(['full_name'])
	})

	it('detects array changes via JSON.stringify', () => {
		expect(diffContacts({ emails: [{ value: 'a@b.com', type: 'INTERNET' }] }, { emails: [{ value: 'a@b.com', type: 'WORK' }] })).toEqual([
			'emails',
		])
	})

	it('treats null and undefined as equivalent', () => {
		expect(diffContacts({ nickname: null }, { nickname: undefined })).toEqual([])
	})

	it('ignores sync metadata fields', () => {
		expect(
			diffContacts(
				{ updated_at: '2024-01-01', vcard_hash: 'a', sync_source: 'api', last_synced_to_radicale_at: 't1' },
				{ updated_at: '2024-02-01', vcard_hash: 'b', sync_source: 'radicale', last_synced_to_radicale_at: 't2' }
			)
		).toEqual([])
	})

	it('returns content fields when next is null', () => {
		const fields = diffContacts({ id: '1', full_name: 'Jane', updated_at: 'x' }, null)
		expect(fields).toContain('full_name')
		expect(fields).not.toContain('updated_at')
	})
})

describe('actorFromRequest', () => {
	it('falls back to web source when no headers are present', () => {
		const result = actorFromRequest(new Request('http://localhost/api/anything'))
		expect(result.actor).toBeNull()
		expect(result.actorType).toBeNull()
		expect(result.source).toBe('web')
	})

	it('reads x-actor and tags actorType=user', () => {
		const result = actorFromRequest(
			new Request('http://localhost/api/anything', { headers: { 'x-actor': 'alice', 'user-agent': 'test/1.0' } })
		)
		expect(result.actor).toBe('alice')
		expect(result.actorType).toBe('user')
		expect(result.userAgent).toBe('test/1.0')
	})

	it('falls back to x-user-name when x-actor is missing', () => {
		const result = actorFromRequest(new Request('http://localhost/api/anything', { headers: { 'x-user-name': 'bob' } }))
		expect(result.actor).toBe('bob')
	})

	it('extracts the leftmost IP from x-forwarded-for', () => {
		const result = actorFromRequest(
			new Request('http://localhost/api/anything', { headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.1' } })
		)
		expect(result.clientIp).toBe('203.0.113.1')
	})

	it('honors x-source override', () => {
		const result = actorFromRequest(new Request('http://localhost/api/anything', { headers: { 'x-source': 'import' } }))
		expect(result.source).toBe('import')
	})
})
