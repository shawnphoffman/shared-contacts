/**
 * Backup, wipe, restore, diff.
 *
 * docs/backups.md used to say there was no restore path at all, which meant
 * the archives were never proven to be restorable - the one property a backup
 * has to have. This drives the real thing end to end: a real archive written
 * by runBackup, a database emptied underneath it, and the snapshot read back
 * out of the tarball.
 *
 * Requires Postgres on DATABASE_URL.
 * Run via: bash scripts/test-integration.sh
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pool } from 'pg'
import { applyMigrations } from '../test-support/migrations'
import { SNAPSHOT_TABLES, buildSnapshot } from './snapshot'
import { restoreFromArchive } from './restore'
import { getBackupConfig } from './config'
import { runBackup } from './index'

// The app container runs in UTC and every other suite pins it; a suite on
// local time reads naive timestamp columns through a different zone.
vi.hoisted(() => {
	process.env.TZ = 'UTC'
})

let pool: Pool
let backupDir: string

const PHOTO = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])

beforeAll(async () => {
	if (!process.env.DATABASE_URL) {
		throw new Error('DATABASE_URL must be set for integration tests')
	}
	backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-test-'))
	process.env.BACKUP_DIR = backupDir
	pool = new Pool({ connectionString: process.env.DATABASE_URL })
	await applyMigrations(pool)
})

afterAll(async () => {
	await pool.end()
	fs.rmSync(backupDir, { recursive: true, force: true })
})

async function wipe() {
	for (const table of [...SNAPSHOT_TABLES].reverse()) {
		await pool.query(`DELETE FROM ${table.name}`)
	}
}

beforeEach(wipe)

/**
 * Something of every shape the snapshot has to carry: a bytea photo, a trashed
 * row, rows on both sides of a foreign key, and JSON columns.
 */
async function seed() {
	const book = (
		await pool.query('INSERT INTO address_books (name, slug, is_public) VALUES ($1, $2, true) RETURNING *', ['Family', 'family'])
	).rows[0]

	const shawn = (
		await pool.query(
			`INSERT INTO contacts (full_name, first_name, last_name, email, phones, photo_blob, photo_mime, vcard_id, sync_source, notes)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'api', $9) RETURNING *`,
			[
				'Shawn Hoffman',
				'Shawn',
				'Hoffman',
				'shawn@example.com',
				JSON.stringify([{ value: '+15555550123', type: 'CELL' }]),
				PHOTO,
				'image/png',
				'shawn-uid',
				'Has a photo, so the bytea round trip is covered',
			]
		)
	).rows[0]

	const trashed = (
		await pool.query(
			`INSERT INTO contacts (full_name, vcard_id, sync_source, deleted_at)
			 VALUES ($1, $2, 'api', NOW()) RETURNING *`,
			['In The Trash', 'trashed-uid']
		)
	).rows[0]

	await pool.query('INSERT INTO contact_address_books (contact_id, address_book_id) VALUES ($1, $2), ($3, $2)', [
		shawn.id,
		book.id,
		trashed.id,
	])

	await pool.query(
		`INSERT INTO contact_history (contact_id, operation, source, actor, summary, metadata)
		 VALUES ($1, 'create', 'api', 'shawn', $2, $3)`,
		[shawn.id, 'Created', JSON.stringify({ note: 'history rides along too' })]
	)

	await pool.query('INSERT INTO app_settings (key, value) VALUES ($1, $2)', ['some_setting', JSON.stringify({ on: true })])

	return { book, shawn, trashed }
}

/** The snapshot minus the fields that legitimately differ between two runs. */
async function comparableSnapshot() {
	const snapshot = await buildSnapshot('test')
	return { counts: snapshot.counts, tables: snapshot.tables, skippedTables: snapshot.skippedTables }
}

describe('restoring a backup archive', () => {
	it('puts the database back exactly as it was', async () => {
		await seed()
		const before = await comparableSnapshot()

		const run = await runBackup(getBackupConfig())
		const archive = fs.readFileSync(path.join(backupDir, run.name))

		await wipe()
		expect((await pool.query('SELECT COUNT(*)::int AS n FROM contacts')).rows[0].n).toBe(0)

		await restoreFromArchive(archive, pool)

		expect(await comparableSnapshot()).toEqual(before)
	})

	it('brings back the photo bytes, not a JSON rendering of them', async () => {
		const { shawn } = await seed()
		const run = await runBackup(getBackupConfig())
		const archive = fs.readFileSync(path.join(backupDir, run.name))

		await wipe()
		await restoreFromArchive(archive, pool)

		const restored = (await pool.query('SELECT photo_blob, photo_mime FROM contacts WHERE vcard_id = $1', [shawn.vcard_id])).rows[0]
		expect(Buffer.from(restored.photo_blob)).toEqual(PHOTO)
		expect(restored.photo_mime).toBe('image/png')
	})

	it('keeps trashed contacts, which the vcf and csv exports leave out', async () => {
		await seed()
		const run = await runBackup(getBackupConfig())
		const archive = fs.readFileSync(path.join(backupDir, run.name))

		await wipe()
		await restoreFromArchive(archive, pool)

		const trashed = await pool.query('SELECT full_name FROM contacts WHERE deleted_at IS NOT NULL')
		expect(trashed.rows.map(row => row.full_name)).toEqual(['In The Trash'])
	})

	it('replaces what is there rather than merging into it', async () => {
		await seed()
		const run = await runBackup(getBackupConfig())
		const archive = fs.readFileSync(path.join(backupDir, run.name))

		await pool.query(`INSERT INTO contacts (full_name, vcard_id, sync_source) VALUES ('Added After The Backup', 'later-uid', 'api')`)

		await restoreFromArchive(archive, pool)

		const names = (await pool.query('SELECT full_name FROM contacts ORDER BY full_name')).rows.map(row => row.full_name)
		expect(names).toEqual(['In The Trash', 'Shawn Hoffman'])
	})

	it('leaves the database untouched when the archive is not one of ours', async () => {
		await seed()
		const before = await comparableSnapshot()

		await expect(restoreFromArchive(Buffer.from('not a gzip at all'), pool)).rejects.toThrow()

		expect(await comparableSnapshot()).toEqual(before)
	})
})
