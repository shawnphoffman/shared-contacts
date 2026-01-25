import * as fs from 'fs'
import * as path from 'path'
import { getPool } from './db'
import { getAddressBooks } from './db'
import { getUsers } from './htpasswd'

const RADICALE_STORAGE_PATH = '/data/collections'
const COLLECTION_ROOT = 'collection-root'

/**
 * One-time migration: rename Radicale storage dirs from slug to address book id.
 * Master: collection-root/{slug} -> collection-root/{id}
 * Per-user: collection-root/{username}/{slug} -> collection-root/{username}/{id}
 * After this, sync and paths use id only.
 */
export async function runPathMigrationIfNeeded(): Promise<void> {
	const pool = getPool()

	// Check if path_migration_done table exists and has a row
	let migrationDone = false
	try {
		const result = await pool.query('SELECT 1 FROM path_migration_done LIMIT 1')
		migrationDone = (result.rowCount ?? 0) > 0
	} catch {
		// Table might not exist before migration 12
		return
	}

	if (migrationDone) {
		return
	}

	console.log('Running one-time path migration (slug -> id)...')
	const books = await getAddressBooks()
	if (books.length === 0) {
		await pool.query('INSERT INTO path_migration_done (done_at) VALUES (NOW())')
		console.log('Path migration skipped (no address books).')
		return
	}

	const rootPath = path.join(RADICALE_STORAGE_PATH, COLLECTION_ROOT)
	if (!fs.existsSync(rootPath)) {
		await pool.query('INSERT INTO path_migration_done (done_at) VALUES (NOW())')
		console.log('Path migration skipped (collection-root not found).')
		return
	}

	for (const book of books) {
		const oldMasterPath = path.join(rootPath, book.slug)
		const newMasterPath = path.join(rootPath, book.id)
		if (fs.existsSync(oldMasterPath) && !fs.existsSync(newMasterPath)) {
			fs.renameSync(oldMasterPath, newMasterPath)
			console.log(`Renamed master path: ${book.slug} -> ${book.id}`)
		}
	}

	let users: Array<{ username: string }> = []
	try {
		users = await getUsers()
	} catch (err) {
		console.warn('Could not read htpasswd for user path migration:', err)
	}

	for (const user of users) {
		const userDir = path.join(rootPath, user.username)
		if (!fs.existsSync(userDir)) continue
		for (const book of books) {
			const oldUserPath = path.join(userDir, book.slug)
			const newUserPath = path.join(userDir, book.id)
			if (fs.existsSync(oldUserPath) && !fs.existsSync(newUserPath)) {
				fs.renameSync(oldUserPath, newUserPath)
				console.log(`Renamed user path: ${user.username}/${book.slug} -> ${user.username}/${book.id}`)
			}
		}
	}

	await pool.query('INSERT INTO path_migration_done (done_at) VALUES (NOW())')
	console.log('Path migration completed.')
}
