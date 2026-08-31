import * as fs from 'fs'
import * as path from 'path'
import {
	AddressBook,
	getAllAddressBookReadonly,
	getContactAddressBookEntries,
	getContactsNeedingRadicaleSync,
	getLiveContactVCardIds,
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
	getVCardFilePath,
	isSafeVCardId,
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

		// True only when every subscriber of every target book already holds a copy
		// of this card. Existence only, see the call site for why hashing each
		// per-user copy would be wasted I/O.
		const allUserCopiesExist = (vcardId: string, targetBooks: Array<AddressBook>): boolean =>
			targetBooks.every(book =>
				Array.from(usersByBookId.get(book.id) || []).every(username =>
					fs.existsSync(getVCardFilePath(getAddressBookPathForUser(username, book.id), vcardId))
				)
			)

		const contactBookEntries = await getContactAddressBookEntries()
		const contactBookIdsByContactId = new Map<string, Set<string>>()
		for (const entry of contactBookEntries) {
			const existing = contactBookIdsByContactId.get(entry.contact_id) || new Set<string>()
			existing.add(entry.address_book_id)
			contactBookIdsByContactId.set(entry.contact_id, existing)
		}

		const booksHoldingContact = (contactId: string): Array<AddressBook> => {
			const assigned = Array.from(contactBookIdsByContactId.get(contactId) || [])
				.map(id => bookById.get(id))
				.filter((book): book is AddressBook => Boolean(book))
			return assigned.length > 0 ? assigned : hasAddressBooks ? [defaultBook] : books
		}

		// Which cards legitimately belong on disk. The orphan sweep at the end of
		// this pass deletes every master file missing from this set, and deletes it
		// out of each subscriber's collection with it, so the set has to describe
		// every live contact rather than only the ones needing a write this pass.
		// Keyed to the write list, "did not need syncing" meant "orphan": a single
		// pass in which a contact's row was already up to date removed its card
		// from every device, and the inbound pass then read those missing files as
		// a client-side delete and soft-deleted the rows behind them.
		const existingVCardIdsByBookId = new Map<string, Set<string>>()
		for (const book of books) {
			existingVCardIdsByBookId.set(book.id, new Set<string>())
		}
		for (const live of await getLiveContactVCardIds()) {
			for (const book of booksHoldingContact(live.id)) {
				existingVCardIdsByBookId.get(book.id)?.add(live.vcard_id)
			}
		}

		let synced = 0
		let skipped = 0
		let conflicts = 0

		for (const contact of contacts) {
			if (!contact.vcard_id) {
				logger.warn({ contactId: contact.id }, 'Contact has no vcard_id, skipping')
				continue
			}

			// Rows predating id validation (or written by a client that slipped one
			// past it) would name a file outside the collection; skip rather than
			// abort the pass for every other contact.
			if (!isSafeVCardId(contact.vcard_id)) {
				logger.warn({ contactId: contact.id, vcardId: contact.vcard_id }, 'Contact has an unsafe vcard_id, skipping')
				continue
			}

			let bookIds = contactBookIdsByContactId.get(contact.id) || new Set<string>()
			if (bookIds.size === 0 && hasAddressBooks && defaultBook) {
				bookIds = new Set<string>([defaultBook.id])
				contactBookIdsByContactId.set(contact.id, bookIds)
				await setContactAddressBooks(contact.id, [defaultBook.id])
			}

			const booksToSync = booksHoldingContact(contact.id)
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
			const primaryFilePath = getVCardFilePath(primaryMasterPath, contact.vcard_id)
			const radicaleFileExists = fs.existsSync(primaryFilePath)

			if (radicaleFileExists) {
				const existingVCardContent = readVCardFile(primaryFilePath)
				if (existingVCardContent) {
					const existingHash = calculateVCardHash(existingVCardContent)
					const fileMtime = getFileModificationTime(primaryFilePath)

					// The master copy matching is not enough to call this contact synced:
					// a card that a CardDAV client created in its own collection is
					// copied straight to master by radicale-to-db, which leaves master,
					// vcard_data and vcard_hash all in agreement while every *other*
					// subscriber's collection still lacks the file. Skipping here left
					// those subscribers permanently missing the card. Content staleness
					// is already covered by the hash comparison above (any edit changes
					// vcard_hash and forces a full rewrite), so a cheap existence check
					// is all the per-user copies need.
					if (newHash === existingHash && contact.vcard_hash === newHash && allUserCopiesExist(contact.vcard_id, booksToSync)) {
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
				// sync_source records where the contact came from, not which
				// direction last wrote it. Writing 'db' here erased the fact that a
				// card originated in a CardDAV client, and the three deletion checks
				// (watcher unlink, and the sweep in radicale-to-db) only honour a
				// client-side delete when sync_source is still 'radicale'. Once it had
				// been overwritten, deleting a contact or a list on a device did not
				// remove it: it was written straight back out. Preserve both
				// non-'db' origins.
				sync_source: contact.sync_source === 'api' || contact.sync_source === 'radicale' ? contact.sync_source : 'db',
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
				if (vcardId && !isSafeVCardId(vcardId)) {
					logger.warn({ filePath, vcardId }, 'Orphan sweep found an unsafe vCard id, skipping')
					continue
				}
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
