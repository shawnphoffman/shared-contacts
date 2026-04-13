import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import {
	AddressBook,
	Contact,
	createContact,
	deleteContact,
	getAllContacts,
	getContactAddressBookEntries,
	getContactByVcardIdIncludingDeleted,
	restoreContact,
	setContactAddressBooks,
	updateContact,
	updateSyncMetadata,
} from '../db'
import { parseVCard } from '../vcard'
import { getUsers, getCompositeUsername, isCompositeUsername, parseCompositeUsername } from '../htpasswd'
import { atomicWriteFileSync } from '../fs-utils'
import { logger } from '../logger'
import { getAddressBooksForSync } from './address-books'
import { calculateVCardHash, detectConflict, resolveConflict } from './conflict'
import {
	getAddressBookPath,
	getVCardFiles,
	readVCardFile,
	extractVCardId,
	extractBookPathSegmentFromPath,
	getFileModificationTime,
	ensureDirectoryExists,
	ensureAddressBookProps,
} from './radicale-fs'

/**
 * Sync from Radicale to PostgreSQL
 * Only syncs files that have changed since last sync to prevent loops
 * @param silent If true, suppresses the initial "Syncing..." log message
 */
export async function syncRadicaleToDb(silent: boolean = false): Promise<void> {
	if (!silent) {
		logger.info('Syncing Radicale → PostgreSQL...')
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
			const { getExplicitAddressBookIdsForUser } = await import('../db')
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
				logger.warn({ filePath }, 'Could not extract vCard ID, skipping')
				continue
			}

			const pathSegment = extractBookPathSegmentFromPath(filePath)
			const book =
				(pathSegment && bookById.get(pathSegment)) ||
				(pathSegment && bookBySlug.get(pathSegment)) ||
				(pathSegment === 'shared-contacts' ? defaultBook : null)
			if (!book) {
				logger.warn({ filePath }, 'Unknown address book, skipping')
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

		for (const { book, vcardId, fileMtime, vcardContent } of latestFiles.values()) {
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
							logger.info({ vcardId }, 'Conflict detected: DB version is newer, skipping Radicale update')
							// Update metadata to reflect we saw the Radicale file
							await updateSyncMetadata(existingContact.id, {
								last_synced_from_radicale_at: new Date(),
								radicale_file_mtime: fileMtime,
							})
							skipped++
							continue
						}
						// Radicale version wins, continue to update
						logger.info({ vcardId }, 'Conflict detected: Radicale version is newer, updating DB')
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
					logger.warn({ err: error, vcardId }, 'Failed to decode photo')
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
						atomicWriteFileSync(masterFilePath, vcardContent, 'utf-8')
						logger.info({ vcardId, bookId: book.id }, 'Copied new contact into master directory')
					}

					created++
				} catch (error) {
					const errorCode = (error as { code?: string }).code
					const constraint = (error as { constraint?: string }).constraint
					if (errorCode === '23505' && constraint === 'contacts_vcard_id_key') {
						// The vcard_id already exists — could be a soft-deleted row or a
						// race condition.  Search including soft-deleted rows so we can
						// restore and update instead of crashing.
						const duplicateContact = await getContactByVcardIdIncludingDeleted(vcardId)
						if (duplicateContact) {
							if (duplicateContact.deleted_at) {
								await restoreContact(duplicateContact.id)
								logger.info({ vcardId }, 'Restored soft-deleted contact during sync')
							}
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
				logger.info({ vcardId: contact.vcard_id }, 'Deleting contact from DB (deleted from all address books)')
				await deleteContact(contact.id)
			}
		}

		if (created > 0 || updated > 0 || skipped > 0 || conflicts > 0) {
			logger.info({ created, updated, skipped, conflicts }, 'Synced Radicale to DB')
		}
	} catch (error) {
		logger.error({ err: error }, 'Error syncing Radicale to DB')
		throw error
	}
}
