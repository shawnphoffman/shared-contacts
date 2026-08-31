/**
 * Collection isolation against a hostile vCard UID.
 *
 * The UID is the one piece of a card that any CardDAV user controls and that
 * this service turns into a filesystem path: it names the file mirrored into
 * the master directory and into every subscriber's collection. A UID carrying
 * path separators therefore let one user write into (and delete out of)
 * another user's collection, and with enough `..` escape the storage root
 * entirely. These tests pin that shut from the outside, through a real sync
 * pass, rather than only at the validator.
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
		STORAGE_PATH: `${(process.env.TMPDIR || '/tmp').replace(/\/$/, '')}/radicale-uid-test-${process.pid}`,
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

const ATTACKER = 'mallory'
const VICTIM = 'shawn'

const collectionRoot = () => path.join(STORAGE_PATH, 'collection-root')
const userCollection = (username: string, bookId: string) => path.join(collectionRoot(), `${username}-${bookId}`)

function personCard(uid: string, fullName: string): string {
	return ['BEGIN:VCARD', 'VERSION:3.0', `N:${fullName};;;;`, `FN:${fullName}`, `UID:${uid}`, 'END:VCARD'].join('\r\n')
}

/** File name and UID are separate here: a hostile UID must not name a real file. */
function writeCard(dir: string, fileName: string, content: string) {
	fs.mkdirSync(dir, { recursive: true })
	fs.writeFileSync(path.join(dir, `${fileName}.vcf`), content, 'utf-8')
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
	mockUsers.push({ username: ATTACKER }, { username: `${ATTACKER}-${book.id}` }, { username: VICTIM }, { username: `${VICTIM}-${book.id}` })
	return book
}

describe('a hostile vCard UID', () => {
	it('cannot write a card into another user’s collection', async () => {
		const book = await createSharedBook()
		const victimDir = userCollection(VICTIM, book.id)
		const traversalUid = `../${VICTIM}-${book.id}/planted`

		writeCard(userCollection(ATTACKER, book.id), 'innocent-looking', personCard(traversalUid, 'Planted Contact'))

		await syncRadicaleToDb(true)
		await syncDbToRadicale()

		expect(fs.existsSync(path.join(victimDir, 'planted.vcf'))).toBe(false)
		const rows = await pool.query('SELECT vcard_id FROM contacts')
		expect(rows.rows).toHaveLength(0)
	})

	it('cannot delete another user’s card', async () => {
		const book = await createSharedBook()
		const victimDir = userCollection(VICTIM, book.id)
		writeCard(victimDir, 'keeper', personCard('keeper', 'Shawn Hoffman'))

		await syncRadicaleToDb(true)
		await syncDbToRadicale()
		expect(fs.existsSync(path.join(victimDir, 'keeper.vcf'))).toBe(true)

		// A card claiming the victim's card as its own id: if the id were trusted,
		// the outbound orphan sweep would unlink the victim's copy.
		writeCard(userCollection(ATTACKER, book.id), 'sweeper', personCard(`../${VICTIM}-${book.id}/keeper`, 'Sweeper'))

		await syncRadicaleToDb(true)
		await syncDbToRadicale()

		expect(fs.existsSync(path.join(victimDir, 'keeper.vcf'))).toBe(true)
		expect(fs.existsSync(path.join(collectionRoot(), book.id, 'keeper.vcf'))).toBe(true)
	})

	it('cannot escape the storage root', async () => {
		const book = await createSharedBook()
		const escapeTarget = path.join(STORAGE_PATH, 'escaped.vcf')

		writeCard(userCollection(ATTACKER, book.id), 'escape-attempt', personCard('../../escaped', 'Escapee'))

		await syncRadicaleToDb(true)
		await syncDbToRadicale()

		expect(fs.existsSync(escapeTarget)).toBe(false)
		const rows = await pool.query('SELECT vcard_id FROM contacts')
		expect(rows.rows).toHaveLength(0)
	})
})
