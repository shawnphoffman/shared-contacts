/**
 * Integration tests for the sync pipeline.
 *
 * These tests require:
 * - Postgres running on DATABASE_URL (default: localhost:5433 via docker-compose.test.yml)
 * - Radicale storage directory (uses RADICALE_STORAGE_PATH or /tmp/radicale-test-data)
 *
 * Run with: npm run test:integration
 * Or via:   bash scripts/test-integration.sh
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { Pool } from 'pg'
import { parseVCard, generateVCard } from './vcard'

// Database pool for test setup/teardown
let pool: Pool

// Override RADICALE_STORAGE_PATH for tests
const STORAGE_PATH = process.env.RADICALE_STORAGE_PATH || '/tmp/radicale-test-data'

// Ensure the storage directory structure exists
function ensureStorageDirs() {
	const collectionPath = path.join(STORAGE_PATH, 'collection-root')
	fs.mkdirSync(collectionPath, { recursive: true })
	return collectionPath
}

function cleanStorage() {
	if (fs.existsSync(STORAGE_PATH)) {
		fs.rmSync(STORAGE_PATH, { recursive: true, force: true })
	}
	ensureStorageDirs()
}

async function truncateAll() {
	await pool.query('DELETE FROM contact_address_books')
	await pool.query('DELETE FROM contacts')
	await pool.query('DELETE FROM address_books')
}

async function createTestAddressBook(name = 'Test Book', slug = 'test-book') {
	const result = await pool.query('INSERT INTO address_books (name, slug, is_public) VALUES ($1, $2, true) RETURNING *', [name, slug])
	return result.rows[0]
}

async function createTestContact(overrides: Record<string, unknown> = {}) {
	const defaults = {
		full_name: 'Test Contact',
		first_name: 'Test',
		last_name: 'Contact',
		email: 'test@example.com',
		sync_source: 'api',
	}
	const data = { ...defaults, ...overrides }

	const keys = Object.keys(data)
	const values = Object.values(data)
	const placeholders = keys.map((_, i) => `$${i + 1}`)

	const result = await pool.query(`INSERT INTO contacts (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`, values)
	return result.rows[0]
}

async function assignContactToBook(contactId: string, bookId: string) {
	await pool.query('INSERT INTO contact_address_books (contact_id, address_book_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
		contactId,
		bookId,
	])
}

// ---------------------------------------------------------------------------
// Setup & teardown
// ---------------------------------------------------------------------------
beforeAll(async () => {
	const dbUrl = process.env.DATABASE_URL
	if (!dbUrl) {
		throw new Error('DATABASE_URL must be set for integration tests')
	}
	pool = new Pool({ connectionString: dbUrl })

	// Run migrations by executing the SQL files directly
	const migrationsDir = path.join(__dirname, '..', '..', 'migrations')
	if (!fs.existsSync(migrationsDir)) {
		throw new Error(`Migrations directory not found: ${migrationsDir}`)
	}

	// Create migrations tracking table
	await pool.query(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name TEXT PRIMARY KEY,
			applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		)
	`)

	// Get applied migrations
	const applied = await pool.query('SELECT name FROM schema_migrations')
	const appliedSet = new Set(applied.rows.map((r: { name: string }) => r.name))

	// Apply pending migrations in order
	const files = fs
		.readdirSync(migrationsDir)
		.filter(f => f.endsWith('.sql'))
		.sort()

	for (const file of files) {
		if (appliedSet.has(file)) continue
		const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
		const hasTransaction = /^\s*BEGIN\s*;/im.test(sql)
		if (hasTransaction) {
			await pool.query(sql)
		} else {
			await pool.query('BEGIN')
			await pool.query(sql)
			await pool.query('COMMIT')
		}
		await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
	}

	ensureStorageDirs()
})

beforeEach(async () => {
	await truncateAll()
	cleanStorage()
})

afterAll(async () => {
	if (pool) {
		await pool.end()
	}
	cleanStorage()
})

// ---------------------------------------------------------------------------
// Database CRUD tests (core operations the sync pipeline depends on)
// ---------------------------------------------------------------------------
describe('database contact operations', () => {
	it('creates and retrieves a contact', async () => {
		const contact = await createTestContact()
		expect(contact.id).toBeDefined()
		expect(contact.full_name).toBe('Test Contact')

		const result = await pool.query('SELECT * FROM contacts WHERE id = $1', [contact.id])
		expect(result.rows).toHaveLength(1)
		expect(result.rows[0].email).toBe('test@example.com')
	})

	it('assigns contact to address book', async () => {
		const book = await createTestAddressBook()
		const contact = await createTestContact()
		await assignContactToBook(contact.id, book.id)

		const result = await pool.query('SELECT * FROM contact_address_books WHERE contact_id = $1', [contact.id])
		expect(result.rows).toHaveLength(1)
		expect(result.rows[0].address_book_id).toBe(book.id)
	})

	it('deletes contact and cascades to address book assignments', async () => {
		const book = await createTestAddressBook()
		const contact = await createTestContact()
		await assignContactToBook(contact.id, book.id)

		await pool.query('DELETE FROM contacts WHERE id = $1', [contact.id])

		const cabResult = await pool.query('SELECT * FROM contact_address_books WHERE contact_id = $1', [contact.id])
		expect(cabResult.rows).toHaveLength(0)
	})

	it('updates contact fields', async () => {
		const contact = await createTestContact()
		await pool.query('UPDATE contacts SET full_name = $1, organization = $2 WHERE id = $3', ['Updated Name', 'Acme Corp', contact.id])

		const result = await pool.query('SELECT * FROM contacts WHERE id = $1', [contact.id])
		expect(result.rows[0].full_name).toBe('Updated Name')
		expect(result.rows[0].organization).toBe('Acme Corp')
	})

	it('stores and retrieves jsonb phone/email arrays', async () => {
		const phones = JSON.stringify([{ value: '555-1234', type: 'CELL' }])
		const emails = JSON.stringify([{ value: 'a@b.com', type: 'INTERNET' }])

		const contact = await createTestContact({ phones, emails })

		const result = await pool.query('SELECT phones, emails FROM contacts WHERE id = $1', [contact.id])
		const row = result.rows[0]

		// pg returns jsonb as parsed objects
		expect(row.phones).toEqual([{ value: '555-1234', type: 'CELL' }])
		expect(row.emails).toEqual([{ value: 'a@b.com', type: 'INTERNET' }])
	})
})

// ---------------------------------------------------------------------------
// vCard generation + parsing round-trip
// ---------------------------------------------------------------------------
describe('vcard round-trip', () => {
	it('generates and parses a vcard preserving core fields', () => {
		const vcardData = generateVCard(
			{},
			{
				full_name: 'John Smith',
				first_name: 'John',
				last_name: 'Smith',
				email: 'john@example.com',
				phone: '+15551234567',
				organization: 'Acme Corp',
				job_title: 'Engineer',
			}
		)
		expect(vcardData).toContain('BEGIN:VCARD')
		expect(vcardData).toContain('FN:John Smith')

		const parsed = parseVCard(vcardData)
		expect(parsed.fn).toBe('John Smith')
		expect(parsed.org).toBe('Acme Corp')
	})

	it('round-trips multiple phones and emails', () => {
		const vcardData = generateVCard(
			{},
			{
				full_name: 'Multi Contact',
				phones: [
					{ value: '+15551234567', type: 'CELL' },
					{ value: '+15559876543', type: 'WORK' },
				],
				emails: [
					{ value: 'home@test.com', type: 'HOME' },
					{ value: 'work@test.com', type: 'WORK' },
				],
			}
		)
		const parsed = parseVCard(vcardData)

		expect(parsed.tels).toHaveLength(2)
		expect(parsed.emails).toHaveLength(2)
	})
})

// ---------------------------------------------------------------------------
// File system operations (simulating Radicale storage)
// ---------------------------------------------------------------------------
describe('radicale storage file operations', () => {
	it('writes and reads a vcf file from storage', () => {
		const collectionPath = path.join(STORAGE_PATH, 'collection-root', 'test-book')
		fs.mkdirSync(collectionPath, { recursive: true })

		const vcardData = generateVCard(
			{},
			{
				full_name: 'File Test',
				first_name: 'File',
				last_name: 'Test',
				email: 'file@test.com',
			}
		)

		const vcfPath = path.join(collectionPath, 'test-contact.vcf')
		fs.writeFileSync(vcfPath, vcardData, 'utf-8')

		expect(fs.existsSync(vcfPath)).toBe(true)

		const content = fs.readFileSync(vcfPath, 'utf-8')
		expect(content).toContain('BEGIN:VCARD')
		expect(content).toContain('FN:File Test')

		const parsed = parseVCard(content)
		expect(parsed.fn).toBe('File Test')
	})

	it('deletes a vcf file from storage', () => {
		const collectionPath = path.join(STORAGE_PATH, 'collection-root', 'test-book')
		fs.mkdirSync(collectionPath, { recursive: true })

		const vcfPath = path.join(collectionPath, 'to-delete.vcf')
		fs.writeFileSync(vcfPath, 'BEGIN:VCARD\nVERSION:3.0\nFN:Delete Me\nEND:VCARD', 'utf-8')

		expect(fs.existsSync(vcfPath)).toBe(true)
		fs.unlinkSync(vcfPath)
		expect(fs.existsSync(vcfPath)).toBe(false)
	})

	it('discovers vcf files recursively', () => {
		const basePath = path.join(STORAGE_PATH, 'collection-root')
		const book1 = path.join(basePath, 'book1')
		const book2 = path.join(basePath, 'book2')
		fs.mkdirSync(book1, { recursive: true })
		fs.mkdirSync(book2, { recursive: true })

		const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Test\nEND:VCARD'
		fs.writeFileSync(path.join(book1, 'a.vcf'), vcard)
		fs.writeFileSync(path.join(book1, 'b.vcf'), vcard)
		fs.writeFileSync(path.join(book2, 'c.vcf'), vcard)
		fs.writeFileSync(path.join(book2, 'not-a-vcard.txt'), 'hello')

		// Discover all .vcf files
		const vcfFiles: string[] = []
		const walk = (dir: string) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const fullPath = path.join(dir, entry.name)
				if (entry.isDirectory()) walk(fullPath)
				else if (entry.name.endsWith('.vcf')) vcfFiles.push(fullPath)
			}
		}
		walk(basePath)

		expect(vcfFiles).toHaveLength(3)
		expect(vcfFiles.every(f => f.endsWith('.vcf'))).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// Address book management
// ---------------------------------------------------------------------------
describe('address book operations', () => {
	it('creates multiple address books', async () => {
		await createTestAddressBook('Book 1', 'book-1')
		await createTestAddressBook('Book 2', 'book-2')

		const result = await pool.query('SELECT * FROM address_books ORDER BY name')
		expect(result.rows).toHaveLength(2)
		expect(result.rows[0].name).toBe('Book 1')
		expect(result.rows[1].name).toBe('Book 2')
	})

	it('assigns contact to multiple books', async () => {
		const book1 = await createTestAddressBook('Book 1', 'book-1')
		const book2 = await createTestAddressBook('Book 2', 'book-2')
		const contact = await createTestContact()

		await assignContactToBook(contact.id, book1.id)
		await assignContactToBook(contact.id, book2.id)

		const result = await pool.query('SELECT address_book_id FROM contact_address_books WHERE contact_id = $1', [contact.id])
		expect(result.rows).toHaveLength(2)
	})
})

// ---------------------------------------------------------------------------
// Sync metadata tracking
// ---------------------------------------------------------------------------
describe('sync metadata', () => {
	it('tracks sync timestamps for contacts', async () => {
		const contact = await createTestContact()

		// Simulate sync to radicale
		const now = new Date()
		await pool.query('UPDATE contacts SET last_synced_to_radicale_at = $1, sync_source = $2 WHERE id = $3', [now, 'api', contact.id])

		const result = await pool.query('SELECT last_synced_to_radicale_at, sync_source FROM contacts WHERE id = $1', [contact.id])
		expect(result.rows[0].last_synced_to_radicale_at).toBeTruthy()
		expect(result.rows[0].sync_source).toBe('api')
	})

	it('identifies contacts needing radicale sync', async () => {
		// Contact with null last_synced_to_radicale_at should need sync
		await createTestContact({ last_synced_to_radicale_at: null, sync_source: 'api' })
		// Contact already synced should not
		await createTestContact({
			full_name: 'Synced',
			last_synced_to_radicale_at: new Date(),
			sync_source: 'api',
		})

		const result = await pool.query('SELECT * FROM contacts WHERE last_synced_to_radicale_at IS NULL')
		expect(result.rows).toHaveLength(1)
		expect(result.rows[0].full_name).toBe('Test Contact')
	})

	it('stores and compares vcard hashes', async () => {
		const vcardData = generateVCard({}, { full_name: 'Hash Test' })
		const crypto = await import('crypto')
		const hash = crypto.createHash('sha256').update(vcardData).digest('hex')

		const contact = await createTestContact({ vcard_data: vcardData, vcard_hash: hash })

		const result = await pool.query('SELECT vcard_hash FROM contacts WHERE id = $1', [contact.id])
		expect(result.rows[0].vcard_hash).toBe(hash)

		// Same content = same hash (no unnecessary sync)
		const hash2 = crypto.createHash('sha256').update(vcardData).digest('hex')
		expect(hash2).toBe(hash)

		// Modified content = different hash (triggers sync)
		const modifiedVcard = generateVCard({}, { full_name: 'Hash Test Modified' })
		const hash3 = crypto.createHash('sha256').update(modifiedVcard).digest('hex')
		expect(hash3).not.toBe(hash)
	})
})
