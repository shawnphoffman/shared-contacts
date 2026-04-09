import * as fs from 'fs'
import * as path from 'path'
import { AddressBook } from '../db'
import { getUsers, getCompositeUsername, isCompositeUsername, parseCompositeUsername } from '../htpasswd'
import { atomicWriteFileSync } from '../fs-utils'
import { logger } from '../logger'
import { RADICALE_STORAGE_PATH, getErrorCode } from './constants'
import { getAddressBooksForSync } from './address-books'

/**
 * Get the path to an address book in Radicale for a specific user.
 * For composite usernames (username-bookid), returns the composite user's root directory.
 * For regular usernames, returns the nested path (username/bookid).
 */
export function getAddressBookPathForUser(username: string, bookId: string): string {
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
export function getAddressBookPath(bookId: string): string {
	return path.join(RADICALE_STORAGE_PATH, 'collection-root', bookId)
}

/**
 * Ensure the shared address book directory exists
 */
export function ensureDirectoryExists(dirPath: string): void {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true })
	}
}

export function ensureAddressBookProps(collectionPath: string, book: AddressBook): void {
	const propsPath = path.join(collectionPath, '.Radicale.props')
	if (!fs.existsSync(propsPath)) {
		const props = {
			tag: 'VADDRESSBOOK',
			'D:displayname': book.name,
			'C:addressbook-description': `Contacts for ${book.name}`,
		}
		atomicWriteFileSync(propsPath, JSON.stringify(props), 'utf-8')
	}
}

/**
 * Extract the address book path segment from a file path.
 * Handles both composite usernames (username-bookid) and nested paths (username/bookid).
 * master: [bookId, filename]
 * composite user: [username-bookid, filename] -> extract bookId from username
 * nested user: [username, bookId, filename] -> extract bookId from path
 */
export function extractBookPathSegmentFromPath(filePath: string): string | null {
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
 * Extract vCard ID from filename or vCard content
 */
export function extractVCardId(filePath: string, vcardContent: string): string | null {
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
 * Get all vCard files from Radicale storage
 * Checks both the master directory and all user directories
 */
export async function getVCardFiles(): Promise<Array<string>> {
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
					const { getExplicitAddressBookIdsForUser } = await import('../db')
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
		logger.error({ err: error }, 'Error reading user directories')
	}

	return files
}

/**
 * Read a vCard file from Radicale storage
 */
export function readVCardFile(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, 'utf-8')
	} catch (error: unknown) {
		// ENOENT (file not found) is expected in some cases (files deleted between listing and reading)
		// Only log other errors to reduce noise
		if (getErrorCode(error) !== 'ENOENT') {
			logger.error({ err: error, filePath }, 'Error reading vCard file')
		}
		return null
	}
}

/**
 * Write a vCard file to Radicale storage
 * Writes to both the master location and each user's directory
 */
export async function writeVCardFile(book: AddressBook, vcardId: string, vcardData: string, usernames: Array<string>): Promise<void> {
	const masterPath = getAddressBookPath(book.id)
	ensureDirectoryExists(masterPath)
	ensureAddressBookProps(masterPath, book)
	const masterFilePath = path.join(masterPath, `${vcardId}.vcf`)
	atomicWriteFileSync(masterFilePath, vcardData, 'utf-8')

	try {
		for (const username of usernames) {
			// For composite usernames, book.id is already in the username, so pass empty string
			// getAddressBookPathForUser will detect composite and use it directly
			const userPath = getAddressBookPathForUser(username, book.id)
			ensureDirectoryExists(userPath)
			ensureAddressBookProps(userPath, book)
			const userFilePath = path.join(userPath, `${vcardId}.vcf`)
			atomicWriteFileSync(userFilePath, vcardData, 'utf-8')
		}
	} catch (error) {
		logger.error({ err: error }, 'Error writing to user directories')
	}
}

/**
 * Delete a vCard file from Radicale storage
 * Deletes from both the master location and each user's directory
 */
export async function deleteVCardFile(book: AddressBook, vcardId: string, usernames: Array<string>): Promise<void> {
	const masterPath = getAddressBookPath(book.id)
	const masterFilePath = path.join(masterPath, `${vcardId}.vcf`)
	if (fs.existsSync(masterFilePath)) {
		fs.unlinkSync(masterFilePath)
	}

	try {
		for (const username of usernames) {
			// For composite usernames, book.id is already in the username
			const userPath = getAddressBookPathForUser(username, book.id)
			const userFilePath = path.join(userPath, `${vcardId}.vcf`)
			if (fs.existsSync(userFilePath)) {
				fs.unlinkSync(userFilePath)
			}
		}
	} catch (error) {
		logger.error({ err: error }, 'Error deleting from user directories')
	}
}

/**
 * Get file modification time from filesystem
 */
export function getFileModificationTime(filePath: string): Date | null {
	try {
		const stats = fs.statSync(filePath)
		return stats.mtime
	} catch {
		return null
	}
}
