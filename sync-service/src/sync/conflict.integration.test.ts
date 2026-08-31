/**
 * What happens to the edit that loses a conflict.
 *
 * Resolution is last-write-wins, and the losing edit is gone: nothing merges
 * it, nothing warns anyone. Two things are pinned here. First, that the
 * winning side actually sticks - the inbound pass stamps
 * last_synced_from_radicale_at when it defers to the database, and that stamp
 * switches off its own conflict guard for the following pass, so a second
 * inbound with no outbound between them silently overwrites the row that just
 * won. Second, that the discarded edit leaves a record behind in
 * contact_history rather than only a log line.
 *
 * Requires Postgres on DATABASE_URL with migrations applied.
 * Run via: bash scripts/test-integration.sh
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { Pool } from 'pg'
import { syncRadicaleToDb } from './radicale-to-db'
import { syncDbToRadicale } from './db-to-radicale'
import { applyMigrations } from '../test-support/migrations'

const { STORAGE_PATH, mockUsers } = vi.hoisted(() => {
	process.env.TZ = 'UTC'
	return {
		STORAGE_PATH: `${(process.env.TMPDIR || '/tmp').replace(/\/$/, '')}/radicale-conflict-test-${process.pid}`,
		mockUsers: [] as Array<{ username: string }>,
	}
})

vi.mock('./constants', async importOriginal => ({
	...(await importOriginal<typeof import('./constants')>()),
	RADICALE_STORAGE_PATH: STORAGE_PATH,
}))

vi.mock('../htpasswd', async importOriginal => ({
	...(await importOriginal<typeof import('../htpasswd')>()),
	getUsers: async () => mockUsers,
}))

let pool: Pool

const OWNER = 'shawn'
const UID = 'conflicted-card'

const collectionRoot = () => path.join(STORAGE_PATH, 'collection-root')
const userCollection = (bookId: string) => path.join(collectionRoot(), `${OWNER}-${bookId}`)

function personCard(fullName: string): string {
	return ['BEGIN:VCARD', 'VERSION:3.0', `N:${fullName};;;;`, `FN:${fullName}`, `UID:${UID}`, 'END:VCARD'].join('\r\n')
}

/** The periodic tick, in the order scheduler.ts runs it: inbound, then outbound. */
async function periodicTick() {
	await syncRadicaleToDb(true)
	await syncDbToRadicale()
}

function writeCardWithMtime(dir: string, content: string, mtime: Date) {
	fs.mkdirSync(dir, { recursive: true })
	const file = path.join(dir, `${UID}.vcf`)
	fs.writeFileSync(file, content, 'utf-8')
	fs.utimesSync(file, mtime, mtime)
}

beforeAll(async () => {
	const dbUrl = process.env.DATABASE_URL
	if (!dbUrl) {
		throw new Error('DATABASE_URL must be set for integration tests')
	}
	pool = new Pool({ connectionString: dbUrl })
	await applyMigrations(pool)
})

beforeEach(async () => {
	await pool.query('DELETE FROM contact_history')
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

async function createBookWithCard() {
	const result = await pool.query('INSERT INTO address_books (name, slug, is_public) VALUES ($1, $2, true) RETURNING *', [
		'Hoffman Extended',
		'hoffman-extended',
	])
	const book = result.rows[0]
	mockUsers.push({ username: OWNER }, { username: `${OWNER}-${book.id}` })

	writeCardWithMtime(userCollection(book.id), personCard('Original Name'), new Date())
	await syncRadicaleToDb(true)
	await syncDbToRadicale()
	return book
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000)
const minutesAhead = (n: number) => new Date(Date.now() + n * 60_000)

const masterCard = (bookId: string) => path.join(collectionRoot(), bookId, `${UID}.vcf`)
const userCard = (bookId: string) => path.join(userCollection(bookId), `${UID}.vcf`)

/**
 * Push the sync watermarks back so both sides' edits land after them, which is
 * what the conflict guards test for.
 */
async function loosenWatermarks() {
	await pool.query(
		`UPDATE contacts
		 SET last_synced_from_radicale_at = NOW() - interval '10 minutes',
		     last_synced_to_radicale_at = NOW() - interval '10 minutes'`
	)
}

/**
 * An edit made in the web UI. vcard_data has to move with full_name: the
 * outbound pass writes the stored vCard text verbatim when it has one, so a row
 * whose name changed but whose vcard_data didn't would write the old card back
 * out. updated_at cannot be dictated - a BEFORE UPDATE trigger restamps it to
 * NOW() - so it is always "just now", and the file mtimes below are what decide
 * which side counts as newer.
 */
async function editInApp(name: string) {
	await pool.query('UPDATE contacts SET full_name = $1, vcard_data = $2', [name, personCard(name)])
}

/**
 * An edit made on a device: it lands in that user's collection only, and the
 * master mirror still holds the old copy. The mirror's mtime is pushed back so
 * the inbound pass picks the user's copy as the newest of the two.
 */
function editOnDevice(bookId: string, name: string, mtime: Date) {
	writeCardWithMtime(userCollection(bookId), personCard(name), mtime)
	fs.utimesSync(masterCard(bookId), minutesAgo(2), minutesAgo(2))
}

const nameInDb = async () => (await pool.query('SELECT full_name FROM contacts')).rows[0]?.full_name
const nameIn = (file: string) =>
	fs
		.readFileSync(file, 'utf-8')
		.match(/^FN:(.+)$/m)?.[1]
		?.trim()
const discardRecords = async () =>
	(await pool.query(`SELECT summary, metadata FROM contact_history WHERE operation = 'conflict_discard' ORDER BY created_at`)).rows

describe('an edit that loses a conflict', () => {
	it('takes the device version when that is the newer one', async () => {
		const book = await createBookWithCard()
		await loosenWatermarks()
		await editInApp('Edited In The App')
		editOnDevice(book.id, 'Edited On The Phone', minutesAhead(5))

		await periodicTick()

		expect(await nameInDb()).toBe('Edited On The Phone')
		expect(nameIn(masterCard(book.id))).toBe('Edited On The Phone')
	})

	it('keeps the app version when that is the newer one, and does not undo it later', async () => {
		const book = await createBookWithCard()
		await loosenWatermarks()
		editOnDevice(book.id, 'Edited On The Phone', minutesAgo(1))
		await editInApp('Edited In The App')

		await periodicTick()

		expect(await nameInDb()).toBe('Edited In The App')
		expect(nameIn(userCard(book.id))).toBe('Edited In The App')

		// The resolution has to survive. Deferring to the database stamps
		// last_synced_from_radicale_at, which switches the inbound conflict guard
		// off for the next pass, so it is the outbound half of the tick that has
		// to have written the winning version to disk.
		await periodicTick()
		await periodicTick()

		expect(await nameInDb()).toBe('Edited In The App')
		expect(nameIn(userCard(book.id))).toBe('Edited In The App')
	})

	it('records the discarded device edit rather than only logging it', async () => {
		const book = await createBookWithCard()
		await loosenWatermarks()
		editOnDevice(book.id, 'Edited On The Phone', minutesAgo(1))
		await editInApp('Edited In The App')

		await periodicTick()

		const records = await discardRecords()
		expect(records.length).toBeGreaterThan(0)
		expect(records.every(row => row.metadata.vcardId === UID)).toBe(true)
		expect(records.some(row => row.metadata.discarded === 'carddav')).toBe(true)
		expect(records[0].summary).toContain('Conflict')
	})

	it('records the discarded app edit when the outbound pass defers to the file', async () => {
		// The outbound pass on its own, as it runs at startup: the mirror already
		// holds a newer card than the row, so the write is skipped and the edit
		// made in the app is the one dropped.
		const book = await createBookWithCard()
		await loosenWatermarks()
		await editInApp('Edited In The App')
		writeCardWithMtime(path.join(collectionRoot(), book.id), personCard('Edited On The Phone'), minutesAhead(5))

		await syncDbToRadicale()

		const records = await discardRecords()
		expect(records.length).toBe(1)
		expect(records[0].metadata.discarded).toBe('db')
		expect(records[0].summary).toContain('discarded the edit made here')
	})
})
