import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { watch } from 'chokidar'
import {
	Contact,
	getAllContacts,
	createContact,
	updateContact,
	getContactByVcardId,
	deleteContact,
	updateSyncMetadata,
	getContactsNeedingRadicaleSync,
} from './db'
import { parseVCard, generateVCard } from './vcard'
import { getUsers } from './htpasswd'

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
 * Get the path to the shared address book in Radicale for a specific user
 * Radicale's web interface only shows collections that are children of the user's principal collection
 */
function getSharedAddressBookPathForUser(username: string): string {
	// Store the shared collection under each user's directory so it appears in the web interface
	return path.join(RADICALE_STORAGE_PATH, 'collection-root', username, 'shared-contacts')
}

/**
 * Get the main shared address book path (for backward compatibility and file watching)
 */
function getSharedAddressBookPath(): string {
	// Keep a master copy at the root level for the file watcher
	return path.join(RADICALE_STORAGE_PATH, 'collection-root', 'shared-contacts')
}

/**
 * Ensure the shared address book directory exists
 */
function ensureDirectoryExists(dirPath: string): void {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true })
	}
}

/**
 * Get all vCard files from Radicale storage
 * Checks both the master directory and all user directories
 */
async function getVCardFiles(): Promise<string[]> {
	const files = new Set<string>()

	// Check master directory
	const masterPath = getSharedAddressBookPath()
	if (fs.existsSync(masterPath)) {
		const masterFiles = fs.readdirSync(masterPath)
		masterFiles.filter(file => file.endsWith('.vcf') || file.endsWith('.ics')).forEach(file => files.add(path.join(masterPath, file)))
	}

	// Check all user directories (where clients might create contacts)
	try {
		const users = await getUsers()
		for (const user of users) {
			const userPath = getSharedAddressBookPathForUser(user.username)
			if (fs.existsSync(userPath)) {
				const userFiles = fs.readdirSync(userPath)
				userFiles
					.filter(file => (file.endsWith('.vcf') || file.endsWith('.ics')) && file !== '.Radicale.props')
					.forEach(file => files.add(path.join(userPath, file)))
			}
		}
	} catch (error) {
		console.error('Error reading user directories:', error)
		// Continue with master directory files only
	}

	return Array.from(files)
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
async function writeVCardFile(vcardId: string, vcardData: string): Promise<void> {
	// Write to master location
	const masterPath = getSharedAddressBookPath()
	ensureDirectoryExists(masterPath)
	const masterFilePath = path.join(masterPath, `${vcardId}.vcf`)
	fs.writeFileSync(masterFilePath, vcardData, 'utf-8')

	// Write to each user's directory so it appears in their web interface
	try {
		const users = await getUsers()
		for (const user of users) {
			const userPath = getSharedAddressBookPathForUser(user.username)
			ensureDirectoryExists(userPath)
			// Ensure .Radicale.props exists for the collection
			const propsPath = path.join(userPath, '.Radicale.props')
			if (!fs.existsSync(propsPath)) {
				const props = {
					tag: 'VADDRESSBOOK',
					'D:displayname': 'Shared Contacts',
					'C:addressbook-description': 'Shared contacts for all users',
				}
				fs.writeFileSync(propsPath, JSON.stringify(props), 'utf-8')
			}
			const userFilePath = path.join(userPath, `${vcardId}.vcf`)
			fs.writeFileSync(userFilePath, vcardData, 'utf-8')
		}
	} catch (error) {
		console.error('Error writing to user directories:', error)
		// Continue even if user directory writes fail
	}
}

/**
 * Delete a vCard file from Radicale storage
 * Deletes from both the master location and each user's directory
 */
async function deleteVCardFile(vcardId: string): Promise<void> {
	// Delete from master location
	const masterPath = getSharedAddressBookPath()
	const masterFilePath = path.join(masterPath, `${vcardId}.vcf`)
	if (fs.existsSync(masterFilePath)) {
		fs.unlinkSync(masterFilePath)
	}

	// Delete from each user's directory
	try {
		const users = await getUsers()
		for (const user of users) {
			const userPath = getSharedAddressBookPathForUser(user.username)
			const userFilePath = path.join(userPath, `${vcardId}.vcf`)
			if (fs.existsSync(userFilePath)) {
				fs.unlinkSync(userFilePath)
			}
		}
	} catch (error) {
		console.error('Error deleting from user directories:', error)
		// Continue even if user directory deletes fail
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
		// Only get contacts that need syncing
		const contacts = await getContactsNeedingRadicaleSync()
		const addressBookPath = getSharedAddressBookPath()
		ensureDirectoryExists(addressBookPath)

		const existingVCardIds = new Set<string>()

		let synced = 0
		let skipped = 0
		let conflicts = 0

		// Update/create vCard files
		for (const contact of contacts) {
			if (!contact.vcard_id) {
				console.warn(`Contact ${contact.id} has no vcard_id, skipping`)
				continue
			}

			existingVCardIds.add(contact.vcard_id)

			// Generate vCard with arrays if available
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

			// Check if Radicale file exists
			const masterFilePath = path.join(addressBookPath, `${contact.vcard_id}.vcf`)
			const radicaleFileExists = fs.existsSync(masterFilePath)

			if (radicaleFileExists) {
				// Read existing file to check for conflicts
				const existingVCardContent = readVCardFile(masterFilePath)
				if (existingVCardContent) {
					const existingHash = calculateVCardHash(existingVCardContent)
					const fileMtime = getFileModificationTime(masterFilePath)

					// If hash matches, no change needed
					if (newHash === existingHash && contact.vcard_hash === newHash) {
						// Content hasn't changed, just update sync timestamp
						await updateSyncMetadata(contact.id, {
							last_synced_to_radicale_at: new Date(),
							vcard_hash: newHash,
							radicale_file_mtime: fileMtime,
						})
						skipped++
						continue
					}

					// Check for conflict: both sides changed
					// Need to check if DB was modified after last sync TO Radicale, and if Radicale was modified after last sync FROM Radicale
					if (fileMtime && (contact.last_synced_to_radicale_at || contact.last_synced_from_radicale_at)) {
						const conflict = detectConflict(contact, fileMtime, existingHash, 'db-to-radicale')
						if (conflict.hasConflict) {
							conflicts++
							const resolution = resolveConflict(conflict)
							if (resolution === 'radicale') {
								// Radicale version wins, skip writing
								console.log(`Conflict detected for ${contact.vcard_id}: Radicale version is newer, skipping sync`)
								// Update metadata to reflect we saw the Radicale version
								await updateSyncMetadata(contact.id, {
									last_synced_to_radicale_at: new Date(),
									radicale_file_mtime: fileMtime,
								})
								skipped++
								continue
							}
							// DB version wins, continue to write
							console.log(`Conflict detected for ${contact.vcard_id}: DB version is newer, overwriting Radicale`)
						}
					}
				}
			}

			// Write vCard file
			await writeVCardFile(contact.vcard_id, vcardData)

			// Update sync metadata
			const fileMtime = getFileModificationTime(masterFilePath)
			await updateSyncMetadata(contact.id, {
				last_synced_to_radicale_at: new Date(),
				vcard_hash: newHash,
				radicale_file_mtime: fileMtime,
				sync_source: contact.sync_source === 'api' ? 'api' : 'db',
			})

			synced++
		}

		// Delete vCard files that no longer exist in DB
		// Only check master directory for orphaned files (user directories are just mirrors)
		const masterPath = getSharedAddressBookPath()
		if (fs.existsSync(masterPath)) {
			const masterFiles = fs.readdirSync(masterPath)
			const masterVCardFiles = masterFiles.filter(file => file.endsWith('.vcf') || file.endsWith('.ics'))

			for (const fileName of masterVCardFiles) {
				const filePath = path.join(masterPath, fileName)
				// Check if file still exists (might have been deleted between listing and now)
				if (!fs.existsSync(filePath)) {
					continue
				}

				const vcardContent = readVCardFile(filePath)
				if (vcardContent) {
					const vcardId = extractVCardId(filePath, vcardContent)
					if (vcardId && !existingVCardIds.has(vcardId)) {
						console.log(`Deleting orphaned vCard file: ${vcardId}`)
						await deleteVCardFile(vcardId)
					}
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
		const dbContacts = await getAllContacts()
		const dbContactsByVcardId = new Map<string, Contact>()
		const radicaleVCardIds = new Set<string>()

		for (const contact of dbContacts) {
			if (contact.vcard_id) {
				dbContactsByVcardId.set(contact.vcard_id, contact)
			}
		}

		let created = 0
		let updated = 0
		let skipped = 0
		let conflicts = 0

		for (const filePath of vcardFiles) {
			const vcardContent = readVCardFile(filePath)
			if (!vcardContent) continue

			const vcardData = parseVCard(vcardContent)
			const vcardId = vcardData.uid || extractVCardId(filePath, vcardContent)

			if (!vcardId) {
				console.warn(`Could not extract vCard ID from ${filePath}, skipping`)
				continue
			}

			radicaleVCardIds.add(vcardId)
			const existingContact = dbContactsByVcardId.get(vcardId)

			// Get file modification time and calculate hash
			const fileMtime = getFileModificationTime(filePath)
			const vcardHash = calculateVCardHash(vcardContent)

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
				await updateContact(existingContact.id, contactData)
				// Update sync metadata
				await updateSyncMetadata(existingContact.id, {
					last_synced_from_radicale_at: new Date(),
					vcard_hash: vcardHash,
					radicale_file_mtime: fileMtime,
					sync_source: 'radicale',
				})
				updated++
			} else {
				const newContact = await createContact(contactData)
				// Update sync metadata for new contact
				await updateSyncMetadata(newContact.id, {
					last_synced_from_radicale_at: new Date(),
					vcard_hash: vcardHash,
					radicale_file_mtime: fileMtime,
					sync_source: 'radicale',
				})

				// If contact was found in a user directory (not master), copy it to master directory
				// so it's available to all users immediately
				const masterPath = getSharedAddressBookPath()
				const masterFilePath = path.join(masterPath, `${vcardId}.vcf`)
				if (!fs.existsSync(masterFilePath)) {
					ensureDirectoryExists(masterPath)
					fs.writeFileSync(masterFilePath, vcardContent, 'utf-8')
					console.log(`Copied new contact ${vcardId} from user directory to master directory`)
				}

				created++
			}
		}

		// Handle deletions: delete DB contacts that were created from Radicale but no longer exist there
		for (const contact of dbContacts) {
			if (contact.vcard_id && !radicaleVCardIds.has(contact.vcard_id)) {
				// Contact exists in DB but not in Radicale
				if (contact.sync_source === 'radicale') {
					// Was created from Radicale, so delete from DB
					console.log(`Deleting contact ${contact.vcard_id} from DB (deleted from Radicale)`)
					await deleteContact(contact.id)
				}
				// If sync_source is 'api' or 'db', keep in DB - it will be recreated in Radicale on next sync
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
	const masterPath = getSharedAddressBookPath()
	ensureDirectoryExists(masterPath)

	console.log(`Watching Radicale storage: ${masterPath}`)
	console.log(`File watcher debounce: ${FILE_WATCHER_DEBOUNCE_MS}ms`)

	// Watch master directory
	const watchers: ReturnType<typeof watch>[] = []

	const masterWatcher = watch(masterPath, {
		ignored: /(^|[\\/])\../, // ignore dotfiles
		persistent: true,
		ignoreInitial: true,
	})
	watchers.push(masterWatcher)

	// Watch all user directories (where clients create contacts)
	try {
		const users = await getUsers()
		for (const user of users) {
			const userPath = getSharedAddressBookPathForUser(user.username)
			ensureDirectoryExists(userPath)

			const userWatcher = watch(userPath, {
				ignored: /(^|[\\/])\../, // ignore dotfiles
				persistent: true,
				ignoreInitial: true,
			})
			watchers.push(userWatcher)
			console.log(`Also watching user directory: ${userPath}`)
		}
	} catch (error) {
		console.error('Error setting up user directory watchers:', error)
		// Continue with master directory watcher only
	}

	// Use a single debounce mechanism for all watchers
	const allWatchers = watchers.length > 0 ? watchers : [masterWatcher]

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
		watcher.on('add', filePath => {
			scheduleSync(filePath)
		})

		watcher.on('change', filePath => {
			scheduleSync(filePath)
		})

		watcher.on('unlink', async filePath => {
			// Handle file deletion
			// Extract vCard ID from filename (file is already deleted, so we can't read it)
			const fileName = path.basename(filePath, path.extname(filePath))
			const vcardId = fileName

			if (vcardId) {
				const contact = await getContactByVcardId(vcardId)
				if (contact) {
					// Only delete from DB if contact was created from Radicale
					if (contact.sync_source === 'radicale') {
						console.log(`Deleting contact ${vcardId} from DB (deleted from Radicale)`)
						await deleteContact(contact.id)
					} else {
						// Contact was created via API/DB, keep it - will be recreated in Radicale on next sync
						console.log(`Contact ${vcardId} deleted from Radicale but keeping in DB (will be recreated)`)
					}
				}
			}
			// Also trigger full sync to handle any other changes
			scheduleSync(filePath)
		})

		watcher.on('error', error => {
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
