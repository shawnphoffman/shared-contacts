import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { watch } from 'chokidar'
import {
	AddressBook,
	Contact,
	createContact,
	deleteContact,
	getAddressBookById,
	getAddressBookBySlug,
	getAddressBooks,
	getAddressBooksForUser,
	getAllAddressBookReadonly,
	getAllContacts,
	getContactAddressBookEntries,
	getContactAddressBookIds,
	getContactByVcardId,
	getContactsNeedingRadicaleSync,
	getDefaultAddressBook,
	setContactAddressBooks,
	updateContact,
	updateSyncMetadata,
} from './db'
import { parseVCard, generateVCard } from './vcard'
import { getUsers, ensurePrincipalPropsForUser, getCompositeUsername, isCompositeUsername, parseCompositeUsername } from './htpasswd'

const RADICALE_STORAGE_PATH = '/data/collections'
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL || '30000', 10) // Default 30 seconds instead of 5
const FILE_WATCHER_DEBOUNCE_MS = parseInt(process.env.FILE_WATCHER_DEBOUNCE_MS || '2000', 10) // Debounce file changes for 2 seconds

const getErrorCode = (error: unknown): string | undefined => {
	if (error instanceof Error && 'code' in error) {
		return (error as NodeJS.ErrnoException).code
	}
	return undefined
}

/**
 * Get the path to an address book in Radicale for a specific user.
 * For composite usernames (username-bookid), returns the composite user's root directory.
 * For regular usernames, returns the nested path (username/bookid).
 */
function getAddressBookPathForUser(username: string, bookId: string): string {
	// If username is already composite, use it directly (no nested bookId)
	if (isCompositeUsername(username)) {
		return path.join(RADICALE_STORAGE_PATH, 'collection-root', username)
	}
	// Otherwise, use composite username format
	const compositeUsername = getCompositeUsername(username, bookId)
	return path.join(RADICALE_STORAGE_PATH, 'collection-root', compositeUsername)
}

/**
 * Get the master address book path (for file watching and conflict detection).
 * Uses address book id (stable, unpredictable) not slug.
 */
function getAddressBookPath(bookId: string): string {
	return path.join(RADICALE_STORAGE_PATH, 'collection-root', bookId)
}

/**
 * Ensure the shared address book directory exists
 */
function ensureDirectoryExists(dirPath: string): void {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true })
	}
}

function getFallbackAddressBook(): AddressBook {
	const now = new Date(0)
	return {
		id: '00000000-0000-0000-0000-000000000000',
		name: 'Shared Contacts',
		slug: 'shared-contacts',
		is_public: true,
		created_at: now,
		updated_at: now,
	}
}

async function getAddressBooksForSync(): Promise<{
	books: Array<AddressBook>
	defaultBook: AddressBook
	hasAddressBooks: boolean
}> {
	const books = await getAddressBooks()
	if (books.length === 0) {
		const fallback = getFallbackAddressBook()
		return { books: [fallback], defaultBook: fallback, hasAddressBooks: false }
	}
	const defaultBook = (await getDefaultAddressBook()) || books[0]
	return { books, defaultBook, hasAddressBooks: true }
}

function ensureAddressBookProps(collectionPath: string, book: AddressBook): void {
	const propsPath = path.join(collectionPath, '.Radicale.props')
	if (!fs.existsSync(propsPath)) {
		const props = {
			tag: 'VADDRESSBOOK',
			'D:displayname': book.name,
			'C:addressbook-description': `Contacts for ${book.name}`,
		}
		fs.writeFileSync(propsPath, JSON.stringify(props), 'utf-8')
	}
}

/**
 * Extract the address book path segment from a file path.
 * Handles both composite usernames (username-bookid) and nested paths (username/bookid).
 * master: [bookId, filename]
 * composite user: [username-bookid, filename] -> extract bookId from username
 * nested user: [username, bookId, filename] -> extract bookId from path
 */
function extractBookPathSegmentFromPath(filePath: string): string | null {
	const parts = filePath.split(path.sep).filter(Boolean)
	const rootIndex = parts.lastIndexOf('collection-root')
	if (rootIndex === -1) return null
	const relative = parts.slice(rootIndex + 1)
	if (relative.length < 2) return null
	
	// Check if first segment is a composite username (username-bookid)
	const firstSegment = relative[0]
	const parsed = parseCompositeUsername(firstSegment)
	if (parsed) {
		// Composite username: return the bookId from the username
		return parsed.bookId
	}
	
	// Nested path: return the second segment (bookId)
	return relative.length >= 3 ? relative[1] : relative[0]
}

/**
 * Get all vCard files from Radicale storage
 * Checks both the master directory and all user directories
 */
async function getVCardFiles(): Promise<Array<string>> {
	const files: Array<string> = []
	const { books, hasAddressBooks } = await getAddressBooksForSync()

	// Check master directories first
	for (const book of books) {
		const masterPath = getAddressBookPath(book.id)
		if (fs.existsSync(masterPath)) {
			const masterFiles = fs.readdirSync(masterPath)
			masterFiles
				.filter(file => (file.endsWith('.vcf') || file.endsWith('.ics')) && file !== '.Radicale.props')
				.forEach(file => files.push(path.join(masterPath, file)))
		}
	}

	// Check user directories (where clients might create contacts)
	try {
		const users = await getUsers()
		for (const user of users) {
			// Skip ro-* users (read-only subscriptions)
			if (user.username.startsWith('ro-')) continue
			
			if (hasAddressBooks) {
				// For composite usernames, the path already includes the bookId
				if (isCompositeUsername(user.username)) {
					const userPath = getAddressBookPathForUser(user.username, '') // bookId not needed for composite
					if (fs.existsSync(userPath)) {
						const userFiles = fs.readdirSync(userPath)
						userFiles
							.filter(file => (file.endsWith('.vcf') || file.endsWith('.ics')) && file !== '.Radicale.props')
							.forEach(file => files.push(path.join(userPath, file)))
					}
				} else {
					// Base username: check all assigned books
					const { getExplicitAddressBookIdsForUser } = await import('./db')
					const assignedBookIds = await getExplicitAddressBookIdsForUser(user.username)
					for (const book of books) {
						if (book.is_public || assignedBookIds.includes(book.id)) {
							const compositeUsername = getCompositeUsername(user.username, book.id)
							const userPath = getAddressBookPathForUser(compositeUsername, '')
							if (fs.existsSync(userPath)) {
								const userFiles = fs.readdirSync(userPath)
								userFiles
									.filter(file => (file.endsWith('.vcf') || file.endsWith('.ics')) && file !== '.Radicale.props')
									.forEach(file => files.push(path.join(userPath, file)))
							}
						}
					}
				}
			} else {
				// No address books: use regular username
				for (const book of books) {
					const userPath = getAddressBookPathForUser(user.username, book.id)
					if (fs.existsSync(userPath)) {
						const userFiles = fs.readdirSync(userPath)
						userFiles
							.filter(file => (file.endsWith('.vcf') || file.endsWith('.ics')) && file !== '.Radicale.props')
							.forEach(file => files.push(path.join(userPath, file)))
					}
				}
			}
		}
	} catch (error) {
		console.error('Error reading user directories:', error)
	}

	return files
}

/**
 * Read a vCard file from Radicale storage
 */
function readVCardFile(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, 'utf-8')
	} catch (error: unknown) {
		// ENOENT (file not found) is expected in some cases (files deleted between listing and reading)
		// Only log other errors to reduce noise
		if (getErrorCode(error) !== 'ENOENT') {
			console.error(`Error reading vCard file ${filePath}:`, error)
		}
		return null
	}
}

/**
 * Write a vCard file to Radicale storage
 * Writes to both the master location and each user's directory
 */
async function writeVCardFile(book: AddressBook, vcardId: string, vcardData: string, usernames: Array<string>): Promise<void> {
	const masterPath = getAddressBookPath(book.id)
	ensureDirectoryExists(masterPath)
	ensureAddressBookProps(masterPath, book)
	const masterFilePath = path.join(masterPath, `${vcardId}.vcf`)
	fs.writeFileSync(masterFilePath, vcardData, 'utf-8')

	try {
		for (const username of usernames) {
			const userPath = getAddressBookPathForUser(username, book.id)
			ensureDirectoryExists(userPath)
			ensureAddressBookProps(userPath, book)
			const userFilePath = path.join(userPath, `${vcardId}.vcf`)
			fs.writeFileSync(userFilePath, vcardData, 'utf-8')
		}
	} catch (error) {
		console.error('Error writing to user directories:', error)
	}
}

/**
 * Delete a vCard file from Radicale storage
 * Deletes from both the master location and each user's directory
 */
async function deleteVCardFile(book: AddressBook, vcardId: string, usernames: Array<string>): Promise<void> {
	const masterPath = getAddressBookPath(book.id)
	const masterFilePath = path.join(masterPath, `${vcardId}.vcf`)
	if (fs.existsSync(masterFilePath)) {
		fs.unlinkSync(masterFilePath)
	}

	try {
		for (const username of usernames) {
			const userPath = getAddressBookPathForUser(username, book.id)
			const userFilePath = path.join(userPath, `${vcardId}.vcf`)
			if (fs.existsSync(userFilePath)) {
				fs.unlinkSync(userFilePath)
			}
		}
	} catch (error) {
		console.error('Error deleting from user directories:', error)
	}
}

/**
 * Extract vCard ID from filename or vCard content
 */
function extractVCardId(filePath: string, vcardContent: string): string | null {
	// Try to extract from vCard content first
	const uidMatch = vcardContent.match(/^UID:(.+)$/m)
	if (uidMatch) {
		return uidMatch[1].trim()
	}

	// Fall back to filename
	const fileName = path.basename(filePath, path.extname(filePath))
	return fileName
}

/**
 * Calculate SHA256 hash of vCard content for change detection
 */
function calculateVCardHash(vcardContent: string): string {
	return crypto.createHash('sha256').update(vcardContent, 'utf8').digest('hex')
}

/**
 * Get file modification time from filesystem
 */
function getFileModificationTime(filePath: string): Date | null {
	try {
		const stats = fs.statSync(filePath)
		return stats.mtime
	} catch {
		return null
	}
}

export interface ConflictInfo {
	hasConflict: boolean
	dbNewer: boolean
	radicaleNewer: boolean
	dbTimestamp: Date
	radicaleTimestamp: Date
}

/**
 * Detect if there's a conflict between DB and Radicale versions
 * A conflict exists when both sides have been modified since the last sync
 * @param syncDirection 'db-to-radicale' or 'radicale-to-db' - determines which timestamps to use
 */
function detectConflict(
	contact: Contact,
	radicaleFileMtime: Date | null,
	radicaleHash: string,
	syncDirection: 'db-to-radicale' | 'radicale-to-db'
): ConflictInfo {
	const dbTimestamp = contact.updated_at
	const radicaleTimestamp = radicaleFileMtime || new Date(0)

	let dbModifiedAfterSync: boolean
	let radicaleModifiedAfterSync: boolean

	if (syncDirection === 'db-to-radicale') {
		// When syncing DB → Radicale:
		// - Check if DB was modified after we last sent TO Radicale
		// - Check if Radicale was modified after we last received FROM Radicale
		dbModifiedAfterSync = contact.last_synced_to_radicale_at ? dbTimestamp > contact.last_synced_to_radicale_at : true // If never synced, assume modified
		radicaleModifiedAfterSync = contact.last_synced_from_radicale_at ? radicaleTimestamp > contact.last_synced_from_radicale_at : true // If never synced, assume modified
	} else {
		// When syncing Radicale → DB:
		// - Check if DB was modified after we last received FROM Radicale
		// - Check if Radicale was modified after we last received FROM Radicale
		dbModifiedAfterSync = contact.last_synced_from_radicale_at ? dbTimestamp > contact.last_synced_from_radicale_at : true // If never synced, assume modified
		radicaleModifiedAfterSync = contact.last_synced_from_radicale_at ? radicaleTimestamp > contact.last_synced_from_radicale_at : true // If never synced, assume modified
	}

	// Conflict exists if both sides modified AND hashes differ
	const hasConflict = dbModifiedAfterSync && radicaleModifiedAfterSync && contact.vcard_hash !== null && contact.vcard_hash !== radicaleHash

	return {
		hasConflict,
		dbNewer: dbTimestamp > radicaleTimestamp,
		radicaleNewer: radicaleTimestamp > dbTimestamp,
		dbTimestamp,
		radicaleTimestamp,
	}
}

/**
 * Resolve conflict using last-write-wins strategy
 * Returns 'db' if DB version should be used, 'radicale' if Radicale version should be used
 */
function resolveConflict(conflict: ConflictInfo): 'db' | 'radicale' {
	// Last-write-wins: use the most recent timestamp
	return conflict.dbNewer ? 'db' : 'radicale'
}

/**
 * Sync from PostgreSQL to Radicale
 * Only syncs contacts that have changed since last sync to prevent loops
 */
export async function syncDbToRadicale(): Promise<void> {
	console.log('Syncing PostgreSQL → Radicale...')

	try {
		const contacts = await getContactsNeedingRadicaleSync()
		const { books, defaultBook, hasAddressBooks } = await getAddressBooksForSync()
		const bookById = new Map(books.map(book => [book.id, book]))

		// Build usersByBookId using composite usernames (username-bookid)
		// This allows each address book to have its own CardDAV account
		const usersByBookId = new Map<string, Set<string>>()
		for (const book of books) {
			usersByBookId.set(book.id, new Set<string>())
		}
		
		if (hasAddressBooks) {
			// Get base users from database (not htpasswd, which includes composite users)
			const { getExplicitAddressBookIdsForUser } = await import('./db')
			const allHtpasswdUsers = await getUsers()
			// Extract base usernames (exclude composite and ro-*)
			const baseUsernames = new Set<string>()
			for (const user of allHtpasswdUsers) {
				if (user.username.startsWith('ro-')) continue
				if (isCompositeUsername(user.username)) continue
				baseUsernames.add(user.username)
			}
			
			// For each base user, get their assigned books and create composite usernames
			for (const baseUsername of baseUsernames) {
				const assignedBookIds = await getExplicitAddressBookIdsForUser(baseUsername)
				// Also include public books
				for (const book of books) {
					if (book.is_public || assignedBookIds.includes(book.id)) {
						if (!usersByBookId.has(book.id)) {
							usersByBookId.set(book.id, new Set<string>())
						}
						const compositeUsername = getCompositeUsername(baseUsername, book.id)
						usersByBookId.get(book.id)?.add(compositeUsername)
					}
				}
			}
		} else {
			// No address books: use regular usernames (backward compatibility)
			const users = await getUsers()
			for (const user of users) {
				if (user.username.startsWith('ro-')) continue
				if (isCompositeUsername(user.username)) continue
				for (const book of books) {
					if (!usersByBookId.has(book.id)) {
						usersByBookId.set(book.id, new Set<string>())
					}
					usersByBookId.get(book.id)?.add(user.username)
				}
			}
		}

		const contactBookEntries = await getContactAddressBookEntries()
		const contactBookIdsByContactId = new Map<string, Set<string>>()
		for (const entry of contactBookEntries) {
			const existing = contactBookIdsByContactId.get(entry.contact_id) || new Set<string>()
			existing.add(entry.address_book_id)
			contactBookIdsByContactId.set(entry.contact_id, existing)
		}

		const existingVCardIdsByBookId = new Map<string, Set<string>>()
		for (const book of books) {
			existingVCardIdsByBookId.set(book.id, new Set<string>())
		}

		let synced = 0
		let skipped = 0
		let conflicts = 0

		for (const contact of contacts) {
			if (!contact.vcard_id) {
				console.warn(`Contact ${contact.id} has no vcard_id, skipping`)
				continue
			}

			let bookIds = contactBookIdsByContactId.get(contact.id) || new Set<string>()
			if (bookIds.size === 0 && hasAddressBooks && defaultBook) {
				bookIds = new Set<string>([defaultBook.id])
				contactBookIdsByContactId.set(contact.id, bookIds)
				await setContactAddressBooks(contact.id, [defaultBook.id])
			}

			const targetBooks = Array.from(bookIds)
				.map(id => bookById.get(id))
				.filter((book): book is AddressBook => Boolean(book))

			const booksToSync = targetBooks.length > 0 ? targetBooks : hasAddressBooks ? [defaultBook] : books
			for (const book of booksToSync) {
				existingVCardIdsByBookId.get(book.id)?.add(contact.vcard_id)
			}

			const primaryBook = booksToSync.find(book => book.id === defaultBook.id) || booksToSync[0]
			if (!primaryBook) continue

			const vcardData =
				contact.vcard_data ||
				generateVCard(
					{},
					{
						...contact,
						phones: contact.phones || null,
						emails: contact.emails || null,
						addresses: contact.addresses || null,
						urls: contact.urls || null,
					}
				)

			const newHash = calculateVCardHash(vcardData)
			const primaryMasterPath = getAddressBookPath(primaryBook.id)
			ensureDirectoryExists(primaryMasterPath)
			const primaryFilePath = path.join(primaryMasterPath, `${contact.vcard_id}.vcf`)
			const radicaleFileExists = fs.existsSync(primaryFilePath)

			if (radicaleFileExists) {
				const existingVCardContent = readVCardFile(primaryFilePath)
				if (existingVCardContent) {
					const existingHash = calculateVCardHash(existingVCardContent)
					const fileMtime = getFileModificationTime(primaryFilePath)

					if (newHash === existingHash && contact.vcard_hash === newHash) {
						await updateSyncMetadata(contact.id, {
							last_synced_to_radicale_at: new Date(),
							vcard_hash: newHash,
							radicale_file_mtime: fileMtime,
						})
						skipped++
						continue
					}

					if (fileMtime && (contact.last_synced_to_radicale_at || contact.last_synced_from_radicale_at)) {
						const conflict = detectConflict(contact, fileMtime, existingHash, 'db-to-radicale')
						if (conflict.hasConflict) {
							conflicts++
							const resolution = resolveConflict(conflict)
							if (resolution === 'radicale') {
								console.log(`Conflict detected for ${contact.vcard_id}: Radicale version is newer, skipping sync`)
								await updateSyncMetadata(contact.id, {
									last_synced_to_radicale_at: new Date(),
									radicale_file_mtime: fileMtime,
								})
								skipped++
								continue
							}
							console.log(`Conflict detected for ${contact.vcard_id}: DB version is newer, overwriting Radicale`)
						}
					}
				}
			}

			for (const book of booksToSync) {
				const usernames = Array.from(usersByBookId.get(book.id) || [])
				await writeVCardFile(book, contact.vcard_id, vcardData, usernames)
			}

			const fileMtime = getFileModificationTime(primaryFilePath)
			await updateSyncMetadata(contact.id, {
				last_synced_to_radicale_at: new Date(),
				vcard_hash: newHash,
				radicale_file_mtime: fileMtime,
				sync_source: contact.sync_source === 'api' ? 'api' : 'db',
			})

			synced++
		}

		for (const book of books) {
			const masterPath = getAddressBookPath(book.id)
			if (!fs.existsSync(masterPath)) continue
			const masterFiles = fs.readdirSync(masterPath)
			const masterVCardFiles = masterFiles.filter(file => (file.endsWith('.vcf') || file.endsWith('.ics')) && file !== '.Radicale.props')
			const existingVCardIds = existingVCardIdsByBookId.get(book.id) || new Set<string>()
			const usernames = Array.from(usersByBookId.get(book.id) || [])

			for (const fileName of masterVCardFiles) {
				const filePath = path.join(masterPath, fileName)
				if (!fs.existsSync(filePath)) continue
				const vcardContent = readVCardFile(filePath)
				if (!vcardContent) continue
				const vcardId = extractVCardId(filePath, vcardContent)
				if (vcardId && !existingVCardIds.has(vcardId)) {
					console.log(`Deleting orphaned vCard file from ${book.id}: ${vcardId}`)
					await deleteVCardFile(book, vcardId, usernames)
				}
			}
		}

		// Copy master to read-only subscription dirs (ro-{book_id}/{book_id}) for books with readonly enabled
		const readonlyRows = await getAllAddressBookReadonly()
		for (const row of readonlyRows) {
			const book = bookById.get(row.address_book_id)
			if (!book) continue
			const masterPath = getAddressBookPath(book.id)
			if (!fs.existsSync(masterPath)) continue
			const roUsername = `ro-${book.id}`
			const roPath = path.join(RADICALE_STORAGE_PATH, 'collection-root', roUsername, book.id)
			ensureDirectoryExists(roPath)
			ensureAddressBookProps(roPath, book)
			const masterFiles = fs.readdirSync(masterPath)
			for (const file of masterFiles) {
				if (!file.endsWith('.vcf') && !file.endsWith('.ics')) continue
				if (file === '.Radicale.props') continue
				const src = path.join(masterPath, file)
				const dest = path.join(roPath, file)
				try {
					fs.copyFileSync(src, dest)
				} catch (err) {
					console.warn(`Failed to copy ${file} to read-only dir for ${book.name}:`, err)
				}
			}
		}

		if (synced > 0 || skipped > 0 || conflicts > 0) {
			console.log(`Synced ${synced} contacts to Radicale (${skipped} skipped, ${conflicts} conflicts resolved)`)
		}
	} catch (error) {
		console.error('Error syncing DB to Radicale:', error)
		throw error
	}
}

/**
 * Sync from Radicale to PostgreSQL
 * Only syncs files that have changed since last sync to prevent loops
 * @param silent If true, suppresses the initial "Syncing..." log message
 */
export async function syncRadicaleToDb(silent: boolean = false): Promise<void> {
	if (!silent) {
		console.log('Syncing Radicale → PostgreSQL...')
	}

	try {
		const vcardFiles = await getVCardFiles()
		const { books, defaultBook, hasAddressBooks } = await getAddressBooksForSync()
		const bookBySlug = new Map(books.map(book => [book.slug, book]))
		const bookById = new Map(books.map(book => [book.id, book]))

		const dbContacts = await getAllContacts()
		const dbContactsByVcardId = new Map<string, Contact>()
		for (const contact of dbContacts) {
			if (contact.vcard_id) {
				dbContactsByVcardId.set(contact.vcard_id, contact)
			}
		}

		const contactBookEntries = await getContactAddressBookEntries()
		const contactBookIdsByContactId = new Map<string, Set<string>>()
		for (const entry of contactBookEntries) {
			const existing = contactBookIdsByContactId.get(entry.contact_id) || new Set<string>()
			existing.add(entry.address_book_id)
			contactBookIdsByContactId.set(entry.contact_id, existing)
		}

		const users = await getUsers()
		const usersByBookId = new Map<string, Set<string>>()
		for (const book of books) {
			usersByBookId.set(book.id, new Set<string>())
		}
		// Build usersByBookId using composite usernames
		if (hasAddressBooks) {
			const { getExplicitAddressBookIdsForUser } = await import('./db')
			const allUsers = await getUsers()
			const baseUsernames = new Set<string>()
			for (const user of allUsers) {
				if (user.username.startsWith('ro-')) continue
				if (isCompositeUsername(user.username)) {
					// Composite user: extract bookId and add to mapping
					const parsed = parseCompositeUsername(user.username)
					if (parsed) {
						if (!usersByBookId.has(parsed.bookId)) {
							usersByBookId.set(parsed.bookId, new Set<string>())
						}
						usersByBookId.get(parsed.bookId)?.add(user.username)
					}
				} else {
					baseUsernames.add(user.username)
				}
			}
			// Also handle base usernames (for backward compatibility or if composite users not created yet)
			for (const baseUsername of baseUsernames) {
				const assignedBookIds = await getExplicitAddressBookIdsForUser(baseUsername)
				for (const book of books) {
					if (book.is_public || assignedBookIds.includes(book.id)) {
						if (!usersByBookId.has(book.id)) {
							usersByBookId.set(book.id, new Set<string>())
						}
						const compositeUsername = getCompositeUsername(baseUsername, book.id)
						usersByBookId.get(book.id)?.add(compositeUsername)
					}
				}
			}
		} else {
			// No address books: use regular usernames
			for (const user of users) {
				if (user.username.startsWith('ro-')) continue
				if (isCompositeUsername(user.username)) continue
				for (const book of books) {
					if (!usersByBookId.has(book.id)) {
						usersByBookId.set(book.id, new Set<string>())
					}
					usersByBookId.get(book.id)?.add(user.username)
				}
			}
		}

		const booksWithUsers = new Set<string>()
		for (const [bookId, usernames] of usersByBookId.entries()) {
			if (usernames.size > 0) {
				booksWithUsers.add(bookId)
			}
		}

		const radicaleVCardIdsByBookId = new Map<string, Set<string>>()
		for (const book of books) {
			radicaleVCardIdsByBookId.set(book.id, new Set<string>())
		}

		const latestFiles = new Map<
			string,
			{
				book: AddressBook
				vcardId: string
				filePath: string
				fileMtime: Date | null
				vcardContent: string
			}
		>()

		for (const filePath of vcardFiles) {
			const vcardContent = readVCardFile(filePath)
			if (!vcardContent) continue

			const vcardData = parseVCard(vcardContent)
			const vcardId = vcardData.uid || extractVCardId(filePath, vcardContent)
			if (!vcardId) {
				console.warn(`Could not extract vCard ID from ${filePath}, skipping`)
				continue
			}

			const pathSegment = extractBookPathSegmentFromPath(filePath)
			const book =
				(pathSegment && bookById.get(pathSegment)) ||
				(pathSegment && bookBySlug.get(pathSegment)) ||
				(pathSegment === 'shared-contacts' ? defaultBook : null)
			if (!book) {
				console.warn(`Unknown address book for ${filePath}, skipping`)
				continue
			}

			const fileMtime = getFileModificationTime(filePath)
			const key = `${book.id}:${vcardId}`
			const existing = latestFiles.get(key)
			if (!existing || (fileMtime && existing.fileMtime && fileMtime > existing.fileMtime) || (fileMtime && !existing.fileMtime)) {
				latestFiles.set(key, { book, vcardId, filePath, fileMtime, vcardContent })
			}
		}

		let created = 0
		let updated = 0
		let skipped = 0
		let conflicts = 0

		for (const { book, vcardId, filePath, fileMtime, vcardContent } of latestFiles.values()) {
			const vcardData = parseVCard(vcardContent)
			const vcardHash = calculateVCardHash(vcardContent)
			radicaleVCardIdsByBookId.get(book.id)?.add(vcardId)
			const existingContact = dbContactsByVcardId.get(vcardId)

			// Check if we need to sync this file
			if (existingContact) {
				// Check if file hasn't changed since last sync
				if (fileMtime && existingContact.last_synced_from_radicale_at) {
					if (fileMtime <= existingContact.last_synced_from_radicale_at && existingContact.vcard_hash === vcardHash) {
						// File hasn't changed, skip
						skipped++
						continue
					}
				}

				// Check for conflict: both sides changed
				if (
					fileMtime &&
					existingContact.last_synced_from_radicale_at &&
					existingContact.updated_at > existingContact.last_synced_from_radicale_at &&
					existingContact.vcard_hash !== null &&
					existingContact.vcard_hash !== vcardHash
				) {
					const conflict = detectConflict(existingContact, fileMtime, vcardHash, 'radicale-to-db')
					if (conflict.hasConflict) {
						conflicts++
						const resolution = resolveConflict(conflict)
						if (resolution === 'db') {
							// DB version wins, skip updating from Radicale
							console.log(`Conflict detected for ${vcardId}: DB version is newer, skipping Radicale update`)
							// Update metadata to reflect we saw the Radicale file
							await updateSyncMetadata(existingContact.id, {
								last_synced_from_radicale_at: new Date(),
								radicale_file_mtime: fileMtime,
							})
							skipped++
							continue
						}
						// Radicale version wins, continue to update
						console.log(`Conflict detected for ${vcardId}: Radicale version is newer, updating DB`)
					}
				}
			}

			// Parse name
			const nameParts = vcardData.n ? vcardData.n.split(';') : []
			const firstName = nameParts[1] || ''
			const lastName = nameParts[0] || ''
			const middleName = nameParts[2] || ''
			const namePrefix = nameParts[3] || ''
			const nameSuffix = nameParts[4] || ''
			const fullName = vcardData.fn || `${firstName} ${middleName} ${lastName}`.trim() || 'Unknown'

			// Parse birthday (BDAY format: YYYYMMDD or YYYY-MM-DD)
			let birthday: Date | null = null
			if (vcardData.bday) {
				const bdayStr = vcardData.bday.replace(/-/g, '')
				if (bdayStr.length >= 8) {
					const year = parseInt(bdayStr.substring(0, 4), 10)
					const month = parseInt(bdayStr.substring(4, 6), 10) - 1 // Month is 0-indexed
					const day = parseInt(bdayStr.substring(6, 8), 10)
					if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
						birthday = new Date(year, month, day)
					}
				}
			}

			// Extract maiden name from notes if present
			let maidenName: string | null = null
			let notes = vcardData.note || null
			if (notes) {
				const maidenMatch = notes.match(/Maiden name:\s*(.+)/i)
				if (maidenMatch) {
					maidenName = maidenMatch[1].trim()
					// Remove maiden name from notes
					notes = notes.replace(/Maiden name:\s*.+/i, '').trim() || null
				}
			}

			// Convert vCard arrays to Contact arrays
			const phones =
				vcardData.tels && vcardData.tels.length > 0 ? vcardData.tels : vcardData.tel ? [{ value: vcardData.tel, type: 'CELL' }] : []

			const emails =
				vcardData.emails && vcardData.emails.length > 0
					? vcardData.emails
					: vcardData.email
						? [{ value: vcardData.email, type: 'INTERNET' }]
						: []

			const addresses =
				vcardData.addresses && vcardData.addresses.length > 0
					? vcardData.addresses
					: vcardData.adr
						? [{ value: vcardData.adr, type: 'HOME' }]
						: []

			const urls =
				vcardData.urls && vcardData.urls.length > 0 ? vcardData.urls : vcardData.url ? [{ value: vcardData.url, type: 'HOME' }] : []

			// Photo (base64)
			let photoBlob: Buffer | null = null
			let photoMime: string | null = null
			let photoHash: string | null = null
			if (vcardData.photo?.data) {
				try {
					photoBlob = Buffer.from(vcardData.photo.data, 'base64')
					const type = vcardData.photo.type?.toUpperCase()
					if (type === 'PNG') {
						photoMime = 'image/png'
					} else if (type === 'JPEG' || type === 'JPG') {
						photoMime = 'image/jpeg'
					} else {
						photoMime = 'image/jpeg'
					}
					photoHash = crypto.createHash('sha256').update(photoBlob).digest('hex')
				} catch (error) {
					console.warn(`Failed to decode photo for ${vcardId}:`, error)
				}
			}

			const contactData: Partial<Contact> = {
				vcard_id: vcardId,
				full_name: fullName,
				first_name: firstName || null,
				last_name: lastName || null,
				middle_name: middleName || null,
				name_prefix: namePrefix || null,
				name_suffix: nameSuffix || null,
				nickname: vcardData.nickname || null,
				maiden_name: maidenName,
				// Backward compatibility: set single values from arrays
				email: emails.length > 0 ? emails[0].value : null,
				phone: phones.length > 0 ? phones[0].value : null,
				address: addresses.length > 0 ? addresses[0].value : null,
				homepage: urls.length > 0 ? urls[0].value : null,
				// New array fields
				phones: phones.length > 0 ? phones : null,
				emails: emails.length > 0 ? emails : null,
				addresses: addresses.length > 0 ? addresses : null,
				urls: urls.length > 0 ? urls : null,
				organization: vcardData.org || null,
				org_units: vcardData.orgUnits && vcardData.orgUnits.length > 0 ? vcardData.orgUnits : null,
				job_title: vcardData.title || null,
				role: vcardData.role || null,
				birthday: birthday,
				categories: vcardData.categories && vcardData.categories.length > 0 ? vcardData.categories : null,
				labels: vcardData.labels && vcardData.labels.length > 0 ? vcardData.labels : null,
				logos: vcardData.logos && vcardData.logos.length > 0 ? vcardData.logos : null,
				sounds: vcardData.sounds && vcardData.sounds.length > 0 ? vcardData.sounds : null,
				keys: vcardData.keys && vcardData.keys.length > 0 ? vcardData.keys : null,
				mailer: vcardData.mailer || null,
				time_zone: vcardData.tz || null,
				geo: vcardData.geo || null,
				agent: vcardData.agent || null,
				prod_id: vcardData.prodid || null,
				revision: vcardData.rev || null,
				sort_string: vcardData.sortString || null,
				class: vcardData.class || null,
				custom_fields: vcardData.customFields && vcardData.customFields.length > 0 ? vcardData.customFields : null,
				notes: notes,
				photo_blob: photoBlob,
				photo_mime: photoMime,
				photo_width: null,
				photo_height: null,
				photo_updated_at: photoBlob ? fileMtime || new Date() : null,
				photo_hash: photoHash,
				vcard_data: vcardContent,
			}

			if (existingContact) {
				const updatedContact = await updateContact(existingContact.id, contactData)
				dbContactsByVcardId.set(vcardId, updatedContact)
				await updateSyncMetadata(existingContact.id, {
					last_synced_from_radicale_at: new Date(),
					vcard_hash: vcardHash,
					radicale_file_mtime: fileMtime,
					sync_source: 'radicale',
				})
				updated++
			} else {
				try {
					const newContact = await createContact(contactData)
					dbContactsByVcardId.set(vcardId, newContact)
					// Update sync metadata for new contact
					await updateSyncMetadata(newContact.id, {
						last_synced_from_radicale_at: new Date(),
						vcard_hash: vcardHash,
						radicale_file_mtime: fileMtime,
						sync_source: 'radicale',
					})

					const masterPath = getAddressBookPath(book.id)
					const masterFilePath = path.join(masterPath, `${vcardId}.vcf`)
					if (!fs.existsSync(masterFilePath)) {
						ensureDirectoryExists(masterPath)
						ensureAddressBookProps(masterPath, book)
						fs.writeFileSync(masterFilePath, vcardContent, 'utf-8')
						console.log(`Copied new contact ${vcardId} into ${book.id} master directory`)
					}

					created++
				} catch (error) {
					const errorCode = (error as { code?: string }).code
					const constraint = (error as { constraint?: string }).constraint
					if (errorCode === '23505' && constraint === 'contacts_vcard_id_key') {
						const duplicateContact = await getContactByVcardId(vcardId)
						if (duplicateContact) {
							const updatedContact = await updateContact(duplicateContact.id, contactData)
							dbContactsByVcardId.set(vcardId, updatedContact)
							await updateSyncMetadata(duplicateContact.id, {
								last_synced_from_radicale_at: new Date(),
								vcard_hash: vcardHash,
								radicale_file_mtime: fileMtime,
								sync_source: 'radicale',
							})
							updated++
							continue
						}
					}
					throw error
				}
			}

			const contactId = existingContact?.id || dbContactsByVcardId.get(vcardId)?.id
			if (contactId && hasAddressBooks) {
				const currentBookIds = contactBookIdsByContactId.get(contactId) || new Set<string>()
				if (!currentBookIds.has(book.id)) {
					currentBookIds.add(book.id)
					await setContactAddressBooks(contactId, Array.from(currentBookIds))
					contactBookIdsByContactId.set(contactId, currentBookIds)
				}
			}
		}

		// Handle deletions: delete DB contacts that were created from Radicale but no longer exist there
		for (const contact of dbContacts) {
			if (!contact.vcard_id) continue
			const currentBookIds = contactBookIdsByContactId.get(contact.id) || new Set<string>()
			let changed = false

			for (const bookId of Array.from(currentBookIds)) {
				if (!booksWithUsers.has(bookId)) {
					continue
				}
				const radicaleIds = radicaleVCardIdsByBookId.get(bookId) || new Set<string>()
				if (!radicaleIds.has(contact.vcard_id)) {
					currentBookIds.delete(bookId)
					changed = true
				}
			}

			if (changed && hasAddressBooks) {
				await setContactAddressBooks(contact.id, Array.from(currentBookIds))
				contactBookIdsByContactId.set(contact.id, currentBookIds)
			}

			if (currentBookIds.size === 0 && contact.sync_source === 'radicale') {
				console.log(`Deleting contact ${contact.vcard_id} from DB (deleted from all address books)`)
				await deleteContact(contact.id)
			}
		}

		if (created > 0 || updated > 0 || skipped > 0 || conflicts > 0) {
			console.log(`Synced Radicale to DB: ${created} created, ${updated} updated (${skipped} skipped, ${conflicts} conflicts resolved)`)
		}
	} catch (error) {
		console.error('Error syncing Radicale to DB:', error)
		throw error
	}
}

/**
 * Start watching Radicale storage for changes
 * Watches both the master directory and all user directories
 */
export async function startWatchingRadicale(): Promise<void> {
	const { books, hasAddressBooks } = await getAddressBooksForSync()
	const watchers: ReturnType<typeof watch>[] = []
	const watchedPaths = new Set<string>()

	for (const book of books) {
		const masterPath = getAddressBookPath(book.id)
		ensureDirectoryExists(masterPath)
		if (!watchedPaths.has(masterPath)) {
			const masterWatcher = watch(masterPath, {
				ignored: /(^|[\\/])\../,
				persistent: true,
				ignoreInitial: true,
			})
			watchers.push(masterWatcher)
			watchedPaths.add(masterPath)
			console.log(`Watching Radicale storage: ${masterPath}`)
		}
	}

	console.log(`File watcher debounce: ${FILE_WATCHER_DEBOUNCE_MS}ms`)

	try {
		const users = await getUsers()
		for (const user of users) {
			const userBooks = hasAddressBooks ? await getAddressBooksForUser(user.username) : books
			for (const book of userBooks) {
				const userPath = getAddressBookPathForUser(user.username, book.id)
				ensureDirectoryExists(userPath)
				if (watchedPaths.has(userPath)) continue
				const userWatcher = watch(userPath, {
					ignored: /(^|[\\/])\../,
					persistent: true,
					ignoreInitial: true,
				})
				watchers.push(userWatcher)
				watchedPaths.add(userPath)
				console.log(`Also watching user directory: ${userPath}`)
			}
		}
	} catch (error) {
		console.error('Error setting up user directory watchers:', error)
	}

	// Use a single debounce mechanism for all watchers
	if (watchers.length === 0) {
		console.warn('No Radicale directories available to watch.')
		return
	}
	const allWatchers = watchers

	// Debounce file changes to batch multiple changes together
	let debounceTimer: NodeJS.Timeout | null = null
	const pendingFiles = new Set<string>()

	const triggerDebouncedSync = async () => {
		if (pendingFiles.size === 0) return

		const files = Array.from(pendingFiles)
		pendingFiles.clear()

		// Only log if there are many files changed (likely a batch sync)
		if (files.length > 1) {
			console.log(`${files.length} vCard files changed, syncing Radicale → PostgreSQL...`)
		} else if (files.length === 1) {
			console.log(`vCard file changed: ${files[0]}, syncing Radicale → PostgreSQL...`)
		}

		await syncRadicaleToDb(true) // Silent mode since we already logged above
	}

	const scheduleSync = (filePath: string) => {
		pendingFiles.add(filePath)

		if (debounceTimer) {
			clearTimeout(debounceTimer)
		}

		debounceTimer = setTimeout(() => {
			debounceTimer = null
			triggerDebouncedSync()
		}, FILE_WATCHER_DEBOUNCE_MS)
	}

	// Set up event handlers for all watchers
	for (const watcher of allWatchers) {
		watcher.on('add', (filePath: string) => {
			scheduleSync(filePath)
		})

		watcher.on('change', (filePath: string) => {
			scheduleSync(filePath)
		})

		watcher.on('unlink', async (filePath: string) => {
			// Handle file deletion
			// Extract vCard ID from filename (file is already deleted, so we can't read it)
			const fileName = path.basename(filePath, path.extname(filePath))
			const vcardId = fileName

			if (vcardId) {
				const contact = await getContactByVcardId(vcardId)
				if (contact) {
					const pathSegment = extractBookPathSegmentFromPath(filePath)
					const book =
						(pathSegment && (await getAddressBookById(pathSegment))) ||
						(pathSegment && (await getAddressBookBySlug(pathSegment))) ||
						(pathSegment === 'shared-contacts' ? await getDefaultAddressBook() : null)

					if (book && hasAddressBooks) {
						const currentBookIds = new Set(await getContactAddressBookIds(contact.id))
						if (currentBookIds.has(book.id)) {
							currentBookIds.delete(book.id)
							await setContactAddressBooks(contact.id, Array.from(currentBookIds))
						}
						if (currentBookIds.size === 0 && contact.sync_source === 'radicale') {
							console.log(`Deleting contact ${vcardId} from DB (deleted from all address books)`)
							await deleteContact(contact.id)
						} else if (contact.sync_source !== 'radicale') {
							console.log(`Contact ${vcardId} deleted from Radicale but keeping in DB (will be recreated)`)
						}
					} else if (contact.sync_source === 'radicale') {
						console.log(`Deleting contact ${vcardId} from DB (deleted from Radicale)`)
						await deleteContact(contact.id)
					} else {
						console.log(`Contact ${vcardId} deleted from Radicale but keeping in DB (will be recreated)`)
					}
				}
			}
			// Also trigger full sync to handle any other changes
			scheduleSync(filePath)
		})

		watcher.on('error', (error: unknown) => {
			console.error('Watcher error:', error)
		})
	}
}

/**
 * Start periodic sync
 */
export function startPeriodicSync(): void {
	console.log(`Starting periodic sync every ${SYNC_INTERVAL}ms`)

	setInterval(async () => {
		try {
			await syncDbToRadicale()
		} catch (error) {
			console.error('Periodic sync error:', error)
		}
	}, SYNC_INTERVAL)
}
