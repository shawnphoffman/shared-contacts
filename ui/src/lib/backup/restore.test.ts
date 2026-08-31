import { describe, expect, it } from 'vitest'
import { BINARY_MARKER, SNAPSHOT_FORMAT, SNAPSHOT_VERSION } from './snapshot'
import { InvalidSnapshotError, decodeSnapshotValue, parseSnapshot, readSnapshotFromArchive } from './restore'
import { createTarGz, readTarGz } from './tar'

const validSnapshot = {
	format: SNAPSHOT_FORMAT,
	version: SNAPSHOT_VERSION,
	createdAt: '2026-08-31T00:00:00.000Z',
	appVersion: '1.12.0',
	counts: { contacts: 1 },
	skippedTables: [],
	tables: { contacts: [{ id: '1', full_name: 'Shawn Hoffman' }] },
}

describe('decodeSnapshotValue', () => {
	it('turns a binary marker back into a Buffer', () => {
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
		const decoded = decodeSnapshotValue({ [BINARY_MARKER]: png.toString('base64') })
		expect(Buffer.isBuffer(decoded)).toBe(true)
		expect(decoded).toEqual(png)
	})

	it('leaves an object that merely has that key alone', () => {
		// A contact's custom_fields could hold anything; only the exact
		// single-key marker shape is ours.
		const value = { [BINARY_MARKER]: 'abc', label: 'not a marker' }
		expect(decodeSnapshotValue(value)).toEqual(value)
	})

	it('recurses through arrays and nested objects', () => {
		const decoded = decodeSnapshotValue([{ photo: { [BINARY_MARKER]: Buffer.from('hi').toString('base64') } }]) as Array<{
			photo: Buffer
		}>
		expect(decoded[0].photo).toEqual(Buffer.from('hi'))
	})

	it('normalizes undefined to null', () => {
		expect(decodeSnapshotValue(undefined)).toBeNull()
	})
})

describe('parseSnapshot', () => {
	it('accepts a snapshot this version wrote', () => {
		expect(parseSnapshot(JSON.stringify(validSnapshot)).counts).toEqual({ contacts: 1 })
	})

	it('refuses a file that is not one of ours', () => {
		expect(() => parseSnapshot(JSON.stringify({ ...validSnapshot, format: 'something-else' }))).toThrow(InvalidSnapshotError)
	})

	it('refuses a version it does not understand', () => {
		// Better to stop than to half-restore a shape whose meaning has changed.
		expect(() => parseSnapshot(JSON.stringify({ ...validSnapshot, version: 99 }))).toThrow(InvalidSnapshotError)
	})

	it('refuses a snapshot with no tables, or a table that is not rows', () => {
		expect(() => parseSnapshot(JSON.stringify({ ...validSnapshot, tables: undefined }))).toThrow(InvalidSnapshotError)
		expect(() => parseSnapshot(JSON.stringify({ ...validSnapshot, tables: { contacts: 'nope' } }))).toThrow(InvalidSnapshotError)
	})
})

describe('reading an archive', () => {
	const archive = () =>
		createTarGz([
			{ name: 'backup-root', directory: true },
			{ name: 'backup-root/README.txt', data: 'notes' },
			{ name: 'backup-root/snapshot.json', data: JSON.stringify(validSnapshot) },
			{ name: 'backup-root/contacts.csv', data: 'full_name\r\nShawn Hoffman' },
		])

	it('round-trips through the tar writer', () => {
		const files = readTarGz(archive())
		expect(files.map(file => file.name)).toEqual(['backup-root/README.txt', 'backup-root/snapshot.json', 'backup-root/contacts.csv'])
		expect(files[0].data.toString('utf-8')).toBe('notes')
	})

	it('finds the snapshot inside a real archive', () => {
		expect(readSnapshotFromArchive(archive()).tables.contacts).toHaveLength(1)
	})

	it('says so when the archive holds no snapshot', () => {
		const withoutSnapshot = createTarGz([{ name: 'backup-root/README.txt', data: 'notes' }])
		expect(() => readSnapshotFromArchive(withoutSnapshot)).toThrow(InvalidSnapshotError)
	})
})
