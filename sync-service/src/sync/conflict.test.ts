import { describe, it, expect } from 'vitest'
import { calculateVCardHash, detectConflict, resolveConflict } from './conflict'
import type { Contact } from '../db'

function makeContact(overrides: Partial<Contact> = {}): Contact {
	return {
		id: 'test-id',
		vcard_id: 'test-vcard-id',
		full_name: 'Test',
		first_name: null,
		last_name: null,
		middle_name: null,
		name_prefix: null,
		name_suffix: null,
		nickname: null,
		maiden_name: null,
		email: null,
		phone: null,
		phones: null,
		emails: null,
		organization: null,
		org_units: null,
		job_title: null,
		role: null,
		address: null,
		addresses: null,
		address_street: null,
		address_extended: null,
		address_city: null,
		address_state: null,
		address_postal: null,
		address_country: null,
		birthday: null,
		homepage: null,
		urls: null,
		categories: null,
		labels: null,
		logos: null,
		sounds: null,
		keys: null,
		mailer: null,
		time_zone: null,
		geo: null,
		agent: null,
		prod_id: null,
		revision: null,
		sort_string: null,
		class: null,
		custom_fields: null,
		notes: null,
		photo_blob: null,
		photo_mime: null,
		photo_width: null,
		photo_height: null,
		photo_updated_at: null,
		photo_hash: null,
		vcard_data: null,
		created_at: new Date('2024-01-01'),
		updated_at: new Date('2024-06-01'),
		last_synced_from_radicale_at: null,
		last_synced_to_radicale_at: null,
		vcard_hash: null,
		sync_source: null,
		radicale_file_mtime: null,
		deleted_at: null,
		...overrides,
	} as Contact
}

// ---------------------------------------------------------------------------
// calculateVCardHash
// ---------------------------------------------------------------------------
describe('calculateVCardHash', () => {
	it('returns a hex string', () => {
		const hash = calculateVCardHash('BEGIN:VCARD\nFN:Test\nEND:VCARD')
		expect(hash).toMatch(/^[a-f0-9]{64}$/)
	})

	it('returns same hash for same content', () => {
		const content = 'BEGIN:VCARD\nFN:Test\nEND:VCARD'
		expect(calculateVCardHash(content)).toBe(calculateVCardHash(content))
	})

	it('returns different hash for different content', () => {
		const hash1 = calculateVCardHash('BEGIN:VCARD\nFN:Alice\nEND:VCARD')
		const hash2 = calculateVCardHash('BEGIN:VCARD\nFN:Bob\nEND:VCARD')
		expect(hash1).not.toBe(hash2)
	})
})

// ---------------------------------------------------------------------------
// detectConflict
// ---------------------------------------------------------------------------
describe('detectConflict', () => {
	it('detects no conflict when never synced (both assumed modified but no existing hash)', () => {
		const contact = makeContact({ vcard_hash: null })
		const result = detectConflict(contact, new Date('2024-07-01'), 'some-hash', 'db-to-radicale')
		// No conflict because vcard_hash is null (never had a hash to compare)
		expect(result.hasConflict).toBe(false)
	})

	it('detects conflict when both modified and hashes differ', () => {
		const contact = makeContact({
			updated_at: new Date('2024-07-01'),
			last_synced_to_radicale_at: new Date('2024-05-01'),
			last_synced_from_radicale_at: new Date('2024-05-01'),
			vcard_hash: 'old-hash',
		})
		const result = detectConflict(contact, new Date('2024-07-02'), 'new-radicale-hash', 'db-to-radicale')
		expect(result.hasConflict).toBe(true)
	})

	it('no conflict when hashes match', () => {
		const hash = calculateVCardHash('same content')
		const contact = makeContact({
			updated_at: new Date('2024-07-01'),
			last_synced_to_radicale_at: new Date('2024-05-01'),
			last_synced_from_radicale_at: new Date('2024-05-01'),
			vcard_hash: hash,
		})
		const result = detectConflict(contact, new Date('2024-07-02'), hash, 'db-to-radicale')
		expect(result.hasConflict).toBe(false)
	})

	it('correctly determines which is newer', () => {
		const contact = makeContact({ updated_at: new Date('2024-08-01') })
		const result = detectConflict(contact, new Date('2024-07-01'), 'hash', 'db-to-radicale')
		expect(result.dbNewer).toBe(true)
		expect(result.radicaleNewer).toBe(false)
	})

	it('handles null radicale mtime as epoch', () => {
		const contact = makeContact({ updated_at: new Date('2024-01-01') })
		const result = detectConflict(contact, null, 'hash', 'db-to-radicale')
		expect(result.dbNewer).toBe(true)
		expect(result.radicaleTimestamp.getTime()).toBe(0)
	})
})

// ---------------------------------------------------------------------------
// resolveConflict
// ---------------------------------------------------------------------------
describe('resolveConflict', () => {
	it('returns db when db is newer', () => {
		const result = resolveConflict({
			hasConflict: true,
			dbNewer: true,
			radicaleNewer: false,
			dbTimestamp: new Date('2024-08-01'),
			radicaleTimestamp: new Date('2024-07-01'),
		})
		expect(result).toBe('db')
	})

	it('returns radicale when radicale is newer', () => {
		const result = resolveConflict({
			hasConflict: true,
			dbNewer: false,
			radicaleNewer: true,
			dbTimestamp: new Date('2024-07-01'),
			radicaleTimestamp: new Date('2024-08-01'),
		})
		expect(result).toBe('radicale')
	})
})
