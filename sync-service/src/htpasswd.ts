import bcrypt from 'bcrypt'
import path from 'path'
import { readFile, writeFile, access, constants, readdir, copyFile, mkdir } from 'fs/promises'
import { getAddressBooks, getAddressBooksForUser } from './db'

const USERS_FILE = '/data/users'
const RADICALE_STORAGE_PATH = '/data/collections'

const getErrorCode = (error: unknown): string | undefined => {
	if (error instanceof Error && 'code' in error) {
		return (error as NodeJS.ErrnoException).code
	}
	return undefined
}

/**
 * Generate composite username for CardDAV: username-bookid
 * This allows each address book to have its own CardDAV account, avoiding Apple Contacts limitations.
 */
export function getCompositeUsername(username: string, bookId: string): string {
	return `${username}-${bookId}`
}

/**
 * Parse composite username back to base username and bookId
 * Returns null if not a composite username
 */
export function parseCompositeUsername(compositeUsername: string): { username: string; bookId: string } | null {
	const match = compositeUsername.match(/^(.+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
	if (!match) return null
	return { username: match[1], bookId: match[2] }
}

/**
 * Check if a username is a composite username (username-bookid format)
 */
export function isCompositeUsername(username: string): boolean {
	return parseCompositeUsername(username) !== null
}

function getAddressBookPathForUser(username: string, bookId: string): string {
	return path.join(RADICALE_STORAGE_PATH, 'collection-root', username, bookId)
}

function getAddressBookPath(bookId: string): string {
	return path.join(RADICALE_STORAGE_PATH, 'collection-root', bookId)
}

function getPrincipalPath(username: string): string {
	return path.join(RADICALE_STORAGE_PATH, 'collection-root', username)
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
	await mkdir(dirPath, { recursive: true })
}

/** Ensure the principal collection (e.g. /shawn/) has a displayname so clients show child address books as separate groups. */
async function ensurePrincipalProps(principalPath: string, username: string): Promise<void> {
	const propsPath = path.join(principalPath, '.Radicale.props')
	try {
		await access(propsPath, constants.F_OK)
	} catch (error: unknown) {
		if (getErrorCode(error) !== 'ENOENT') {
			throw error
		}
		const displayName = `CardDAV ${username.charAt(0).toUpperCase()}${username.slice(1)}`
		const props = {
			'D:displayname': displayName,
		}
		await writeFile(propsPath, JSON.stringify(props), 'utf-8')
	}
}

/** Ensure principal path and props exist for a user (so PROPFIND on /username/ returns a displayname). Call on user create and during sync. */
export async function ensurePrincipalPropsForUser(username: string): Promise<void> {
	const principalPath = getPrincipalPath(username)
	await ensureDirectoryExists(principalPath)
	await ensurePrincipalProps(principalPath, username)
}

async function ensureAddressBookProps(userPath: string, name: string): Promise<void> {
	const propsPath = path.join(userPath, '.Radicale.props')
	try {
		await access(propsPath, constants.F_OK)
	} catch (error: unknown) {
		if (getErrorCode(error) !== 'ENOENT') {
			throw error
		}
		const props = {
			tag: 'VADDRESSBOOK',
			'D:displayname': name,
			'C:addressbook-description': `Contacts for ${name}`,
		}
		await writeFile(propsPath, JSON.stringify(props), 'utf-8')
	}
}

export async function backfillSharedContactsForUser(username: string): Promise<void> {
	await ensurePrincipalPropsForUser(username)

	const books = await getAddressBooks()
	const userBooks = books.length > 0 ? await getAddressBooksForUser(username) : [{ id: '', name: 'Shared Contacts', slug: 'shared-contacts', is_public: true }]

	for (const book of userBooks) {
		const userPath = getAddressBookPathForUser(username, book.id)
		await ensureDirectoryExists(userPath)
		await ensureAddressBookProps(userPath, book.name)

		const masterPath = getAddressBookPath(book.id)
		try {
			await access(masterPath, constants.F_OK)
		} catch (error: unknown) {
			if (getErrorCode(error) === 'ENOENT') {
				continue
			}
			throw error
		}

		const masterFiles = await readdir(masterPath)
		for (const file of masterFiles) {
			if (!file.endsWith('.vcf') && !file.endsWith('.ics')) {
				continue
			}
			const sourcePath = path.join(masterPath, file)
			const destinationPath = path.join(userPath, file)
			try {
				await access(destinationPath, constants.F_OK)
				continue
			} catch (error: unknown) {
				if (getErrorCode(error) !== 'ENOENT') {
					throw error
				}
			}
			await copyFile(sourcePath, destinationPath)
		}
	}
}

export interface RadicaleUser {
	username: string
}

/**
 * Read all users from the htpasswd file
 */
export async function getUsers(): Promise<RadicaleUser[]> {
	try {
		await access(USERS_FILE, constants.F_OK)

		const content = await readFile(USERS_FILE, 'utf-8')
		const users: RadicaleUser[] = []

		for (const line of content.split('\n')) {
			const trimmed = line.trim()
			if (trimmed && !trimmed.startsWith('#')) {
				const [username] = trimmed.split(':')
				if (username) {
					users.push({ username })
				}
			}
		}

		return users
	} catch (error: unknown) {
		if (getErrorCode(error) === 'ENOENT') {
			return []
		}
		throw error
	}
}

/**
 * Check if a user exists
 */
export async function userExists(username: string): Promise<boolean> {
	const users = await getUsers()
	return users.some(u => u.username === username)
}

/**
 * Create a new user with a password
 */
export async function createUser(username: string, password: string): Promise<void> {
	if (await userExists(username)) {
		throw new Error(`User ${username} already exists`)
	}

	// Hash password with bcrypt (10 rounds is standard)
	const hash = await bcrypt.hash(password, 10)

	// Read existing users
	let content = ''
	try {
		await access(USERS_FILE, constants.F_OK)
		content = await readFile(USERS_FILE, 'utf-8')
	} catch (error: unknown) {
		if (getErrorCode(error) !== 'ENOENT') {
			throw error
		}
	}

	// Append new user (format: username:hashed_password)
	const newLine = `${username}:${hash}\n`
	const newContent = content + (content && !content.endsWith('\n') ? '\n' : '') + newLine

	await writeFile(USERS_FILE, newContent, 'utf-8')
	await backfillSharedContactsForUser(username)
}

/**
 * Update a user's password
 */
export async function updateUserPassword(username: string, password: string): Promise<void> {
	if (!(await userExists(username))) {
		throw new Error(`User ${username} does not exist`)
	}

	// Hash password with bcrypt
	const hash = await bcrypt.hash(password, 10)

	// Read existing users
	let content = ''
	try {
		await access(USERS_FILE, constants.F_OK)
		content = await readFile(USERS_FILE, 'utf-8')
	} catch (error: unknown) {
		if (getErrorCode(error) !== 'ENOENT') {
			throw error
		}
	}

	// Replace the user's line
	const lines = content.split('\n')
	const updatedLines = lines.map(line => {
		const trimmed = line.trim()
		if (trimmed && !trimmed.startsWith('#')) {
			const [lineUsername] = trimmed.split(':')
			if (lineUsername === username) {
				return `${username}:${hash}`
			}
		}
		return line
	})

	await writeFile(USERS_FILE, updatedLines.join('\n') + '\n', 'utf-8')
}

/**
 * Get a user's password hash from htpasswd file
 */
export async function getUserHash(username: string): Promise<string | null> {
	try {
		const content = await readFile(USERS_FILE, 'utf-8')
		for (const line of content.split('\n')) {
			const trimmed = line.trim()
			if (trimmed && !trimmed.startsWith('#')) {
				const [lineUsername, hash] = trimmed.split(':')
				if (lineUsername === username) {
					return hash
				}
			}
		}
		return null
	} catch (error: unknown) {
		if (getErrorCode(error) === 'ENOENT') {
			return null
		}
		throw error
	}
}

/**
 * Create a composite CardDAV user (username-bookid) with the same password hash as the base user.
 * Used to give each address book its own CardDAV account, avoiding Apple Contacts limitations.
 */
export async function createCompositeUser(baseUsername: string, bookId: string): Promise<void> {
	const compositeUsername = getCompositeUsername(baseUsername, bookId)
	if (await userExists(compositeUsername)) {
		return // Already exists
	}

	const baseHash = await getUserHash(baseUsername)
	if (!baseHash) {
		throw new Error(`Base user ${baseUsername} does not exist or has no password hash`)
	}

	await setUserHash(compositeUsername, baseHash)
	// Create storage directory for composite user (single book, no nested structure)
	const compositePath = path.join(RADICALE_STORAGE_PATH, 'collection-root', compositeUsername)
	await ensureDirectoryExists(compositePath)
	// Copy contacts from master book directory
	const masterPath = getAddressBookPath(bookId)
	try {
		await access(masterPath, constants.F_OK)
		const masterFiles = await readdir(masterPath)
		for (const file of masterFiles) {
			if (file.endsWith('.vcf') || file.endsWith('.ics')) {
				const sourcePath = path.join(masterPath, file)
				const destPath = path.join(compositePath, file)
				try {
					await access(destPath, constants.F_OK)
					continue // Already exists
				} catch {
					await copyFile(sourcePath, destPath)
				}
			}
		}
		// Ensure address book props
		const books = await getAddressBooks()
		const book = books.find(b => b.id === bookId)
		if (book) {
			await ensureAddressBookProps(compositePath, book.name)
		}
	} catch (error: unknown) {
		if (getErrorCode(error) !== 'ENOENT') {
			throw error
		}
	}
}

/**
 * Delete a composite CardDAV user
 */
export async function deleteCompositeUser(baseUsername: string, bookId: string): Promise<void> {
	const compositeUsername = getCompositeUsername(baseUsername, bookId)
	if (!(await userExists(compositeUsername))) {
		return // Already deleted
	}

	// Delete from htpasswd
	let content = ''
	try {
		await access(USERS_FILE, constants.F_OK)
		content = await readFile(USERS_FILE, 'utf-8')
	} catch (error: unknown) {
		if (getErrorCode(error) !== 'ENOENT') {
			throw error
		}
		return
	}

	const lines = content.split('\n')
	const filteredLines = lines.filter(line => {
		const trimmed = line.trim()
		if (trimmed && !trimmed.startsWith('#')) {
			const [lineUsername] = trimmed.split(':')
			return lineUsername !== compositeUsername
		}
		return true
	})

	await writeFile(USERS_FILE, filteredLines.join('\n') + '\n', 'utf-8')
	// Note: We don't delete the storage directory - let sync handle cleanup
}

/**
 * Sync composite CardDAV users based on user address book assignments.
 * Creates composite users for assigned books, deletes for unassigned books.
 * @param baseUsername The base username (e.g., "shawn")
 * @param assignedBookIds Array of book IDs currently assigned to the user
 * @param previousBookIds Optional: previous book IDs to determine what changed
 */
export async function syncCompositeUsers(
	baseUsername: string,
	assignedBookIds: Array<string>,
	previousBookIds?: Array<string>
): Promise<void> {
	const assignedSet = new Set(assignedBookIds)
	const previousSet = previousBookIds ? new Set(previousBookIds) : new Set<string>()

	// Create composite users for newly assigned books
	for (const bookId of assignedBookIds) {
		if (!previousSet.has(bookId)) {
			try {
				await createCompositeUser(baseUsername, bookId)
			} catch (error) {
				console.error(`Failed to create composite user ${baseUsername}-${bookId}:`, error)
				// Continue with other books
			}
		}
	}

	// Delete composite users for unassigned books
	for (const bookId of previousSet) {
		if (!assignedSet.has(bookId)) {
			try {
				await deleteCompositeUser(baseUsername, bookId)
			} catch (error) {
				console.error(`Failed to delete composite user ${baseUsername}-${bookId}:`, error)
				// Continue with other books
			}
		}
	}
}

/**
 * Ensure composite users exist for all current user-address-book assignments.
 * This is called on startup to catch any missing composite users (e.g., if migration
 * ran before assignments were made, or if assignments were made manually).
 */
export async function ensureAllCompositeUsersExist(): Promise<void> {
	const { getAddressBooks, getExplicitAddressBookIdsForUser } = await import('./db')
	const books = await getAddressBooks()
	if (books.length === 0) return

	const allUsers = await getUsers()
	const baseUsers = allUsers.filter(
		user => !user.username.startsWith('ro-') && !isCompositeUsername(user.username)
	)

	let ensuredCount = 0
	for (const user of baseUsers) {
		try {
			const assignedBookIds = await getExplicitAddressBookIdsForUser(user.username)
			const publicBooks = books.filter(book => book.is_public)
			const allBookIds = new Set([...assignedBookIds, ...publicBooks.map(b => b.id)])

			for (const bookId of allBookIds) {
				const compositeUsername = getCompositeUsername(user.username, bookId)
				if (!(await userExists(compositeUsername))) {
					try {
						await createCompositeUser(user.username, bookId)
						ensuredCount++
						console.log(`Ensured composite user exists: ${compositeUsername}`)
					} catch (error) {
						console.error(`Failed to ensure composite user ${compositeUsername}:`, error)
					}
				} else {
					// User exists, but ensure directory and props exist
					const compositePath = path.join(RADICALE_STORAGE_PATH, 'collection-root', compositeUsername)
					try {
						await ensureDirectoryExists(compositePath)
						const book = books.find(b => b.id === bookId)
						if (book) {
							const propsPath = path.join(compositePath, '.Radicale.props')
							try {
								await access(propsPath, constants.F_OK)
							} catch {
								// Props don't exist, create them
								const props = {
									tag: 'VADDRESSBOOK',
									'D:displayname': book.name,
									'C:addressbook-description': `Contacts for ${book.name}`,
								}
								await writeFile(propsPath, JSON.stringify(props), 'utf-8')
							}
						}
					} catch (error) {
						console.warn(`Failed to ensure directory/props for ${compositeUsername}:`, error)
					}
				}
			}
		} catch (error) {
			console.error(`Failed to ensure composite users for ${user.username}:`, error)
		}
	}

	if (ensuredCount > 0) {
		console.log(`Ensured ${ensuredCount} composite users exist`)
	}
}

/**
 * Set or update a user in htpasswd with a pre-computed bcrypt hash (e.g. for read-only subscription users).
 * Does not run backfill.
 */
export async function setUserHash(username: string, hash: string): Promise<void> {
	let content = ''
	try {
		await access(USERS_FILE, constants.F_OK)
		content = await readFile(USERS_FILE, 'utf-8')
	} catch (error: unknown) {
		if (getErrorCode(error) !== 'ENOENT') {
			throw error
		}
	}
	const lines = content.split('\n')
	let found = false
	const newLines = lines.map(line => {
		const trimmed = line.trim()
		if (trimmed && !trimmed.startsWith('#')) {
			const [lineUsername] = trimmed.split(':')
			if (lineUsername === username) {
				found = true
				return `${username}:${hash}`
			}
		}
		return line
	})
	if (!found) {
		newLines.push(`${username}:${hash}`)
	}
	await writeFile(USERS_FILE, newLines.join('\n').replace(/\n*$/, '\n'), 'utf-8')
}

/**
 * Delete a user
 */
export async function deleteUser(username: string): Promise<void> {
	if (!(await userExists(username))) {
		throw new Error(`User ${username} does not exist`)
	}

	// Read existing users
	let content = ''
	try {
		await access(USERS_FILE, constants.F_OK)
		content = await readFile(USERS_FILE, 'utf-8')
	} catch (error: unknown) {
		if (getErrorCode(error) !== 'ENOENT') {
			throw error
		}
	}

	// Remove the user's line
	const lines = content.split('\n')
	const filteredLines = lines.filter(line => {
		const trimmed = line.trim()
		if (trimmed && !trimmed.startsWith('#')) {
			const [lineUsername] = trimmed.split(':')
			return lineUsername !== username
		}
		return true
	})

	await writeFile(USERS_FILE, filteredLines.join('\n') + '\n', 'utf-8')
}
