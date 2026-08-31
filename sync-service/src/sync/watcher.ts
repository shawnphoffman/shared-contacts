import * as path from 'path'
import { watch } from 'chokidar'
import {
	AddressBook,
	getAddressBookById,
	getAddressBookBySlug,
	getAddressBooksForUser,
	getContactAddressBookIds,
	getContactByVcardId,
	getDefaultAddressBook,
	deleteContact,
	setContactAddressBooks,
} from '../db'
import { getUsers, getCompositeUsername, isCompositeUsername } from '../htpasswd'
import { logger } from '../logger'
import { FILE_WATCHER_DEBOUNCE_MS } from './constants'
import { getAddressBooksForSync } from './address-books'
import {
	getAddressBookPath,
	getAddressBookPathForUser,
	ensureDirectoryExists,
	extractBookPathSegmentFromPath,
	deleteVCardFile,
} from './radicale-fs'
import { syncRadicaleToDb } from './radicale-to-db'

// Directories that already have a watcher. Watchers are never torn down: a
// collection that goes away leaves an idle watcher behind, which is harmless,
// whereas rebuilding the whole set on every refresh would drop events during
// the gap.
const watchedPaths = new Set<string>()

// Debounce file changes to batch multiple changes together
let debounceTimer: NodeJS.Timeout | null = null
const pendingFiles = new Set<string>()

const triggerDebouncedSync = async () => {
	if (pendingFiles.size === 0) return

	const files = Array.from(pendingFiles)
	pendingFiles.clear()

	// Only log if there are many files changed (likely a batch sync)
	if (files.length > 1) {
		logger.info({ fileCount: files.length }, 'vCard files changed, syncing Radicale → PostgreSQL...')
	} else if (files.length === 1) {
		logger.info({ file: files[0] }, 'vCard file changed, syncing Radicale → PostgreSQL...')
	}

	try {
		await syncRadicaleToDb(true) // Silent mode since we already logged above
	} catch (err) {
		// Swallow — rejecting here would surface as an unhandledRejection and
		// kill the process. Periodic sync and the next file change will
		// retry, so a transient DB outage resolves on its own.
		logger.error({ err }, 'Watcher-triggered sync failed; will retry on next change or periodic tick')
	}
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

// Composite usernames of everyone whose collection holds a copy of this
// book, matching how db-to-radicale fans writes out.
const subscriberUsernames = async (book: AddressBook): Promise<Array<string>> => {
	const usernames: Array<string> = []
	for (const user of await getUsers()) {
		if (user.username.startsWith('ro-')) continue
		if (isCompositeUsername(user.username)) continue
		const accessibleBooks = await getAddressBooksForUser(user.username)
		if (accessibleBooks.some(accessible => accessible.id === book.id)) {
			usernames.push(getCompositeUsername(user.username, book.id))
		}
	}
	return usernames
}

function attachHandlers(watcher: ReturnType<typeof watch>): void {
	watcher.on('add', (filePath: string) => {
		scheduleSync(filePath)
	})

	watcher.on('change', (filePath: string) => {
		scheduleSync(filePath)
	})

	watcher.on('unlink', (filePath: string) => {
		// Chokidar ignores the returned promise; if we let it reject, Node
		// sees an unhandledRejection and (per our process handlers) exits.
		// Wrap so a transient DB error here just logs; scheduleSync() below
		// will queue a recovery pass.
		void (async () => {
			try {
				// Handle file deletion
				// Extract vCard ID from filename (file is already deleted, so we can't read it)
				const fileName = path.basename(filePath, path.extname(filePath))
				const vcardId = fileName

				if (vcardId) {
					const contact = await getContactByVcardId(vcardId)
					if (contact) {
						// Read per event rather than captured at startup: the first book
						// can be created long after this watcher was attached, and a
						// stale `false` here takes the single-book branch below and
						// deletes the row outright instead of unsubscribing one book.
						const { hasAddressBooks } = await getAddressBooksForSync()
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
								logger.info({ vcardId }, 'Deleting contact from DB (deleted from all address books)')
								await deleteContact(contact.id)
								// The book is shared, so a delete on one device is a delete
								// for everyone subscribed to it. Clear the other collections
								// now rather than leaving it to the orphan sweep in
								// db-to-radicale: the debounced inbound sync below runs
								// first, and it would restore the contact from a peer's
								// still-present copy before the sweep ever ran.
								await deleteVCardFile(book, vcardId, await subscriberUsernames(book))
							} else if (contact.sync_source !== 'radicale') {
								logger.info({ vcardId }, 'Contact deleted from Radicale but keeping in DB (will be recreated)')
							}
						} else if (contact.sync_source === 'radicale') {
							logger.info({ vcardId }, 'Deleting contact from DB (deleted from Radicale)')
							await deleteContact(contact.id)
						} else {
							logger.info({ vcardId }, 'Contact deleted from Radicale but keeping in DB (will be recreated)')
						}
					}
				}
			} catch (err) {
				logger.error({ err, filePath }, 'Error handling file deletion; full sync will reconcile')
			} finally {
				// Also trigger full sync to handle any other changes
				scheduleSync(filePath)
			}
		})()
	})

	watcher.on('error', (error: unknown) => {
		logger.error({ err: error }, 'Watcher error')
	})
}

/** Returns true if this call is what started watching the directory. */
function watchDirectory(dirPath: string, message: string): boolean {
	if (watchedPaths.has(dirPath)) return false
	ensureDirectoryExists(dirPath)
	const watcher = watch(dirPath, {
		ignored: /(^|[\\/])\../,
		persistent: true,
		ignoreInitial: true,
	})
	watchedPaths.add(dirPath)
	attachHandlers(watcher)
	logger.info({ dirPath }, message)
	return true
}

/**
 * Add watchers for every collection that does not have one yet.
 *
 * Watching was a one-shot at boot, so an address book or a CardDAV account
 * created afterwards had no watcher at all: edits made there were invisible
 * until the service restarted. This is called on the periodic tick, so a new
 * collection is picked up within one interval without every creation site
 * having to remember to ask.
 */
export async function refreshRadicaleWatchers(): Promise<number> {
	const { books, hasAddressBooks } = await getAddressBooksForSync()
	let added = 0

	for (const book of books) {
		if (watchDirectory(getAddressBookPath(book.id), 'Watching Radicale storage')) added++
	}

	try {
		for (const user of await getUsers()) {
			const userBooks = hasAddressBooks ? await getAddressBooksForUser(user.username) : books
			for (const book of userBooks) {
				if (watchDirectory(getAddressBookPathForUser(user.username, book.id), 'Also watching user directory')) added++
			}
		}
	} catch (error) {
		logger.error({ err: error }, 'Error setting up user directory watchers')
	}

	return added
}

/**
 * Start watching Radicale storage for changes
 * Watches both the master directory and all user directories
 */
export async function startWatchingRadicale(): Promise<void> {
	logger.info({ debounceMs: FILE_WATCHER_DEBOUNCE_MS }, 'File watcher debounce configured')

	await refreshRadicaleWatchers()

	if (watchedPaths.size === 0) {
		logger.warn('No Radicale directories available to watch.')
	}
}
