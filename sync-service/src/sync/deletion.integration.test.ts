/**
 * Deleting a card on a device has to stick.
 *
 * Two things used to undo it. sync_source was overwritten with 'db' the first
 * time a card was written back out, which hid the fact that it had come from a
 * CardDAV client — and all three delete paths only honour a client-side delete
 * when sync_source is still 'radicale'. Then, even once the watcher did soft
 * delete the row, the next inbound pass restored it from the master directory,
 * which is this service's own mirror rather than a client collection.
 *
 * Requires Postgres on DATABASE_URL. Run via: bash scripts/test-integration.sh
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { Pool } from 'pg'
import { syncRadicaleToDb } from './radicale-to-db'
import { syncDbToRadicale } from './db-to-radicale'
import { startWatchingRadicale } from './watcher'
import { applyMigrations } from '../test-support/migrations'

const { STORAGE_PATH, mockUsers } = vi.hoisted(() => {
	// See groups.integration.test.ts: contacts.updated_at is zone-less, so
	// conflict resolution needs the process in the same zone as Postgres.
	process.env.TZ = 'UTC'
	return {
		STORAGE_PATH: `${(process.env.TMPDIR || '/tmp').replace(/\/$/, '')}/radicale-deletion-test-${process.pid}`,
		mockUsers: [] as Array<{ username: string }>,
	}
})

vi.mock('./constants', async importOriginal => ({
	...(await importOriginal<typeof import('./constants')>()),
	RADICALE_STORAGE_PATH: STORAGE_PATH,
	// The watcher debounces its inbound sync; keep the test brisk.
	FILE_WATCHER_DEBOUNCE_MS: 200,
}))

vi.mock('../htpasswd', async importOriginal => ({
	...(await importOriginal<typeof import('../htpasswd')>()),
	getUsers: async () => mockUsers,
}))

let pool: Pool

const OWNER = 'shawn'
const SUBSCRIBER = 'madison'
const collectionRoot = () => path.join(STORAGE_PATH, 'collection-root')
const userCollection = (username: string, bookId: string) => path.join(collectionRoot(), `${username}-${bookId}`)

const groupCard = (uid: string, name: string, memberUids: Array<string>) =>
	[
		'BEGIN:VCARD',
		'VERSION:3.0',
		`N:${name};;;;`,
		`FN:${name}`,
		'X-ADDRESSBOOKSERVER-KIND:group',
		...memberUids.map(member => `X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${member}`),
		`UID:${uid}`,
		'END:VCARD',
	].join('\r\n')

beforeAll(async () => {
	if (!process.env.DATABASE_URL) {
		throw new Error('DATABASE_URL must be set for integration tests')
	}
	pool = new Pool({ connectionString: process.env.DATABASE_URL })
	await applyMigrations(pool)
})

beforeEach(async () => {
	await pool.query('DELETE FROM contact_address_books')
	await pool.query('DELETE FROM contacts')
	await pool.query('DELETE FROM address_books')
	await pool.query('DELETE FROM purged_vcards')
	fs.rmSync(collectionRoot(), { recursive: true, force: true })
	fs.mkdirSync(collectionRoot(), { recursive: true })
	mockUsers.length = 0
})

afterAll(async () => {
	if (pool) await pool.end()
	fs.rmSync(STORAGE_PATH, { recursive: true, force: true })
})

async function createBook({ withSubscriber = false } = {}) {
	const result = await pool.query('INSERT INTO address_books (name, slug, is_public) VALUES ($1, $2, true) RETURNING *', [
		'Hoffman Extended',
		'hoffman-extended',
	])
	const book = result.rows[0]
	mockUsers.push({ username: OWNER }, { username: `${OWNER}-${book.id}` })
	if (withSubscriber) {
		mockUsers.push({ username: SUBSCRIBER }, { username: `${SUBSCRIBER}-${book.id}` })
	}
	return book
}

async function seedList(book: { id: string }) {
	const ownerDir = userCollection(OWNER, book.id)
	fs.mkdirSync(ownerDir, { recursive: true })
	fs.writeFileSync(path.join(ownerDir, 'group-1.vcf'), groupCard('group-1', 'CA Alpine Club', ['person-1']), 'utf-8')
	await syncRadicaleToDb(true)
	await syncDbToRadicale()
	return ownerDir
}

const personCard = (uid: string, name: string) =>
	['BEGIN:VCARD', 'VERSION:3.0', `N:${name};;;;`, `FN:${name}`, `UID:${uid}`, 'END:VCARD'].join('\r\n')

/** What the Trash page does: tombstone the id, then drop the row. */
async function purge(vcardId: string) {
	await pool.query('INSERT INTO purged_vcards (vcard_id) VALUES ($1) ON CONFLICT (vcard_id) DO UPDATE SET purged_at = NOW()', [vcardId])
	await pool.query('DELETE FROM contact_address_books WHERE contact_id IN (SELECT id FROM contacts WHERE vcard_id = $1)', [vcardId])
	await pool.query('DELETE FROM contacts WHERE vcard_id = $1', [vcardId])
}

const cardsOnDisk = (vcardId: string) =>
	fs.readdirSync(collectionRoot(), { recursive: true }).filter(entry => String(entry).endsWith(`${vcardId}.vcf`)).length

const rowCount = async (vcardId: string) =>
	Number((await pool.query('SELECT COUNT(*)::int AS n FROM contacts WHERE vcard_id = $1', [vcardId])).rows[0].n)

const tombstoneCount = async (vcardId: string) =>
	Number((await pool.query('SELECT COUNT(*)::int AS n FROM purged_vcards WHERE vcard_id = $1', [vcardId])).rows[0].n)

describe('deleting a card from a CardDAV client', () => {
	it('keeps the card marked as Radicale-authored after it is written back out', async () => {
		// Provenance is the precondition every delete path checks. Overwriting it
		// with 'db' here is what silently disabled client-side deletes.
		const book = await createBook()
		await seedList(book)

		const result = await pool.query('SELECT sync_source FROM contacts WHERE vcard_id = $1', ['group-1'])
		expect(result.rows[0].sync_source).toBe('radicale')
	})

	it('removes the list everywhere instead of restoring it from the master mirror', async () => {
		const book = await createBook()
		const ownerDir = await seedList(book)

		await startWatchingRadicale()
		await new Promise(resolve => setTimeout(resolve, 300))

		// The user deletes the list on their Mac; Radicale removes the file.
		fs.unlinkSync(path.join(ownerDir, 'group-1.vcf'))
		await new Promise(resolve => setTimeout(resolve, 1500))

		const deleted = await pool.query('SELECT deleted_at FROM contacts WHERE vcard_id = $1', ['group-1'])
		expect(deleted.rows[0]?.deleted_at).not.toBeNull()

		// The orphan sweep then clears the mirror and the user's own collection.
		await syncDbToRadicale()
		expect(fs.existsSync(path.join(ownerDir, 'group-1.vcf'))).toBe(false)
		expect(fs.existsSync(path.join(collectionRoot(), book.id, 'group-1.vcf'))).toBe(false)
	}, 20000)

	it("removes the list from every other subscriber's collection too", async () => {
		// The book is shared, so one person deleting a list deletes it for
		// everyone. Without clearing the peer copies at delete time, the debounced
		// inbound sync restores the contact from the subscriber's still-present
		// file and the delete silently undoes itself.
		const book = await createBook({ withSubscriber: true })
		const ownerDir = await seedList(book)
		const subscriberCard = path.join(userCollection(SUBSCRIBER, book.id), 'group-1.vcf')
		expect(fs.existsSync(subscriberCard)).toBe(true)

		await startWatchingRadicale()
		await new Promise(resolve => setTimeout(resolve, 300))

		fs.unlinkSync(path.join(ownerDir, 'group-1.vcf'))
		await new Promise(resolve => setTimeout(resolve, 1500))

		const deleted = await pool.query('SELECT deleted_at FROM contacts WHERE vcard_id = $1', ['group-1'])
		expect(deleted.rows[0]?.deleted_at).not.toBeNull()
		expect(fs.existsSync(subscriberCard)).toBe(false)
		expect(fs.existsSync(path.join(collectionRoot(), book.id, 'group-1.vcf'))).toBe(false)
	}, 20000)
})

/**
 * Emptying the trash removes the row, but the cards sit in Radicale until the
 * outbound sweep clears them. Anything reading disk in between - the inbound
 * half of the tick, or the startup pass after a restart - saw a card with no
 * row behind it and read it as a new contact, so the purged contact came back.
 */
describe('permanently deleting a contact', () => {
	async function seedPerson(book: { id: string }) {
		const ownerDir = userCollection(OWNER, book.id)
		fs.mkdirSync(ownerDir, { recursive: true })
		fs.writeFileSync(path.join(ownerDir, 'person-1.vcf'), personCard('person-1', 'Shawn Hoffman'), 'utf-8')
		await syncRadicaleToDb(true)
		await syncDbToRadicale()
		return ownerDir
	}

	it('does not come back on the next inbound pass', async () => {
		const book = await createBook({ withSubscriber: true })
		await seedPerson(book)
		expect(cardsOnDisk('person-1')).toBeGreaterThan(0)

		await purge('person-1')
		await syncRadicaleToDb(true)

		expect(await rowCount('person-1')).toBe(0)
	})

	it('comes back without the tombstone, which is the whole point of it', async () => {
		// Pins the mechanism: the same purge with no tombstone recreates the row,
		// which is what the Trash page used to do.
		const book = await createBook({ withSubscriber: true })
		await seedPerson(book)

		await pool.query('DELETE FROM contact_address_books WHERE contact_id IN (SELECT id FROM contacts WHERE vcard_id = $1)', ['person-1'])
		await pool.query('DELETE FROM contacts WHERE vcard_id = $1', ['person-1'])
		await syncRadicaleToDb(true)

		expect(await rowCount('person-1')).toBe(1)
	})

	it('clears the cards from every collection, then forgets the tombstone', async () => {
		const book = await createBook({ withSubscriber: true })
		await seedPerson(book)

		await purge('person-1')
		await syncRadicaleToDb(true)

		// Still on disk, so the tombstone has to stay: dropping it here would let
		// the very next pass resurrect the contact.
		expect(cardsOnDisk('person-1')).toBeGreaterThan(0)
		expect(await tombstoneCount('person-1')).toBe(1)

		await syncDbToRadicale()
		expect(cardsOnDisk('person-1')).toBe(0)

		// Nothing left to resurrect, so the tombstone retires rather than
		// accumulating - and a UID reused later is not blocked forever.
		await syncRadicaleToDb(true)
		expect(await tombstoneCount('person-1')).toBe(0)
		expect(await rowCount('person-1')).toBe(0)
	})

	it('survives a restart with the purge already done', async () => {
		// The case that predates the periodic inbound pass: purge while the sync
		// service is down, then start it, and the startup pass reads disk first.
		const book = await createBook({ withSubscriber: true })
		await seedPerson(book)
		await purge('person-1')

		await syncRadicaleToDb(true)
		await syncDbToRadicale()
		await syncRadicaleToDb(true)

		expect(await rowCount('person-1')).toBe(0)
		expect(cardsOnDisk('person-1')).toBe(0)
	})
})
