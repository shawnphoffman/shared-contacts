import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, Lock, Server, User } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Button } from '../components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Separator } from '../components/ui/separator'

export const Route = createFileRoute('/carddav-connection')({
	component: CardDAVConnectionPage,
})

interface RadicaleUser {
	username: string
}

interface AddressBook {
	id: string
	name: string
	slug: string
	is_public: boolean
	readonly_enabled?: boolean
}

async function fetchUsers(): Promise<Array<RadicaleUser>> {
	const response = await fetch('/api/radicale-users')
	if (!response.ok) {
		throw new Error('Failed to fetch users')
	}
	return response.json()
}

async function fetchAddressBooks(): Promise<Array<AddressBook>> {
	const response = await fetch('/api/address-books?readonly=1')
	if (!response.ok) {
		throw new Error('Failed to fetch address books')
	}
	return response.json()
}

function getDirectCardDAVBaseUrl(): string {
	if (typeof window !== 'undefined') {
		const { hostname } = window.location
		return `http://${hostname}:5232`
	}
	return 'http://localhost:5232'
}

function getDirectUIBaseUrl(): string {
	if (typeof window !== 'undefined') {
		const { hostname } = window.location
		return `http://${hostname}:3030`
	}
	return 'http://localhost:3030'
}

function getProxyCardDAVBaseUrl(): string {
	if (typeof window !== 'undefined') {
		const { hostname } = window.location
		if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')) {
			return 'https://carddav.example.com'
		}
		const carddavHost = hostname.startsWith('contacts.') ? hostname.replace(/^contacts\./, 'carddav.') : `carddav.${hostname}`
		return `https://${carddavHost}`
	}
	return 'https://carddav.example.com'
}

function getProxyUIBaseUrl(): string {
	if (typeof window !== 'undefined') {
		const { hostname, protocol } = window.location
		if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')) {
			return 'https://contacts.example.com'
		}
		if (hostname.startsWith('carddav.')) {
			return `${protocol}//${hostname.replace(/^carddav\./, 'contacts.')}`
		}
		return `${protocol}//${hostname}`
	}
	return 'https://contacts.example.com'
}

/** CardDAV subscription URL for a user and address book (uses stable book id in path). */
function getCardDAVUrl(username: string, bookId: string, baseUrl: string): string {
	return `${baseUrl}/${encodeURIComponent(username)}/${encodeURIComponent(bookId)}/`
}

function CopyButton({ text, label }: { text: string; label: string }) {
	const [copied, setCopied] = useState(false)

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch (err) {
			console.error('Failed to copy:', err)
		}
	}

	return (
		<Button variant="outline" size="sm" onClick={handleCopy} className="" title={`Copy ${label}`}>
			{copied ? (
				<>
					<Check className="size-4" />
					Copied
				</>
			) : (
				<>
					<Copy className="size-4" />
					Copy
				</>
			)}
		</Button>
	)
}

function CardDAVConnectionPage() {
	const { data: users = [], isLoading: usersLoading } = useQuery({
		queryKey: ['radicale-users'],
		queryFn: fetchUsers,
	})
	const { data: addressBooks = [], isLoading: booksLoading } = useQuery({
		queryKey: ['address-books'],
		queryFn: fetchAddressBooks,
	})
	const isLoading = usersLoading || booksLoading

	const directBaseUrl = getDirectCardDAVBaseUrl()
	const directUiBaseUrl = getDirectUIBaseUrl()
	const proxyBaseUrl = getProxyCardDAVBaseUrl()
	const proxyUiBaseUrl = getProxyUIBaseUrl()
	const traefikExample = `# TRAEFIK (example)
# CONTACTS - URL for management UI
- traefik.http.routers.contacts.service=contacts
- traefik.http.routers.contacts.rule=Host(\`contacts.example.com\`)
- traefik.http.routers.contacts.entrypoints=websecure
- traefik.http.routers.contacts.tls=true
- traefik.http.routers.contacts.tls.certresolver=cloudflare
- traefik.http.services.contacts.loadbalancer.server.port=3030
# CARDDAV - URL for CardDAV clients
- traefik.http.routers.radicale.service=radicale
- traefik.http.routers.radicale.rule=Host(\`carddav.example.com\`)
- traefik.http.routers.radicale.entrypoints=websecure
- traefik.http.routers.radicale.tls=true
- traefik.http.routers.radicale.tls.certresolver=cloudflare
- traefik.http.services.radicale.loadbalancer.server.port=5232`

	if (isLoading) {
		return (
			<div className="container mx-auto p-6">
				<div className="text-center">Loading connection details...</div>
			</div>
		)
	}

	return (
		<div className="container mx-auto p-6 space-y-6 max-w-7xl">
			<div>
				<h1 className="text-3xl font-bold mb-2">CardDAV Connection</h1>
				<div className="text-muted-foreground">Configure your CardDAV client to sync contacts with this server.</div>
			</div>

			{/* Server Information */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<Server className="w-5 h-5" />
						<CardTitle>Server Information</CardTitle>
					</div>
					<CardDescription>Use one of the URLs below depending on your deployment setup.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<div className="mt-3 space-y-3 text-sm text-muted-foreground dark:text-gray-400">
							<div>
								<div className="font-medium text-foreground dark:text-gray-100">Direct (no reverse proxy)</div>
								<div className="mt-2 space-y-2">
									<span className="sm:hidden block text-sm uppercase text-muted-foreground">UI</span>
									<div className="flex items-center gap-2 ">
										<span className="hidden sm:block w-24 text-sm uppercase text-muted-foreground">UI</span>
										<code className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-md text-sm break-all">{directUiBaseUrl}</code>
										<CopyButton text={directUiBaseUrl} label="Direct UI URL" />
									</div>
									<span className="sm:hidden block text-sm uppercase text-muted-foreground">CardDAV</span>
									<div className="flex items-center gap-2">
										<span className="hidden sm:block w-24 text-sm uppercase text-muted-foreground">CardDAV</span>
										<code className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-md text-sm break-all">{directBaseUrl}</code>
										<CopyButton text={directBaseUrl} label="Direct CardDAV URL" />
									</div>
								</div>
								<div className="mt-1">Hit the Radicale port directly (default 5232).</div>
							</div>
							<Separator />
							<div>
								<div className="font-medium text-foreground dark:text-gray-100">Traefik / reverse proxy</div>
								<div className="mt-2 space-y-2">
									<span className="sm:hidden block text-sm uppercase text-muted-foreground">UI</span>
									<div className="flex items-center gap-2">
										<span className="hidden sm:block w-24 text-sm uppercase text-muted-foreground">UI</span>
										<code className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-md text-sm break-all">{proxyUiBaseUrl}</code>
										<CopyButton text={proxyUiBaseUrl} label="Proxy UI URL" />
									</div>
									<span className="sm:hidden block text-sm uppercase text-muted-foreground">CardDAV</span>
									<div className="flex items-center gap-2">
										<span className="hidden sm:block w-24 text-sm uppercase text-muted-foreground">CardDAV</span>
										<code className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-md text-sm break-all">{proxyBaseUrl}</code>
										<CopyButton text={proxyBaseUrl} label="Proxy CardDAV URL" />
									</div>
								</div>
								<div className="mt-1">
									Example domains: UI at <code>https://contacts.example.com</code> and CardDAV at <code>https://carddav.example.com</code>.
								</div>
							</div>
						</div>
					</div>

					<Separator />

					<div>
						<div className="flex items-center gap-2 mb-2">
							<User className="w-4 h-4 text-gray-500" />
							<label className="text-sm font-medium">CardDAV Authentication:</label>
						</div>
						<div className="text-sm text-muted-foreground dark:text-gray-400">
							Use the username and password configured in the{' '}
							<Link to="/radicale-users" className="text-blue-600 dark:text-blue-400 hover:underline">
								Users
							</Link>{' '}
							page.
						</div>
					</div>

					<div>
						<div className="flex items-center gap-2 mb-2">
							<Lock className="w-4 h-4 text-gray-500" />
							<label className="text-sm font-medium">Security:</label>
						</div>
						<div className="text-base text-destructive-foreground">
							DO NOT EXPOSE THIS PUBLICLY WITHOUT PROPER AUTHENTICATION AND/OR SSL/TLS.
						</div>
					</div>
				</CardContent>
			</Card>

			{/* User Connection Details */}
			{users.length > 0 && addressBooks.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Connection Details by User and Book</CardTitle>
						<CardDescription>
							Assign books to users on the Users page. This server exposes <strong>multiple address book collections</strong> per user. For Apple Contacts: set Server Path to <code>/username/</code> (e.g. <code>/shawn/</code>) so the client discovers all books; open Groups to see each book separately. Per-book URLs below are for single-book or read-only subscriptions.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Username</TableHead>
										<TableHead>Subscription URL</TableHead>
										<TableHead className="w-[100px]">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{addressBooks.map(book => {
										const usersForBook = users.filter(user => {
											if (user.username.startsWith('ro-')) {
												const bookIdFromRo = user.username.slice(3)
												return book.id === bookIdFromRo && book.readonly_enabled === true
											}
											return true
										})
										if (usersForBook.length === 0) return null
										return (
											<Fragment key={book.id}>
												<TableRow className="bg-muted/50 hover:bg-muted/50">
													<TableCell colSpan={3} className="font-medium py-2.5 text-foreground">
														{book.name}
													</TableCell>
												</TableRow>
												{usersForBook.map(user => {
													const directUrl = getCardDAVUrl(user.username, book.id, directBaseUrl)
													const proxyUrl = getCardDAVUrl(user.username, book.id, proxyBaseUrl)
													return (
														<TableRow key={`${user.username}-${book.id}`}>
															<TableCell className="font-medium max-w-48 truncate">{user.username}</TableCell>
															<TableCell>
																<div className="space-y-2">
																	<div>
																		<div className="text-[11px] uppercase text-muted-foreground">Direct</div>
																		<code className="text-xs break-all">{directUrl}</code>
																	</div>
																	<div>
																		<div className="text-[11px] uppercase text-muted-foreground">Proxy</div>
																		<code className="text-xs break-all">{proxyUrl}</code>
																	</div>
																</div>
															</TableCell>
															<TableCell>
																<div className="flex flex-col gap-2">
																	<CopyButton text={directUrl} label="Direct Subscription URL" />
																	<CopyButton text={proxyUrl} label="Proxy Subscription URL" />
																</div>
															</TableCell>
														</TableRow>
													)
												})}
											</Fragment>
										)
									})}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			) : users.length > 0 && addressBooks.length === 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>No Address Books</CardTitle>
						<CardDescription>Create an address book to see subscription URLs</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild>
							<Link to="/books">Go to Books</Link>
						</Button>
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardHeader>
						<CardTitle>No Users</CardTitle>
						<CardDescription>Create a user to enable contact synchronization</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="text-sm text-muted-foreground dark:text-gray-400 mb-4">
							You need to create at least one user before you can sync contacts. Users are managed separately from web UI accounts.
						</div>
						<Button asChild>
							<Link to="/radicale-users">Go to Users</Link>
						</Button>
					</CardContent>
				</Card>
			)}

			{/* Traefik Example */}
			<Card>
				<CardHeader>
					<CardTitle>Traefik Example</CardTitle>
					<CardDescription>Sample labels from docker-compose.prod.yml (contacts.example.com + carddav.example.com)</CardDescription>
				</CardHeader>
				<CardContent>
					<pre className="overflow-y-auto whitespace-pre leading-normal rounded-md bg-gray-100 dark:bg-gray-800 p-4 text-sm text-muted-foreground dark:text-gray-300">
						<code>{traefikExample}</code>
					</pre>
				</CardContent>
			</Card>

			{/* Client Instructions */}
			<Card>
				<CardHeader>
					<CardTitle>Client Configuration Instructions</CardTitle>
					<CardDescription>Step-by-step guides for popular CardDAV clients</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="text-sm text-muted-foreground dark:text-gray-400">
						Choose either the proxy URL or the direct URL depending on your deployment. Do not add a <code>/carddav</code> prefix.
					</div>
					<div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 space-y-2">
						<div>
							<strong>macOS Contacts:</strong> Set Server Path to <code>/username/</code> (e.g. <code>/shawn/</code>). The server publishes separate collections per book; in Contacts click <strong>Groups</strong> (top-left) to see each book with its own checkbox. Do <strong>not</strong> use <code>/principals/user/</code> or you get 403.
						</div>
						<div>
							<strong>Only one group or wrong contacts?</strong> Remove the CardDAV account and add it again with Server Path <code>/username/</code> only, so Apple re-discovers. To sync a single book only, use that book’s full path from the table above.
						</div>
					</div>
					<Accordion type="single" collapsible className="w-full">
						<AccordionItem value="ios">
							<AccordionTrigger>iOS Contacts</AccordionTrigger>
							<AccordionContent>
								<ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground dark:text-gray-400">
									<li>Open Settings → Contacts → Accounts</li>
									<li>Tap "Add Account" → "Other"</li>
									<li>Tap "Add CardDAV Account"</li>
									<li>
										Enter:
										<ul className="list-disc list-inside ml-4 mt-1">
											<li>
												<strong>Server (proxy):</strong> {proxyBaseUrl.replace(/^https?:\/\//, '')}
											</li>
											<li>
												<strong>Server (direct):</strong> {directBaseUrl.replace(/^https?:\/\//, '')}
											</li>
											<li>
												<strong>Username:</strong> Your CardDAV username
											</li>
											<li>
												<strong>Password:</strong> Your CardDAV password
											</li>
										</ul>
									</li>
									<li>Tap "Next" and wait for verification</li>
									<li>Enable "Contacts" and tap "Save"</li>
								</ol>
							</AccordionContent>
						</AccordionItem>
						<AccordionItem value="android">
							<AccordionTrigger>Android (DAVx⁵)</AccordionTrigger>
							<AccordionContent>
								<ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground dark:text-gray-400">
									<li>Install DAVx⁵ from Google Play Store</li>
									<li>Open DAVx⁵ and tap "Login"</li>
									<li>Select "Login with URL and user name"</li>
									<li>
										Enter:
										<ul className="list-disc list-inside ml-4 mt-1">
											<li>
												<strong>Base URL (proxy):</strong> {proxyBaseUrl}
											</li>
											<li>
												<strong>Base URL (direct):</strong> {directBaseUrl}
											</li>
											<li>
												<strong>User name:</strong> Your CardDAV username
											</li>
											<li>
												<strong>Password:</strong> Your CardDAV password
											</li>
										</ul>
									</li>
									<li>Tap "Login" and grant permissions</li>
									<li>Enable contact sync in Android settings</li>
								</ol>
							</AccordionContent>
						</AccordionItem>
						<AccordionItem value="thunderbird">
							<AccordionTrigger>Thunderbird</AccordionTrigger>
							<AccordionContent>
								<ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground dark:text-gray-400">
									<li>Install the "CardBook" add-on</li>
									<li>Open CardBook → File → New → CardDAV Address Book</li>
									<li>
										Enter:
										<ul className="list-disc list-inside ml-4 mt-1">
											<li>
												<strong>Name:</strong> Shared Contacts
											</li>
											<li>
												<strong>URL (proxy):</strong> {proxyBaseUrl}
											</li>
											<li>
												<strong>URL (direct):</strong> {directBaseUrl}
											</li>
											<li>
												<strong>User name:</strong> Your CardDAV username
											</li>
											<li>
												<strong>Password:</strong> Your CardDAV password
											</li>
										</ul>
									</li>
									<li>Click "Verify" and then "OK"</li>
								</ol>
							</AccordionContent>
						</AccordionItem>
						<AccordionItem value="macos">
							<AccordionTrigger>macOS Contacts</AccordionTrigger>
							<AccordionContent>
								<ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground dark:text-gray-400">
									<li>Open Contacts app</li>
									<li>Go to Contacts → Settings → Accounts</li>
									<li>Click "+" → "Other Contacts Account"</li>
									<li>Select "CardDAV" as account type</li>
									<li>
										In <strong>Account Information</strong>: User name and Password (your CardDAV credentials).
									</li>
									<li>
										In <strong>Server Settings</strong>:
										<ul className="list-disc list-inside ml-4 mt-1">
											<li>
												<strong>Server Address:</strong> host only, e.g. {proxyBaseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
											</li>
											<li>
												<strong>Server Path:</strong> use the <em>full path</em> from the subscription URL above (e.g. <code>/username/book-id/</code>). Do <strong>not</strong> use <code>/principals/user/</code> — this server does not use principal paths.
											</li>
											<li>Port: 443 for HTTPS, 5232 for direct</li>
											<li>Use SSL: on for HTTPS</li>
										</ul>
									</li>
									<li>Click "Sign In"</li>
								</ol>
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				</CardContent>
			</Card>

			{/* Troubleshooting */}
			<Card>
				<CardHeader>
					<CardTitle>Troubleshooting</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm text-muted-foreground dark:text-gray-400">
					<div>
						<strong>Connection fails:</strong> Verify the server URL is correct and accessible from your network.
					</div>
					<div>
						<strong>Authentication fails:</strong> Double-check your username and password.
					</div>
					<div>
						<strong>HTTPS required:</strong> Some clients require HTTPS. If using HTTP, ensure your client allows insecure connections, or
						set up a reverse proxy with SSL/TLS.
					</div>
					<div>
						<strong>No contacts appear:</strong> Make sure contacts exist in the web UI. The sync service automatically synchronizes
						contacts between the database and CardDAV.
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
