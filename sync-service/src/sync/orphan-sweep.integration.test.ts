/**
 * The outbound orphan sweep, which is the only thing in the service that
 * deletes cards nobody asked it to delete.
 *
 * It exists to clear cards whose contact is gone. The hazard is the keep-set it
 * decides that from: built out of the contacts needing a write this pass, it
 * read "already up to date" as "orphan" and removed live cards from the master
 * mirror and every subscriber's collection at once. Nothing else in the service
 * has that blast radius, so it gets its own suite.
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
		STORAGE_PATH: `${(process.env.TMPDIR || '/tmp').replace(/\/$/, '')}/radicale-sweep-test-${process.pid}`,
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
const SUBSCRIBER = 'madison'

const collectionRoot = () => path.join(STORAGE_PATH, 'collection-root')
const userCollection = (username: string, bookId: string) => path.join(collectionRoot(), `${username}-${bookId}`)

function personCard(uid: string, fullName: string): string {
	return ['BEGIN:VCARD', 'VERSION:3.0', `N:${fullName};;;;`, `FN:${fullName}`, `UID:${uid}`, 'END:VCARD'].join('\r\n')
}

function writeCard(dir: string, uid: string, content: string) {
	fs.mkdirSync(dir, { recursive: true })
	fs.writeFileSync(path.join(dir, `${uid}.vcf`), content, 'utf-8')
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

async function createSharedBook() {
	const result = await pool.query('INSERT INTO address_books (name, slug, is_public) VALUES ($1, $2, true) RETURNING *', [
		'Hoffman Extended',
		'hoffman-extended',
	])
	const book = result.rows[0]
	mockUsers.push(
		{ username: OWNER },
		{ username: `${OWNER}-${book.id}` },
		{ username: SUBSCRIBER },
		{ username: `${SUBSCRIBER}-${book.id}` }
	)
	return book
}

/**
 * Put every contact in the state getContactsNeedingRadicaleSync excludes:
 * Radicale-authored, already written out, and not touched since. The watermark
 * is pushed past the trigger's own NOW() because the BEFORE UPDATE trigger
 * restamps updated_at as this very statement runs, so setting it to anything
 * already in the past would leave the row still needing a write.
 */
async function markEverythingAlreadySynced() {
	await pool.query(`UPDATE contacts SET last_synced_to_radicale_at = NOW() + interval '1 minute', sync_source = 'radicale'`)
}

describe('the outbound orphan sweep', () => {
	it('keeps every live card on a pass where nothing needs writing', async () => {
		const book = await createSharedBook()
		const ownerDir = userCollection(OWNER, book.id)
		writeCard(ownerDir, 'person-1', personCard('person-1', 'Shawn Hoffman'))
		writeCard(ownerDir, 'person-2', personCard('person-2', 'Madison Hoffman'))

		await syncRadicaleToDb(true)
		await syncDbToRadicale()

		await markEverythingAlreadySynced()
		await syncDbToRadicale()

		for (const uid of ['person-1', 'person-2']) {
			expect(fs.existsSync(path.join(collectionRoot(), book.id, `${uid}.vcf`))).toBe(true)
			expect(fs.existsSync(path.join(ownerDir, `${uid}.vcf`))).toBe(true)
			expect(fs.existsSync(path.join(userCollection(SUBSCRIBER, book.id), `${uid}.vcf`))).toBe(true)
		}
	})

	it('does not let a quiet outbound pass cascade into soft-deleting the rows', async () => {
		// Sweeping a live card is not self-contained: the deletions are unlinks in
		// watched directories, and the next inbound pass reads a card missing from
		// every collection as a client-side delete and soft-deletes the row behind
		// it. Losing the files loses the contacts.
		const book = await createSharedBook()
		writeCard(userCollection(OWNER, book.id), 'person-1', personCard('person-1', 'Shawn Hoffman'))

		await syncRadicaleToDb(true)
		await syncDbToRadicale()

		await markEverythingAlreadySynced()
		await syncDbToRadicale()
		await syncRadicaleToDb(true)

		const result = await pool.query('SELECT deleted_at FROM contacts WHERE vcard_id = $1', ['person-1'])
		expect(result.rows).toHaveLength(1)
		expect(result.rows[0].deleted_at).toBeNull()
	})

	it('still removes a card whose contact is genuinely gone', async () => {
		const book = await createSharedBook()
		const ownerDir = userCollection(OWNER, book.id)
		writeCard(ownerDir, 'person-1', personCard('person-1', 'Shawn Hoffman'))
		writeCard(ownerDir, 'person-2', personCard('person-2', 'Madison Hoffman'))

		await syncRadicaleToDb(true)
		await syncDbToRadicale()

		await pool.query("UPDATE contacts SET deleted_at = NOW() WHERE vcard_id = 'person-2'")
		await markEverythingAlreadySynced()
		await syncDbToRadicale()

		expect(fs.existsSync(path.join(collectionRoot(), book.id, 'person-2.vcf'))).toBe(false)
		expect(fs.existsSync(path.join(userCollection(SUBSCRIBER, book.id), 'person-2.vcf'))).toBe(false)
		expect(fs.existsSync(path.join(ownerDir, 'person-1.vcf'))).toBe(true)
	})
})
