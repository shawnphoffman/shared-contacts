import { describe, it, expect } from 'vitest'
import { diffContacts, snapshotContact } from './history'

describe('snapshotContact', () => {
	it('returns null for null/undefined', () => {
		expect(snapshotContact(null)).toBeNull()
		expect(snapshotContact(undefined)).toBeNull()
	})

	it('omits photo_blob from snapshots', () => {
		const result = snapshotContact({
			id: '1',
			full_name: 'Jane',
			photo_blob: Buffer.from('big binary'),
			photo_mime: 'image/jpeg',
		})
		expect(result).not.toHaveProperty('photo_blob')
		expect(result?.photo_mime).toBe('image/jpeg')
	})

	it('drops bare Buffer values it encounters', () => {
		const result = snapshotContact({ id: '1', some_buffer: Buffer.from('x') })
		expect(result).not.toHaveProperty('some_buffer')
	})

	it('serializes Date instances to ISO strings', () => {
		const created = new Date('2024-05-01T12:00:00Z')
		const result = snapshotContact({ id: '1', created_at: created })
		expect(result?.created_at).toBe('2024-05-01T12:00:00.000Z')
	})

	it('passes through plain JSON-able values', () => {
		const result = snapshotContact({
			id: '1',
			emails: [{ value: 'a@b.com', type: 'INTERNET' }],
			notes: 'hello',
		})
		expect(result?.emails).toEqual([{ value: 'a@b.com', type: 'INTERNET' }])
		expect(result?.notes).toBe('hello')
	})
})

describe('diffContacts', () => {
	it('returns all visible keys when prev is null (create)', () => {
		const fields = diffContacts(null, { id: '1', full_name: 'Jane', updated_at: 'x' })
		expect(fields).toContain('id')
		expect(fields).toContain('full_name')
		expect(fields).not.toContain('updated_at')
	})

	it('returns all visible keys when next is null (delete)', () => {
		const fields = diffContacts({ id: '1', full_name: 'Jane' }, null)
		expect(fields).toContain('full_name')
	})

	it('returns empty array when prev and next are equal', () => {
		const a = { id: '1', full_name: 'Jane', emails: [{ value: 'a@b.com' }] }
		const b = { id: '1', full_name: 'Jane', emails: [{ value: 'a@b.com' }] }
		expect(diffContacts(a, b)).toEqual([])
	})

	it('detects changed scalar fields', () => {
		const fields = diffContacts({ id: '1', full_name: 'Jane' }, { id: '1', full_name: 'Janet' })
		expect(fields).toEqual(['full_name'])
	})

	it('detects changes inside JSON arrays', () => {
		const fields = diffContacts({ emails: [{ value: 'a@b.com', type: 'INTERNET' }] }, { emails: [{ value: 'a@b.com', type: 'WORK' }] })
		expect(fields).toEqual(['emails'])
	})

	it('treats undefined and null as equivalent', () => {
		const fields = diffContacts({ id: '1', nickname: null }, { id: '1', nickname: undefined })
		expect(fields).toEqual([])
	})

	it('ignores sync metadata fields', () => {
		const fields = diffContacts(
			{ id: '1', updated_at: '2024-01-01', vcard_hash: 'a', sync_source: 'api', radicale_file_mtime: 'x' },
			{ id: '1', updated_at: '2024-02-01', vcard_hash: 'b', sync_source: 'radicale', radicale_file_mtime: 'y' }
		)
		expect(fields).toEqual([])
	})

	it('returns added/removed keys', () => {
		const fields = diffContacts({ id: '1' }, { id: '1', nickname: 'JJ' })
		expect(fields).toEqual(['nickname'])
	})
})
