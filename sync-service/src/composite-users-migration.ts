import * as fs from 'fs'
import * as path from 'path'
import { getPool } from './db'
import { getAddressBooks } from './db'
import { getUsers, getCompositeUsername, isCompositeUsername, createCompositeUser } from './htpasswd'

const RADICALE_STORAGE_PATH = '/data/collections'
const COLLECTION_ROOT = 'collection-root'

/**
 * One-time migration: create composite CardDAV users (username-bookid) for all existing
 * user-address-book assignments. This allows each address book to have its own CardDAV account,
 * avoiding Apple Contacts limitations.
 *
 * For each user assigned to address books, creates composite users like:
 * - shawn-book1
 * - shawn-book2
 *
 * Also migrates files from old paths (collection-root/{username}/{bookId}/) to new paths
 * (collection-root/{username-bookId}/) if they exist.
 */
export async function runCompositeUsersMigrationIfNeeded(): Promise<void> {
	const pool = getPool()

	// Check if composite_users_migration_done table exists and has a row
	let migrationDone = false
	try {
		const result = await pool.query('SELECT 1 FROM composite_users_migration_done LIMIT 1')
		migrationDone = (result.rowCount ?? 0) > 0
	} catch {
		// Table might not exist before migration 14
		return
	}

	if (migrationDone) {
		return
	}

	console.log('Running one-time composite users migration...')
	const books = await getAddressBooks()
	if (books.length === 0) {
		await pool.query('INSERT INTO composite_users_migration_done (done_at) VALUES (NOW())')
		console.log('Composite users migration skipped (no address books).')
		return
	}

	const rootPath = path.join(RADICALE_STORAGE_PATH, COLLECTION_ROOT)
	if (!fs.existsSync(rootPath)) {
		await pool.query('INSERT INTO composite_users_migration_done (done_at) VALUES (NOW())')
		console.log('Composite users migration skipped (collection-root not found).')
		return
	}

	// Get all base users (exclude composite and ro-* users)
	let allUsers: Array<{ username: string }> = []
	try {
		allUsers = await getUsers()
	} catch (err) {
		console.warn('Could not read htpasswd for composite users migration:', err)
	}

	const baseUsers = allUsers.filter(
		user => !user.username.startsWith('ro-') && !isCompositeUsername(user.username)
	)

	if (baseUsers.length === 0) {
		await pool.query('INSERT INTO composite_users_migration_done (done_at) VALUES (NOW())')
		console.log('Composite users migration skipped (no base users found).')
		return
	}

	let createdCount = 0
	let migratedCount = 0

	for (const user of baseUsers) {
		try {
			// Get all books the user can access (explicitly assigned + public)
			// Use getAddressBooksForUser to match what sync uses
			const { getAddressBooksForUser } = await import('./db')
			const accessibleBooks = await getAddressBooksForUser(user.username)
			const allBookIds = new Set(accessibleBooks.map(b => b.id))

			for (const bookId of allBookIds) {
				const compositeUsername = getCompositeUsername(user.username, bookId)
				
				// Check if composite user already exists
				let compositeExists = false
				try {
					const existingUsers = await getUsers()
					compositeExists = existingUsers.some(u => u.username === compositeUsername)
				} catch (err) {
					console.warn(`Could not check if composite user ${compositeUsername} exists:`, err)
					// Continue anyway - createCompositeUser will handle it
				}
				
				if (!compositeExists) {
					try {
						// Create composite user (will copy files from master if needed)
						await createCompositeUser(user.username, bookId)
						createdCount++
						console.log(`Created composite user: ${compositeUsername}`)
					} catch (error) {
						console.error(`Failed to create composite user ${compositeUsername}:`, error)
						// Continue with other users/books - migration will complete even if some fail
					}
				}

				// Migrate files from old path to new path if old path exists
				const oldPath = path.join(rootPath, user.username, bookId)
				const newPath = path.join(rootPath, compositeUsername)
				
				if (fs.existsSync(oldPath) && fs.existsSync(newPath)) {
					// Both paths exist - migrate files from old to new
					try {
						const oldFiles = fs.readdirSync(oldPath)
						let migratedFiles = 0
						
						for (const file of oldFiles) {
							if (file === '.Radicale.props') continue // Props file is already created by createCompositeUser
							
							const oldFilePath = path.join(oldPath, file)
							const newFilePath = path.join(newPath, file)
							
							// Only copy if file doesn't exist in new location
							if (!fs.existsSync(newFilePath)) {
								if (fs.statSync(oldFilePath).isFile()) {
									fs.copyFileSync(oldFilePath, newFilePath)
									migratedFiles++
								}
							}
						}
						
						if (migratedFiles > 0) {
							migratedCount += migratedFiles
							console.log(`Migrated ${migratedFiles} files from ${user.username}/${bookId} to ${compositeUsername}`)
						}
					} catch (error) {
						console.warn(`Failed to migrate files from ${oldPath} to ${newPath}:`, error)
						// Continue - sync will handle any missing files
					}
				}
			}
		} catch (error) {
			console.error(`Failed to process user ${user.username}:`, error)
			// Continue with other users
		}
	}

	await pool.query('INSERT INTO composite_users_migration_done (done_at) VALUES (NOW())')
	console.log(`Composite users migration completed. Created ${createdCount} composite users, migrated ${migratedCount} files.`)
}
