/**
 * End-to-end test for CardDAV group cards, which Apple Contacts shows as
 * "lists" nested under an address book.
 *
 * The behaviour that matters to a user: one person creates a list on their Mac
 * or iPhone, and everyone else subscribed to that address book sees the same
 * list, with the same people in it. That requires the card to survive a full
 * Radicale -> DB -> Radicale trip and land in every other subscriber's
 * collection with its member lines intact.
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

// The sync modules hard-code /data/collections and /data/users, neither of
// which exists outside the container. Redirect storage to a temp dir and stand
// in for the htpasswd file with the user set the app actually maintains: a base
// user per person plus one composite user per (person, book).
//
// Hoisted because vi.mock factories are lifted above the imports above.
const { STORAGE_PATH, mockUsers } = vi.hoisted(() => {
	// contacts.updated_at is TIMESTAMP (no zone) while file mtimes are absolute,
	// so conflict resolution only compares like with like when the process runs
	// in the same zone as Postgres. Containers run UTC; pin it here so the suite
	// does not depend on the developer's local timezone.
	process.env.TZ = 'UTC'
	// Built by hand rather than with path.join: the hoisted factory runs before
	// this module's imports are initialized.
	return {
		STORAGE_PATH: `${(process.env.TMPDIR || '/tmp').replace(/\/$/, '')}/radicale-groups-test-${process.pid}`,
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

function groupCard(uid: string, name: string, memberUids: Array<string>): string {
	return [
		'BEGIN:VCARD',
		'VERSION:3.0',
		`N:${name};;;;`,
		`FN:${name}`,
		'X-ADDRESSBOOKSERVER-KIND:group',
		...memberUids.map(member => `X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${member}`),
		`UID:${uid}`,
		'END:VCARD',
	].join('\r\n')
}

function personCard(uid: string, fullName: string, lastName: string, firstName: string): string {
	return ['BEGIN:VCARD', 'VERSION:3.0', `N:${lastName};${firstName};;;`, `FN:${fullName}`, `UID:${uid}`, 'END:VCARD'].join('\r\n')
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
	// Mirror the real htpasswd contents: base users plus their composite users.
	mockUsers.push(
		{ username: OWNER },
		{ username: `${OWNER}-${book.id}` },
		{ username: SUBSCRIBER },
		{ username: `${SUBSCRIBER}-${book.id}` }
	)
	return book
}

describe('CardDAV group cards propagate between subscribers', () => {
	it("copies a list created by one user into another subscriber's collection with members intact", async () => {
		const book = await createSharedBook()

		// The owner creates two contacts and a list containing them, exactly as
		// Apple Contacts would write them into its own collection.
		const ownerDir = userCollection(OWNER, book.id)
		writeCard(ownerDir, 'person-1', personCard('person-1', 'Shawn Hoffman', 'Hoffman', 'Shawn'))
		writeCard(ownerDir, 'person-2', personCard('person-2', 'Madison Hoffman', 'Hoffman', 'Madison'))
		writeCard(ownerDir, 'group-1', groupCard('group-1', 'CA Alpine Club', ['person-1', 'person-2']))

		await syncRadicaleToDb(true)
		await syncDbToRadicale()

		const subscriberCard = path.join(userCollection(SUBSCRIBER, book.id), 'group-1.vcf')
		expect(fs.existsSync(subscriberCard)).toBe(true)

		const propagated = fs.readFileSync(subscriberCard, 'utf-8')
		expect(propagated).toContain('FN:CA Alpine Club')
		expect(propagated).toContain('X-ADDRESSBOOKSERVER-KIND:group')
		expect(propagated).toContain('X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:person-1')
		expect(propagated).toContain('X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:person-2')

		// Members are resolved by UID, so the member cards must arrive under the
		// same UIDs or the list renders empty on the subscriber's device.
		expect(fs.existsSync(path.join(userCollection(SUBSCRIBER, book.id), 'person-1.vcf'))).toBe(true)
		expect(fs.existsSync(path.join(userCollection(SUBSCRIBER, book.id), 'person-2.vcf'))).toBe(true)
	})

	it('classifies the list as a group and records its members in the database', async () => {
		const book = await createSharedBook()
		writeCard(userCollection(OWNER, book.id), 'group-1', groupCard('group-1', 'CA Alpine Club', ['person-1']))

		await syncRadicaleToDb(true)

		const result = await pool.query('SELECT kind, group_members, full_name FROM contacts WHERE vcard_id = $1', ['group-1'])
		expect(result.rows).toHaveLength(1)
		expect(result.rows[0].kind).toBe('group')
		expect(result.rows[0].group_members).toEqual(['urn:uuid:person-1'])
	})

	it('leaves ordinary contacts classified as individuals', async () => {
		const book = await createSharedBook()
		writeCard(userCollection(OWNER, book.id), 'person-1', personCard('person-1', 'Shawn Hoffman', 'Hoffman', 'Shawn'))

		await syncRadicaleToDb(true)

		const result = await pool.query('SELECT kind, group_members FROM contacts WHERE vcard_id = $1', ['person-1'])
		expect(result.rows[0].kind).toBe('individual')
		expect(result.rows[0].group_members).toBeNull()
	})

	it('propagates a membership change made on one device to the other subscriber', async () => {
		const book = await createSharedBook()
		const ownerDir = userCollection(OWNER, book.id)
		writeCard(ownerDir, 'group-1', groupCard('group-1', 'CA Alpine Club', ['person-1']))

		await syncRadicaleToDb(true)
		await syncDbToRadicale()

		// The owner adds someone to the list; Radicale rewrites the same file.
		await new Promise(resolve => setTimeout(resolve, 1100)) // outlast mtime granularity
		writeCard(ownerDir, 'group-1', groupCard('group-1', 'CA Alpine Club', ['person-1', 'person-2']))

		await syncRadicaleToDb(true)
		await syncDbToRadicale()

		const propagated = fs.readFileSync(path.join(userCollection(SUBSCRIBER, book.id), 'group-1.vcf'), 'utf-8')
		expect(propagated).toContain('X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:person-1')
		expect(propagated).toContain('X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:person-2')

		const result = await pool.query('SELECT group_members FROM contacts WHERE vcard_id = $1', ['group-1'])
		expect(result.rows[0].group_members).toEqual(['urn:uuid:person-1', 'urn:uuid:person-2'])
	})
})
