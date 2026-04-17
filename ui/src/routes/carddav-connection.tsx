import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Server, Tag, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Separator } from '../components/ui/separator'
import {
	CopyButton,
	fetchRuntimeConfig,
	fetchUserBookAssignments,
	fetchUsers,
	getCardDAVUrl,
	getDirectCardDAVBaseUrl,
	getDirectUIBaseUrl,
	getProxyCardDAVBaseUrl,
	getProxyUIBaseUrl,
	handleDownloadCombinedMobileconfig,
	handleDownloadMobileconfig,
} from '../lib/carddav'

export const Route = createFileRoute('/carddav-connection')({
	component: CardDAVConnectionPage,
})

interface AddressBook {
	id: string
	name: string
	slug: string
	is_public: boolean
	readonly_enabled?: boolean
}

interface AppSettings {
	mobileconfig_org: string | null
}

async function fetchAddressBooks(): Promise<Array<AddressBook>> {
	const response = await fetch('/api/address-books?readonly=1')
	if (!response.ok) {
		throw new Error('Failed to fetch address books')
	}
	return response.json()
}

async function fetchAppSettings(): Promise<AppSettings> {
	const response = await fetch('/api/settings')
	if (!response.ok) {
		throw new Error('Failed to fetch settings')
	}
	return response.json()
}

async function updateAppSettings(updates: Partial<AppSettings>): Promise<void> {
	const response = await fetch('/api/settings', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(updates),
	})
	if (!response.ok) {
		throw new Error('Failed to update settings')
	}
}

function CardDAVConnectionPage() {
	const queryClient = useQueryClient()
	const { data: users = [], isLoading: usersLoading } = useQuery({
		queryKey: ['radicale-users'],
		queryFn: fetchUsers,
	})
	const { data: addressBooks = [], isLoading: booksLoading } = useQuery({
		queryKey: ['address-books'],
		queryFn: fetchAddressBooks,
	})
	const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
		queryKey: ['user-book-assignments'],
		queryFn: fetchUserBookAssignments,
	})
	const { data: runtimeConfig } = useQuery({
		queryKey: ['runtime-config'],
		queryFn: fetchRuntimeConfig,
	})
	const { data: appSettings } = useQuery({
		queryKey: ['app-settings'],
		queryFn: fetchAppSettings,
	})

	const [orgDraft, setOrgDraft] = useState('')
	useEffect(() => {
		if (appSettings) {
			setOrgDraft(appSettings.mobileconfig_org ?? '')
		}
	}, [appSettings])

	const saveOrgMutation = useMutation({
		mutationFn: (value: string) => updateAppSettings({ mobileconfig_org: value.trim() === '' ? null : value.trim() }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['app-settings'] })
			toast.success('Profile brand saved')
		},
		onError: () => {
			toast.error('Failed to save profile brand')
		},
	})

	const isLoading = usersLoading || booksLoading || assignmentsLoading

	const directBaseUrl = getDirectCardDAVBaseUrl()
	const directUiBaseUrl = getDirectUIBaseUrl()
	const proxyBaseUrl = getProxyCardDAVBaseUrl(runtimeConfig)
	const proxyUiBaseUrl = getProxyUIBaseUrl(runtimeConfig)
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
								<div className="mt-1">If exposed, hit the Radicale port directly (default 5232).</div>
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
								{/* <div className="mt-1">
									Example domains: UI at <code>https://contacts.example.com</code> and CardDAV at <code>https://carddav.example.com</code>.
								</div> */}
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

			{/* iOS / macOS Profile Brand */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<Tag className="w-5 h-5" />
						<CardTitle>iOS / macOS Profile Brand</CardTitle>
					</div>
					<CardDescription>
						Used as a space-separated prefix on each address book&rsquo;s label in the Contacts Groups picker (e.g. setting this to{' '}
						<code>👥</code> turns &ldquo;Hoffman Extended&rdquo; into &ldquo;👥 Hoffman Extended&rdquo;), and as the profile label in{' '}
						<strong>Settings → General → VPN &amp; Device Management</strong>. Applies to newly-downloaded profiles; already-installed
						profiles keep their original label.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						className="flex flex-col gap-2 sm:flex-row sm:items-end"
						onSubmit={e => {
							e.preventDefault()
							saveOrgMutation.mutate(orgDraft)
						}}
					>
						<div className="flex-1">
							<Label htmlFor="mobileconfig-org" className="text-sm">
								Organization / Brand
							</Label>
							<Input
								id="mobileconfig-org"
								value={orgDraft}
								placeholder="Shared Contacts"
								onChange={e => setOrgDraft(e.target.value)}
								maxLength={120}
							/>
							<p className="mt-1 text-xs text-muted-foreground">
								Falls back to the <code>MOBILECONFIG_ORG</code> env var, then to &ldquo;Shared Contacts&rdquo; when empty.
							</p>
						</div>
						<Button type="submit" disabled={saveOrgMutation.isPending || orgDraft === (appSettings?.mobileconfig_org ?? '')}>
							{saveOrgMutation.isPending ? 'Saving…' : 'Save'}
						</Button>
					</form>
				</CardContent>
			</Card>

			{/* Combined Profiles */}
			{users.length > 0 && addressBooks.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Combined iOS / macOS Profiles</CardTitle>
						<CardDescription>
							One <code>.mobileconfig</code> per user containing every address book they can access. Installs as a{' '}
							<strong>single entry</strong> in <em>Settings → General → VPN &amp; Device Management</em> instead of one entry per book.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2">
						{users
							.filter(user => {
								if (user.username.startsWith('ro-')) return false
								const assignments = assignmentsData?.assignments ?? {}
								const userBookIds = assignments[user.username] ?? []
								return addressBooks.some(book => userBookIds.includes(book.id) || book.is_public)
							})
							.map(user => (
								<div
									key={user.username}
									className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
								>
									<div className="text-sm">
										<div className="font-medium">{user.username}</div>
										<div className="text-xs text-muted-foreground">All accessible books combined into one profile.</div>
									</div>
									<Button variant="outline" size="sm" onClick={() => handleDownloadCombinedMobileconfig(user.username)}>
										Download combined profile
									</Button>
								</div>
							))}
					</CardContent>
				</Card>
			) : null}

			{/* User Connection Details */}
			{users.length > 0 && addressBooks.length > 0 ? (
				<>
					<div>
						<h2 className="text-xl font-semibold mb-1">Connection Details by User and Book</h2>
						<p className="text-sm text-muted-foreground">
							Each address book gets its own CardDAV account using composite usernames (<code>username-bookid</code>). This avoids Apple
							Contacts limitations where only one book per account is shown.
						</p>
						<p className="text-xs text-muted-foreground mt-1">
							The <span className="font-medium">Download profile</span> button generates an iOS/macOS <code>.mobileconfig</code> profile
							that pre-fills the server, path, and composite username but <span className="font-semibold">never includes the password</span>{' '}
							&mdash; the device will prompt for it during installation.
						</p>
					</div>
					{addressBooks.map(book => {
						const usersForBook = users.filter(user => {
							if (user.username.startsWith('ro-')) {
								const bookIdFromRo = user.username.slice(3)
								return book.id === bookIdFromRo && book.readonly_enabled === true
							}
							const assignments = assignmentsData?.assignments ?? {}
							const userBookIds = assignments[user.username] ?? []
							return userBookIds.includes(book.id) || book.is_public
						})
						if (usersForBook.length === 0) return null
						return (
							<Card key={book.id}>
								<CardHeader>
									<CardTitle>{book.name}</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									{usersForBook.map((user, index) => {
										const compositeUsername = `${user.username}-${book.id}`
										const directUrl = getCardDAVUrl(user.username, book.id, directBaseUrl)
										const proxyUrl = getCardDAVUrl(user.username, book.id, proxyBaseUrl)
										const urlsAreSame = directUrl === proxyUrl
										return (
											<div key={user.username}>
												{index > 0 && <Separator className="mb-4" />}
												<div className="space-y-3">
													{/* User info */}
													<div>
														<div className="text-sm text-muted-foreground">{user.username}</div>
														<div className="font-mono text-sm font-medium">{compositeUsername}</div>
													</div>
													{/* Subscription URLs */}
													<div className="space-y-2">
														{urlsAreSame ? (
															<div className="flex items-start gap-2">
																<code className="flex-1 px-3 py-2 bg-muted rounded-md text-xs break-all">{directUrl}</code>
																<CopyButton text={directUrl} label="URL" />
															</div>
														) : (
															<>
																<div>
																	<div className="text-[11px] uppercase text-muted-foreground mb-1">Direct</div>
																	<div className="flex items-start gap-2">
																		<code className="flex-1 px-3 py-2 bg-muted rounded-md text-xs break-all">{directUrl}</code>
																		<CopyButton text={directUrl} label="Direct URL" />
																	</div>
																</div>
																<div>
																	<div className="text-[11px] uppercase text-muted-foreground mb-1">Proxy</div>
																	<div className="flex items-start gap-2">
																		<code className="flex-1 px-3 py-2 bg-muted rounded-md text-xs break-all">{proxyUrl}</code>
																		<CopyButton text={proxyUrl} label="Proxy URL" />
																	</div>
																</div>
															</>
														)}
													</div>
													{/* Actions */}
													<div>
														<Button
															variant="outline"
															size="sm"
															onClick={() => handleDownloadMobileconfig(user.username, book.id, book.name)}
														>
															Download profile
														</Button>
													</div>
												</div>
											</div>
										)
									})}
								</CardContent>
							</Card>
						)
					})}
				</>
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
							<Link to="/books">Go to Books</Link>
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
								<div className="mb-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
									<div>
										<strong>macOS Contacts Limitation:</strong> Apple Contacts on macOS has a known bug where it only shows{' '}
										<strong>one address book per CardDAV account</strong>, even when the server exposes multiple collections. It typically
										shows an "All" group and only syncs contacts from the first collection.
									</div>
									<div>
										<strong>Solution:</strong> Each address book uses a composite username (<code>username-bookid</code>). When adding a
										CardDAV account in Contacts, use the <strong>composite username</strong> from the table above (e.g.,{' '}
										<code>shawn-a1bc7deb-afe8-48a4-8501-e4ea6413e6ba</code>) and Server Path <code>/username-bookid/</code> (e.g.,{' '}
										<code>/shawn-a1bc7deb-afe8-48a4-8501-e4ea6413e6ba/</code>). Each address book appears as a separate account, avoiding
										Apple Contacts limitations.
									</div>
									<div className="text-xs italic">
										Note: iOS Contacts handles multiple collections better, but macOS Contacts requires this workaround. This is an Apple
										limitation, not a server issue.
									</div>
								</div>
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
												<strong>Username:</strong> Use the <strong>composite username</strong> from the table above (e.g.,{' '}
												<code>shawn-a1bc7deb-afe8-48a4-8501-e4ea6413e6ba</code>).
											</li>
											<li>
												<strong>Server Path:</strong> Use <code>/username-bookid/</code> matching the composite username (e.g.,{' '}
												<code>/shawn-a1bc7deb-afe8-48a4-8501-e4ea6413e6ba/</code>). Each address book uses its own composite username, so
												each appears as a separate account. Do <strong>not</strong> use <code>/principals/user/</code> — this server does
												not use principal paths.
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
