import { describe, expect, it } from 'vitest'
import { BINARY_MARKER, SNAPSHOT_TABLES, encodeSnapshotRow, encodeSnapshotValue } from './snapshot'

describe('encodeSnapshotValue', () => {
	it('passes primitives through', () => {
		expect(encodeSnapshotValue('hi')).toBe('hi')
		expect(encodeSnapshotValue(42)).toBe(42)
		expect(encodeSnapshotValue(true)).toBe(true)
		expect(encodeSnapshotValue(null)).toBeNull()
		expect(encodeSnapshotValue(undefined)).toBeNull()
	})

	it('carries buffers as base64 rather than byte arrays', () => {
		const photo = Buffer.from([137, 80, 78, 71])
		expect(encodeSnapshotValue(photo)).toEqual({ [BINARY_MARKER]: 'iVBORw==' })
		// The point of the marker: JSON.stringify would otherwise expand it.
		expect(JSON.stringify(encodeSnapshotValue(photo))).not.toContain('"data"')
	})

	it('handles Uint8Array views the same way', () => {
		expect(encodeSnapshotValue(new Uint8Array([137, 80, 78, 71]))).toEqual({ [BINARY_MARKER]: 'iVBORw==' })
	})

	it('renders dates as ISO strings and bigints as decimal strings', () => {
		expect(encodeSnapshotValue(new Date('2026-08-10T12:00:00.000Z'))).toBe('2026-08-10T12:00:00.000Z')
		expect(encodeSnapshotValue(10n ** 20n)).toBe('100000000000000000000')
	})

	it('walks arrays and nested objects, including jsonb payloads', () => {
		const encoded = encodeSnapshotValue({
			changed_fields: ['email', 'phone'],
			previous_state: { updated_at: new Date('2026-01-01T00:00:00.000Z'), photo: Buffer.from('ab') },
		})
		expect(encoded).toEqual({
			changed_fields: ['email', 'phone'],
			previous_state: { updated_at: '2026-01-01T00:00:00.000Z', photo: { [BINARY_MARKER]: 'YWI=' } },
		})
	})
})

describe('encodeSnapshotRow', () => {
	it('produces a JSON-serialisable row', () => {
		const row = encodeSnapshotRow({
			id: 'abc',
			full_name: 'Renée Ω',
			birthday: '1990-04-01',
			photo_blob: Buffer.from([1, 2, 3]),
			created_at: new Date('2026-08-10T12:00:00.000Z'),
			deleted_at: null,
		})
		expect(JSON.parse(JSON.stringify(row))).toEqual({
			id: 'abc',
			full_name: 'Renée Ω',
			birthday: '1990-04-01',
			photo_blob: { [BINARY_MARKER]: 'AQID' },
			created_at: '2026-08-10T12:00:00.000Z',
			deleted_at: null,
		})
	})
})

describe('SNAPSHOT_TABLES', () => {
	it('uses plain identifiers, which the builder interpolates into SQL', () => {
		for (const table of SNAPSHOT_TABLES) {
			expect(table.name).toMatch(/^[a-z_][a-z0-9_]*$/)
			expect(table.orderBy).toMatch(/^[a-z_, ]+$/)
		}
	})

	it('lists parents before children so a restore can insert in order', () => {
		const order = SNAPSHOT_TABLES.map(table => table.name)
		expect(order.indexOf('address_books')).toBeLessThan(order.indexOf('contact_address_books'))
		expect(order.indexOf('contacts')).toBeLessThan(order.indexOf('contact_address_books'))
		expect(order.indexOf('contacts')).toBeLessThan(order.indexOf('contact_relationships'))
		expect(order.indexOf('relationship_placeholders')).toBeLessThan(order.indexOf('contact_relationships'))
	})

	it('excludes tables that hold no user-authored data', () => {
		const names = SNAPSHOT_TABLES.map(table => table.name)
		for (const excluded of ['user', 'account', 'session', 'verification', 'path_migration_done', 'composite_users_migration_done']) {
			expect(names).not.toContain(excluded)
		}
	})
})
