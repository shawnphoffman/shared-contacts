import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getAddressBook, getAddressBookReadonly } from '../../lib/db'

function getCardDAVBaseUrlFromRequest(request: Request): string {
	const envBase = process.env.PUBLIC_CARDDAV_URL
	if (envBase) {
		return envBase
	}

	const url = new URL(request.url)

	// Prefer proxy-style URL semantics, similar to getProxyCardDAVBaseUrl on the client:
	// protocol + '//' + hostname + ':5232'
	const protocol = url.protocol
	const hostname = url.hostname

	return `${protocol}//${hostname}:5232`
}

function xmlEscape(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export const Route = createFileRoute('/api/mobileconfig')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url)
					const username = (url.searchParams.get('username') || '').trim()
					const bookId = (url.searchParams.get('bookId') || '').trim()

					if (!username || !bookId) {
						return json({ error: 'username and bookId are required' }, { status: 400 })
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

					const baseUrl = getCardDAVBaseUrlFromRequest(request)
					const baseUrlObj = new URL(baseUrl)

					const hostName = baseUrlObj.hostname
					const port = baseUrlObj.port ? Number(baseUrlObj.port) : baseUrlObj.protocol === 'https:' ? 443 : 80
					const useSSL = baseUrlObj.protocol === 'https:'

					// Composite username and principal URL must match what the UI shows.
					const compositeUsername = `${username}-${bookId}`
					const principalPath = `/${encodeURIComponent(compositeUsername)}/`

					const organization = process.env.MOBILECONFIG_ORG || process.env.MOBILECONFIG_ORG_NAME || 'Shared Contacts'
					const shortBookId = bookId.replace(/-/g, '').slice(0, 8) || bookId
					const safeUsernameForId = username.replace(/[^a-zA-Z0-9_-]/g, '_')
					const profileIdentifier = `com.shared-contacts.carddav.${safeUsernameForId}.${shortBookId}`

					const containerUUID = randomUUID()
					const carddavUUID = randomUUID()

					const profileDisplayName = `Shared Contacts: ${addressBook.name}`
					const accountDisplayName = `Shared Contacts (${addressBook.name})`
					const description = `Configures a CardDAV account for ${addressBook.name} for user ${username}.`

					const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key>
      <string>com.apple.carddav.account</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>PayloadIdentifier</key>
      <string>${xmlEscape(profileIdentifier)}.carddav</string>
      <key>PayloadUUID</key>
      <string>${xmlEscape(carddavUUID)}</string>
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
      <key>CardDAVPrincipalURL</key>
      <string>${xmlEscape(principalPath)}</string>
      <key>CardDAVUsername</key>
      <string>${xmlEscape(compositeUsername)}</string>
    </dict>
  </array>
  <key>PayloadOrganization</key>
  <string>${xmlEscape(organization)}</string>
  <key>PayloadDisplayName</key>
  <string>${xmlEscape(profileDisplayName)}</string>
  <key>PayloadDescription</key>
  <string>${xmlEscape(description)}</string>
  <key>PayloadIdentifier</key>
  <string>${xmlEscape(profileIdentifier)}</string>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${xmlEscape(containerUUID)}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`

					const filename = `shared-contacts-${safeUsernameForId}-${shortBookId}.mobileconfig`

					return new Response(plist, {
						status: 200,
						headers: {
							'Content-Type': 'application/x-apple-aspen-config; charset=utf-8',
							'Content-Disposition': `attachment; filename="${filename}"`,
						},
					})
				} catch (error) {
					console.error('Error generating mobileconfig profile:', error)
					return json({ error: 'Failed to generate mobileconfig profile' }, { status: 500 })
				}
			},
		},
	},
})
