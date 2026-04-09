import * as fs from 'fs'
import * as path from 'path'
import {
	AddressBook,
	getAllAddressBookReadonly,
	getContactAddressBookEntries,
	getContactsNeedingRadicaleSync,
	setContactAddressBooks,
	updateSyncMetadata,
} from '../db'
import { generateVCard } from '../vcard'
import { getUsers, getCompositeUsername, isCompositeUsername } from '../htpasswd'
import { logger } from '../logger'
import { RADICALE_STORAGE_PATH } from './constants'
import { getAddressBooksForSync } from './address-books'
import { calculateVCardHash, detectConflict, resolveConflict } from './conflict'
import {
	getAddressBookPath,
	getAddressBookPathForUser,
	ensureDirectoryExists,
	ensureAddressBookProps,
	extractVCardId,
	readVCardFile,
	writeVCardFile,
	deleteVCardFile,
	getFileModificationTime,
} from './radicale-fs'

/**
 * Sync from PostgreSQL to Radicale
 * Only syncs contacts that have changed since last sync to prevent loops
 */
export async function syncDbToRadicale(): Promise<void> {
	logger.info('Syncing PostgreSQL → Radicale...')

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
			const { getExplicitAddressBookIdsForUser } = await import('../db')
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
				logger.warn({ contactId: contact.id }, 'Contact has no vcard_id, skipping')
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
								logger.info({ vcardId: contact.vcard_id }, 'Conflict detected: Radicale version is newer, skipping sync')
								await updateSyncMetadata(contact.id, {
									last_synced_to_radicale_at: new Date(),
									radicale_file_mtime: fileMtime,
								})
								skipped++
								continue
							}
							logger.info({ vcardId: contact.vcard_id }, 'Conflict detected: DB version is newer, overwriting Radicale')
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
					logger.info({ bookId: book.id, vcardId }, 'Deleting orphaned vCard file')
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
					logger.warn({ err, file, bookName: book.name }, 'Failed to copy to read-only dir')
				}
			}
		}

		if (synced > 0 || skipped > 0 || conflicts > 0) {
			logger.info({ synced, skipped, conflicts }, 'Synced contacts to Radicale')
		}
	} catch (error) {
		logger.error({ err: error }, 'Error syncing DB to Radicale')
		throw error
	}
}
