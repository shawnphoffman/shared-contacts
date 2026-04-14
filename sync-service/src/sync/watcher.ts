import * as path from 'path'
import { watch } from 'chokidar'
import {
	getAddressBookById,
	getAddressBookBySlug,
	getAddressBooksForUser,
	getContactAddressBookIds,
	getContactByVcardId,
	getDefaultAddressBook,
	deleteContact,
	setContactAddressBooks,
} from '../db'
import { getUsers } from '../htpasswd'
import { logger } from '../logger'
import { FILE_WATCHER_DEBOUNCE_MS } from './constants'
import { getAddressBooksForSync } from './address-books'
import { getAddressBookPath, getAddressBookPathForUser, ensureDirectoryExists, extractBookPathSegmentFromPath } from './radicale-fs'
import { syncRadicaleToDb } from './radicale-to-db'

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
			logger.info({ masterPath }, 'Watching Radicale storage')
		}
	}

	logger.info({ debounceMs: FILE_WATCHER_DEBOUNCE_MS }, 'File watcher debounce configured')

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
				logger.info({ userPath }, 'Also watching user directory')
			}
		}
	} catch (error) {
		logger.error({ err: error }, 'Error setting up user directory watchers')
	}

	// Use a single debounce mechanism for all watchers
	if (watchers.length === 0) {
		logger.warn('No Radicale directories available to watch.')
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
			logger.info({ fileCount: files.length }, 'vCard files changed, syncing Radicale → PostgreSQL...')
		} else if (files.length === 1) {
			logger.info({ file: files[0] }, 'vCard file changed, syncing Radicale → PostgreSQL...')
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
							logger.info({ vcardId }, 'Deleting contact from DB (deleted from all address books)')
							await deleteContact(contact.id)
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
			// Also trigger full sync to handle any other changes
			scheduleSync(filePath)
		})

		watcher.on('error', (error: unknown) => {
			logger.error({ err: error }, 'Watcher error')
		})
	}
}
