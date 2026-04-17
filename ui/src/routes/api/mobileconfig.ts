import { createHash } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import {
	getAddressBook,
	getAddressBookReadonly,
	getAddressBooks,
	getAppSetting,
	getUserAddressBookIds,
} from '../../lib/db'
import { signMobileconfig } from '../../lib/mobileconfig-signer'

function getCardDAVBaseUrlFromRequest(request: Request): string {
	const envBase = process.env.PUBLIC_CARDDAV_URL
	if (envBase) {
		return envBase
	}

	// When no PUBLIC_CARDDAV_URL is configured, derive from the incoming request.
	// Use the request's own origin (protocol + host) so that the profile works
	// behind a reverse proxy on standard ports (443 for HTTPS, 80 for HTTP).
	// Do NOT hardcode the internal Radicale port (5232) — mobile devices connect
	// through the proxy, not directly.
	const url = new URL(request.url)
	return url.origin
}

function xmlEscape(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// Derive a stable v5-style UUID from a namespace + name. Keeping top-level and
// CardDAV payload UUIDs stable across reinstalls lets iOS replace the existing
// profile in place rather than accumulating duplicates.
function deterministicUUID(namespace: string, name: string): string {
	const hash = createHash('sha1').update(`${namespace}:${name}`).digest()
	const bytes = Buffer.from(hash.subarray(0, 16))
	bytes[6] = (bytes[6] & 0x0f) | 0x50 // version 5
	bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
	const hex = bytes.toString('hex')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const UUID_NAMESPACE = 'shared-contacts.mobileconfig'

async function resolveOrganization(): Promise<string> {
	try {
		const fromDb = await getAppSetting('mobileconfig_org')
		if (fromDb && fromDb.trim()) return fromDb.trim()
	} catch (error) {
		logger.warn({ err: error }, 'Failed to read mobileconfig_org from app_settings; falling back to env')
	}
	return process.env.MOBILECONFIG_ORG || process.env.MOBILECONFIG_ORG_NAME || 'Shared Contacts'
}

interface BookPayloadInput {
	bookId: string
	bookName: string
	username: string
}

interface BuildOptions {
	organization: string
	hostName: string
	port: number
	useSSL: boolean
	topLevel: {
		identifier: string
		uuid: string
		displayName: string
		description: string
	}
	books: Array<BookPayloadInput>
}

function buildCarddavPayload(book: BookPayloadInput, topLevelIdentifier: string, hostName: string, port: number, useSSL: boolean, organization: string): string {
	const shortBookId = book.bookId.replace(/-/g, '').slice(0, 8) || book.bookId
	const innerIdentifier = `${topLevelIdentifier}.${shortBookId}`
	const innerUUID = deterministicUUID(UUID_NAMESPACE, innerIdentifier)
	const compositeUsername = `${book.username}-${book.bookId}`
	const accountDisplayName = `${organization} (${book.bookName})`

	return `    <dict>
      <key>PayloadType</key>
      <string>com.apple.carddav.account</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>PayloadIdentifier</key>
      <string>${xmlEscape(innerIdentifier)}</string>
      <key>PayloadUUID</key>
      <string>${xmlEscape(innerUUID)}</string>
      <key>PayloadDisplayName</key>
      <string>${xmlEscape(accountDisplayName)}</string>
      <key>CardDAVAccountDescription</key>
      <string>${xmlEscape(accountDisplayName)}</string>
      <key>CardDAVHostName</key>
      <string>${xmlEscape(hostName)}</string>
      <key>CardDAVPort</key>
      <integer>${port}</integer>
      <key>CardDAVUseSSL</key>
      <${useSSL ? 'true' : 'false'}/>
      <key>CardDAVUsername</key>
      <string>${xmlEscape(compositeUsername)}</string>
    </dict>`
}

export function buildMobileconfigXml(options: BuildOptions): string {
	const { organization, hostName, port, useSSL, topLevel, books } = options
	const payloads = books.map(book => buildCarddavPayload(book, topLevel.identifier, hostName, port, useSSL, organization)).join('\n')

	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
${payloads}
  </array>
  <key>PayloadOrganization</key>
  <string>${xmlEscape(organization)}</string>
  <key>PayloadDisplayName</key>
  <string>${xmlEscape(topLevel.displayName)}</string>
  <key>PayloadDescription</key>
  <string>${xmlEscape(topLevel.description)}</string>
  <key>PayloadIdentifier</key>
  <string>${xmlEscape(topLevel.identifier)}</string>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${xmlEscape(topLevel.uuid)}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`
}

async function resolveBooksForUser(username: string): Promise<Array<{ id: string; name: string }>> {
	const allBooks = await getAddressBooks()
	if (username.startsWith('ro-')) {
		// Readonly subscription usernames encode the single book they can access.
		return []
	}
	const assignedIds = new Set(await getUserAddressBookIds(username))
	return allBooks
		.filter(book => assignedIds.has(book.id) || book.is_public)
		.map(book => ({ id: book.id, name: book.name }))
}

export const Route = createFileRoute('/api/mobileconfig')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url)
					const username = (url.searchParams.get('username') || '').trim()
					const bookId = (url.searchParams.get('bookId') || '').trim()
					const combined = url.searchParams.get('combined') === '1' || url.searchParams.get('combined') === 'true'

					if (!username) {
						return json({ error: 'username is required' }, { status: 400 })
					}

					const baseUrl = getCardDAVBaseUrlFromRequest(request)
					const baseUrlObj = new URL(baseUrl)
					const hostName = baseUrlObj.hostname
					const port = baseUrlObj.port ? Number(baseUrlObj.port) : baseUrlObj.protocol === 'https:' ? 443 : 80
					const useSSL = baseUrlObj.protocol === 'https:'
					const organization = await resolveOrganization()
					const safeUsernameForId = username.replace(/[^a-zA-Z0-9_-]/g, '_')

					let books: Array<BookPayloadInput>
					let topLevelIdentifier: string
					let topLevelDisplayName: string
					let description: string
					let filename: string

					if (combined) {
						if (username.startsWith('ro-')) {
							return json({ error: 'Combined profiles are not available for read-only subscriptions' }, { status: 400 })
						}
						const userBooks = await resolveBooksForUser(username)
						if (userBooks.length === 0) {
							return json({ error: 'No address books available for this user' }, { status: 404 })
						}
						books = userBooks.map(book => ({ bookId: book.id, bookName: book.name, username }))
						topLevelIdentifier = `com.shared-contacts.carddav.bundle.${safeUsernameForId}`
						topLevelDisplayName = `${organization} (${username})`
						description = `Configures ${userBooks.length} CardDAV account(s) for user ${username}.`
						filename = `shared-contacts-${safeUsernameForId}-all.mobileconfig`
					} else {
						if (!bookId) {
							return json({ error: 'bookId is required' }, { status: 400 })
						}
						const addressBook = await getAddressBook(bookId)
						if (!addressBook) {
							return json({ error: 'Address book not found' }, { status: 404 })
						}

						// For readonly subscriptions (ro-<bookId>), require readonly to be enabled.
						// For all other usernames, trust the UI's filtering (it only shows rows the user can see).
						if (username.startsWith('ro-')) {
							const expectedUsername = `ro-${bookId}`
							if (username !== expectedUsername) {
								return json({ error: 'Read-only username does not match this address book' }, { status: 400 })
							}
							const roConfig = await getAddressBookReadonly(bookId)
							if (!roConfig) {
								return json({ error: 'Read-only subscription is not enabled for this address book' }, { status: 400 })
							}
						}

						const shortBookId = bookId.replace(/-/g, '').slice(0, 8) || bookId
						books = [{ bookId, bookName: addressBook.name, username }]
						topLevelIdentifier = `com.shared-contacts.carddav.${safeUsernameForId}.${shortBookId}`
						topLevelDisplayName = `${organization}: ${addressBook.name}`
						description = `Configures a CardDAV account for ${addressBook.name} for user ${username}.`
						filename = `shared-contacts-${safeUsernameForId}-${shortBookId}.mobileconfig`
					}

					const topLevelUUID = deterministicUUID(UUID_NAMESPACE, topLevelIdentifier)
					const xml = buildMobileconfigXml({
						organization,
						hostName,
						port,
						useSSL,
						topLevel: {
							identifier: topLevelIdentifier,
							uuid: topLevelUUID,
							displayName: topLevelDisplayName,
							description,
						},
						books,
					})

					const signed = await signMobileconfig(xml)

					// Hand the runtime an ArrayBuffer slice rather than a Node Buffer — the
					// fetch Response type varies between runtimes and this form is accepted
					// universally. The signed body may be DER bytes or XML bytes.
					const arrayBuffer =
						signed.body.buffer instanceof ArrayBuffer
							? signed.body.buffer.slice(signed.body.byteOffset, signed.body.byteOffset + signed.body.byteLength)
							: Uint8Array.from(signed.body).buffer

					return new Response(arrayBuffer, {
						status: 200,
						headers: {
							'Content-Type': signed.contentType,
							'Content-Disposition': `attachment; filename="${filename}"`,
						},
					})
				} catch (error) {
					logger.error({ err: error }, 'Error generating mobileconfig profile')
					return json({ error: 'Failed to generate mobileconfig profile' }, { status: 500 })
				}
			},
		},
	},
})
