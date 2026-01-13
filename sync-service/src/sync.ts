import * as fs from 'fs'
import * as path from 'path'
import { watch } from 'chokidar'
import { Contact, getAllContacts, createContact, updateContact, getContactByVcardId, deleteContact } from './db'
import { parseVCard, generateVCard, VCardData } from './vcard'
import { getUsers } from './htpasswd'

const RADICALE_STORAGE_PATH = process.env.RADICALE_STORAGE_PATH || '/radicale-data/collections'
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL || '30000', 10) // Default 30 seconds instead of 5
const FILE_WATCHER_DEBOUNCE_MS = parseInt(process.env.FILE_WATCHER_DEBOUNCE_MS || '2000', 10) // Debounce file changes for 2 seconds

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
 */
function getVCardFiles(): string[] {
	const addressBookPath = getSharedAddressBookPath()
	if (!fs.existsSync(addressBookPath)) {
		return []
	}

	const files = fs.readdirSync(addressBookPath)
	return files.filter(file => file.endsWith('.vcf') || file.endsWith('.ics')).map(file => path.join(addressBookPath, file))
}

/**
 * Read a vCard file from Radicale storage
 */
function readVCardFile(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, 'utf-8')
	} catch (error) {
		console.error(`Error reading vCard file ${filePath}:`, error)
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
 * Sync from PostgreSQL to Radicale
 */
export async function syncDbToRadicale(): Promise<void> {
	console.log('Syncing PostgreSQL → Radicale...')

	try {
		const contacts = await getAllContacts()
		const addressBookPath = getSharedAddressBookPath()
		ensureDirectoryExists(addressBookPath)

		// Get existing vCard files
		const existingFiles = getVCardFiles()
		const existingVCardIds = new Set<string>()

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
			await writeVCardFile(contact.vcard_id, vcardData)
		}

		// Delete vCard files that no longer exist in DB
		for (const filePath of existingFiles) {
			const vcardContent = readVCardFile(filePath)
			if (vcardContent) {
				const vcardId = extractVCardId(filePath, vcardContent)
				if (vcardId && !existingVCardIds.has(vcardId)) {
					console.log(`Deleting orphaned vCard file: ${vcardId}`)
					await deleteVCardFile(vcardId)
				}
			}
		}

		if (contacts.length > 0) {
			console.log(`Synced ${contacts.length} contacts to Radicale`)
		}
	} catch (error) {
		console.error('Error syncing DB to Radicale:', error)
		throw error
	}
}

/**
 * Sync from Radicale to PostgreSQL
 * @param silent If true, suppresses the initial "Syncing..." log message
 */
export async function syncRadicaleToDb(silent: boolean = false): Promise<void> {
	if (!silent) {
		console.log('Syncing Radicale → PostgreSQL...')
	}

	try {
		const vcardFiles = getVCardFiles()
		const dbContacts = await getAllContacts()
		const dbContactsByVcardId = new Map<string, Contact>()

		for (const contact of dbContacts) {
			if (contact.vcard_id) {
				dbContactsByVcardId.set(contact.vcard_id, contact)
			}
		}

		let created = 0
		let updated = 0

		for (const filePath of vcardFiles) {
			const vcardContent = readVCardFile(filePath)
			if (!vcardContent) continue

			const vcardData = parseVCard(vcardContent)
			const vcardId = vcardData.uid || extractVCardId(filePath, vcardContent)

			if (!vcardId) {
				console.warn(`Could not extract vCard ID from ${filePath}, skipping`)
				continue
			}

			const existingContact = dbContactsByVcardId.get(vcardId)

			// Parse name
			const nameParts = vcardData.n ? vcardData.n.split(';') : []
			const firstName = nameParts[1] || ''
			const lastName = nameParts[0] || ''
			const middleName = nameParts[2] || ''
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

			const contactData: Partial<Contact> = {
				vcard_id: vcardId,
				full_name: fullName,
				first_name: firstName || null,
				last_name: lastName || null,
				middle_name: middleName || null,
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
				job_title: vcardData.title || null,
				birthday: birthday,
				notes: notes,
				vcard_data: vcardContent,
			}

			if (existingContact) {
				await updateContact(existingContact.id, contactData)
				updated++
			} else {
				await createContact(contactData)
				created++
			}
		}

		// Note: We don't delete DB contacts when vCard files are missing in Radicale
		// because the DB is the source of truth. The syncDbToRadicale function will
		// recreate vCard files for contacts that exist in the DB.
		// Only delete from DB if explicitly deleted from Radicale (handled by file watcher)

		if (created > 0 || updated > 0) {
			console.log(`Synced Radicale to DB: ${created} created, ${updated} updated`)
		}
	} catch (error) {
		console.error('Error syncing Radicale to DB:', error)
		throw error
	}
}

/**
 * Start watching Radicale storage for changes
 */
export function startWatchingRadicale(): void {
	const addressBookPath = getSharedAddressBookPath()
	ensureDirectoryExists(addressBookPath)

	console.log(`Watching Radicale storage: ${addressBookPath}`)
	console.log(`File watcher debounce: ${FILE_WATCHER_DEBOUNCE_MS}ms`)

	const watcher = watch(addressBookPath, {
		ignored: /(^|[\/\\])\../, // ignore dotfiles
		persistent: true,
		ignoreInitial: true,
	})

	// Debounce file changes to batch multiple changes together
	let debounceTimer: NodeJS.Timeout | null = null
	let pendingFiles = new Set<string>()

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

	watcher.on('add', filePath => {
		scheduleSync(filePath)
	})

	watcher.on('change', filePath => {
		scheduleSync(filePath)
	})

	watcher.on('unlink', filePath => {
		scheduleSync(filePath)
	})

	watcher.on('error', error => {
		console.error('Watcher error:', error)
	})
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
