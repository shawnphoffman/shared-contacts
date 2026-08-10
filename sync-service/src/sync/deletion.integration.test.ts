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
