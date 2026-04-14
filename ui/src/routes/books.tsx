import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Edit, Eye, EyeOff, Plus, Server, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Field, FieldContent, FieldLabel } from '../components/ui/field'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Checkbox } from '../components/ui/checkbox'
import { Switch } from '../components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import {
	CopyButton,
	fetchRuntimeConfig,
	fetchUserBookAssignments,
	fetchUsers,
	getCardDAVUrl,
	getDirectCardDAVBaseUrl,
	getProxyCardDAVBaseUrl,
	handleDownloadMobileconfig,
} from '../lib/carddav'

// ── Types ──────────────────────────────────────────────────────────

interface AddressBook {
	id: string
	name: string
	slug: string
	is_public: boolean
}

interface AddressBookWithReadonly extends AddressBook {
	readonly_enabled?: boolean
	readonly_username?: string
}

// ── API helpers ────────────────────────────────────────────────────

async function fetchAddressBooks(): Promise<Array<AddressBook>> {
	const response = await fetch('/api/address-books')
	if (!response.ok) {
		throw new Error('Failed to fetch address books')
	}
	return response.json()
}

async function createAddressBook(payload: { name: string; slug?: string; is_public?: boolean }): Promise<AddressBook> {
	const response = await fetch('/api/address-books', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	})
	if (!response.ok) {
		const error = await response.json()
		throw new Error(error.error || 'Failed to create address book')
	}
	return response.json()
}

async function updateAddressBook(
	id: string,
	payload: { name?: string; is_public?: boolean; readonly_enabled?: boolean; readonly_password?: string }
): Promise<AddressBookWithReadonly> {
	const response = await fetch(`/api/address-books/${id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	})
	if (!response.ok) {
		const error = await response.json()
		throw new Error(error.error || 'Failed to update address book')
	}
	return response.json()
}

async function fetchAddressBook(id: string): Promise<AddressBookWithReadonly> {
	const response = await fetch(`/api/address-books/${id}`)
	if (!response.ok) {
		throw new Error('Failed to fetch address book')
	}
	return response.json()
}

function generateSlug(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

// ── Route ──────────────────────────────────────────────────────────

export const Route = createFileRoute('/books')({
	component: BooksPage,
})

// ── Edit Dialog ────────────────────────────────────────────────────

function EditBookDialog({ book, open, onOpenChange }: { book: AddressBook | null; open: boolean; onOpenChange: (open: boolean) => void }) {
	const queryClient = useQueryClient()
	const [nameDraft, setNameDraft] = useState('')
	const [isPublic, setIsPublic] = useState(true)
	const [readonlyEnabled, setReadonlyEnabled] = useState(false)
	const [readonlyPassword, setReadonlyPassword] = useState('')
	const [showPassword, setShowPassword] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const { data: details } = useQuery({
		queryKey: ['address-book', book?.id],
		queryFn: () => fetchAddressBook(book!.id),
		enabled: !!book,
	})

	// Sync form state when details load or book changes
	useEffect(() => {
		if (details) {
			setNameDraft(details.name)
			setIsPublic(details.is_public)
			setReadonlyEnabled(details.readonly_enabled ?? false)
			setReadonlyPassword('')
			setShowPassword(false)
			setError(null)
		}
	}, [details])

	const updateMutation = useMutation({
		mutationFn: (payload: { name?: string; is_public?: boolean; readonly_enabled?: boolean; readonly_password?: string }) =>
			updateAddressBook(book!.id, payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['address-books'] })
			queryClient.invalidateQueries({ queryKey: ['address-book', book!.id] })
			onOpenChange(false)
		},
		onError: (err: Error) => setError(err.message),
	})

	const handleSave = () => {
		const trimmedName = nameDraft.trim()
		if (!trimmedName) {
			setError('Name is required')
			return
		}
		updateMutation.mutate({
			name: trimmedName,
			is_public: isPublic,
			readonly_enabled: readonlyEnabled,
			...(readonlyEnabled && readonlyPassword.trim() ? { readonly_password: readonlyPassword } : {}),
		})
	}

	if (!book) return null

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Edit Address Book</DialogTitle>
					<DialogDescription>Update settings for this address book.</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<Field>
						<FieldLabel htmlFor="edit-book-name">Name</FieldLabel>
						<FieldContent>
							<Input
								id="edit-book-name"
								value={nameDraft}
								onChange={e => {
									setNameDraft(e.target.value)
									setError(null)
								}}
								placeholder="Book name"
							/>
						</FieldContent>
					</Field>
					<Field>
						<FieldLabel>Slug</FieldLabel>
						<FieldContent>
							<code className="text-sm text-muted-foreground">{book.slug}</code>
						</FieldContent>
					</Field>
					<label className="flex items-center gap-2">
						<Checkbox checked={isPublic} onCheckedChange={value => setIsPublic(Boolean(value))} />
						<span>Public book</span>
					</label>

					{/* Read-only subscription */}
					<div className="space-y-3 rounded-lg border p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="font-medium text-sm">Read-only subscription</p>
								<p className="text-xs text-muted-foreground">Share a subscribe-only link for this book</p>
							</div>
							<Switch checked={readonlyEnabled} onCheckedChange={setReadonlyEnabled} />
						</div>
						{readonlyEnabled && (
							<Field>
								<FieldLabel htmlFor="edit-readonly-password">Password</FieldLabel>
								<FieldContent>
									<div className="relative">
										<Input
											id="edit-readonly-password"
											type={showPassword ? 'text' : 'password'}
											value={readonlyPassword}
											onChange={e => setReadonlyPassword(e.target.value)}
											placeholder="Set a password (optional)"
											autoComplete="new-password"
										/>
										<button
											type="button"
											onClick={() => setShowPassword(!showPassword)}
											className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
											aria-label={showPassword ? 'Hide password' : 'Show password'}
										>
											{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
										</button>
									</div>
									<span className="text-xs text-muted-foreground">Leave empty to keep existing or use a random password.</span>
								</FieldContent>
							</Field>
						)}
					</div>

					{error && <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={updateMutation.isPending}>
						{updateMutation.isPending ? 'Saving…' : 'Save'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// ── Connection Details Dialog ──────────────────────────────────────

function ConnectionDetailsDialog({
	book,
	open,
	onOpenChange,
}: {
	book: AddressBook | null
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const { data: users = [] } = useQuery({
		queryKey: ['radicale-users'],
		queryFn: fetchUsers,
		enabled: open,
	})
	const { data: assignmentsData } = useQuery({
		queryKey: ['user-book-assignments'],
		queryFn: fetchUserBookAssignments,
		enabled: open,
	})
	const { data: runtimeConfig } = useQuery({
		queryKey: ['runtime-config'],
		queryFn: fetchRuntimeConfig,
		enabled: open,
	})
	const { data: details } = useQuery({
		queryKey: ['address-book', book?.id],
		queryFn: () => fetchAddressBook(book!.id),
		enabled: open && !!book,
	})

	if (!book) return null

	const directBaseUrl = getDirectCardDAVBaseUrl()
	const proxyBaseUrl = getProxyCardDAVBaseUrl(runtimeConfig)

	// Filter users assigned to this book
	const usersForBook = users.filter(user => {
		if (user.username.startsWith('ro-')) {
			const bookIdFromRo = user.username.slice(3)
			return book.id === bookIdFromRo && details?.readonly_enabled === true
		}
		const assignments = assignmentsData?.assignments ?? {}
		const userBookIds = assignments[user.username] ?? []
		return userBookIds.includes(book.id) || book.is_public
	})

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Server className="size-5" />
						Connection Details — {book.name}
					</DialogTitle>
					<DialogDescription>
						CardDAV subscription URLs for users assigned to this book. Use the composite username and URL when configuring CardDAV clients.
					</DialogDescription>
				</DialogHeader>
				<div className="max-h-[70vh] overflow-y-auto">
					{usersForBook.length === 0 ? (
						<div className="py-8 text-center text-sm text-muted-foreground">
							No users are assigned to this book. Assign users on the Book Users page.
						</div>
					) : (
						<div className="space-y-4">
							{usersForBook.map(user => {
								const directUrl = getCardDAVUrl(user.username, book.id, directBaseUrl)
								const proxyUrl = getCardDAVUrl(user.username, book.id, proxyBaseUrl)
								const urlsAreSame = directUrl === proxyUrl
								return (
									<div key={user.username} className="rounded-lg border p-4 space-y-3">
										<div>
											<div className="text-sm font-medium">{user.username}</div>
											<div className="font-mono text-xs text-muted-foreground">{`${user.username}-${book.id}`}</div>
										</div>
										<div className="space-y-2">
											{urlsAreSame ? (
												<div className="flex items-start justify-between gap-2">
													<div className="min-w-0">
														<div className="text-[11px] uppercase text-muted-foreground mb-0.5">URL</div>
														<code className="text-xs break-all">{directUrl}</code>
													</div>
													<CopyButton text={directUrl} label="URL" />
												</div>
											) : (
												<>
													<div className="flex items-start justify-between gap-2">
														<div className="min-w-0">
															<div className="text-[11px] uppercase text-muted-foreground mb-0.5">Direct</div>
															<code className="text-xs break-all">{directUrl}</code>
														</div>
														<CopyButton text={directUrl} label="Direct" />
													</div>
													<div className="flex items-start justify-between gap-2">
														<div className="min-w-0">
															<div className="text-[11px] uppercase text-muted-foreground mb-0.5">Proxy</div>
															<code className="text-xs break-all">{proxyUrl}</code>
														</div>
														<CopyButton text={proxyUrl} label="Proxy" />
													</div>
												</>
											)}
										</div>
										<Button
											variant="outline"
											size="sm"
											className="w-full"
											onClick={() => handleDownloadMobileconfig(user.username, book.id, book.name)}
										>
											Download profile
										</Button>
									</div>
								)
							})}
						</div>
					)}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// ── Page ───────────────────────────────────────────────────────────

function BooksPage() {
	const queryClient = useQueryClient()

	// Dialog state
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
	const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false)
	const [selectedBook, setSelectedBook] = useState<AddressBook | null>(null)

	// Create form state
	const [formData, setFormData] = useState({ name: '', slug: '', is_public: true })
	const [error, setError] = useState<string | null>(null)
	const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)

	const { data: books = [], isLoading } = useQuery({
		queryKey: ['address-books'],
		queryFn: fetchAddressBooks,
	})

	const createMutation = useMutation({
		mutationFn: createAddressBook,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['address-books'] })
			setIsCreateDialogOpen(false)
			setFormData({ name: '', slug: '', is_public: true })
			setError(null)
			setSlugManuallyEdited(false)
		},
		onError: (err: Error) => setError(err.message),
	})

	// Auto-generate slug from name
	useEffect(() => {
		if (!slugManuallyEdited && formData.name) {
			const generatedSlug = generateSlug(formData.name)
			setFormData(prev => ({ ...prev, slug: generatedSlug }))
		}
	}, [formData.name, slugManuallyEdited])

	const openEditDialog = (book: AddressBook) => {
		setSelectedBook(book)
		setIsEditDialogOpen(true)
	}

	const openConnectionDialog = (book: AddressBook) => {
		setSelectedBook(book)
		setIsConnectionDialogOpen(true)
	}

	if (isLoading) {
		return (
			<div className="container mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
				<div className="h-16 w-64 animate-pulse rounded bg-muted" />
				<div className="h-48 animate-pulse rounded-lg bg-muted" />
			</div>
		)
	}

	return (
		<div className="container mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Address Books</h1>
					<p className="mt-1 text-sm text-muted-foreground">Manage address books and view connection details.</p>
				</div>
				<Button onClick={() => setIsCreateDialogOpen(true)} className="shrink-0">
					<Plus className="mr-2 h-4 w-4" />
					New Book
				</Button>
			</div>

			{books.length === 0 ? (
				<Card className="border-dashed">
					<CardContent className="flex flex-col items-center justify-center py-16 text-center">
						<BookOpen className="mb-4 h-12 w-12 text-muted-foreground" />
						<p className="text-muted-foreground mb-1">No address books yet</p>
						<p className="mb-6 text-sm text-muted-foreground">Create one to organize contacts and share read-only links.</p>
						<Button onClick={() => setIsCreateDialogOpen(true)}>
							<Plus className="mr-2 h-4 w-4" />
							Create First Book
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead className="hidden sm:table-cell">Slug</TableHead>
								<TableHead className="hidden sm:table-cell">Visibility</TableHead>
								<TableHead className="hidden sm:table-cell">Read-only</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{books.map(book => (
								<BookRow
									key={book.id}
									book={book}
									onEdit={() => openEditDialog(book)}
									onConnectionDetails={() => openConnectionDialog(book)}
								/>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			{/* Create Dialog */}
			<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>Create Address Book</DialogTitle>
						<DialogDescription>Create a new address book to organize contacts.</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<Field>
							<FieldLabel htmlFor="book-name">Name</FieldLabel>
							<FieldContent>
								<Input
									id="book-name"
									value={formData.name}
									onChange={e => {
										setFormData(prev => ({ ...prev, name: e.target.value }))
										if (slugManuallyEdited && formData.slug === generateSlug(formData.name)) {
											setSlugManuallyEdited(false)
										}
									}}
									placeholder="Shared Contacts"
								/>
							</FieldContent>
						</Field>
						<Field>
							<FieldLabel htmlFor="book-slug">Slug (optional)</FieldLabel>
							<FieldContent>
								<Input
									id="book-slug"
									value={formData.slug}
									onChange={e => {
										setFormData(prev => ({ ...prev, slug: e.target.value }))
										setSlugManuallyEdited(true)
									}}
									placeholder="shared-contacts"
								/>
							</FieldContent>
						</Field>
						<label className="flex items-center gap-2">
							<Checkbox
								checked={formData.is_public}
								onCheckedChange={value => setFormData(prev => ({ ...prev, is_public: Boolean(value) }))}
							/>
							<span>Public book</span>
						</label>
						{error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 p-2 rounded">{error}</div>}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsCreateDialogOpen(false)
								setFormData({ name: '', slug: '', is_public: true })
								setError(null)
								setSlugManuallyEdited(false)
							}}
						>
							Cancel
						</Button>
						<Button
							onClick={() =>
								createMutation.mutate({
									name: formData.name,
									slug: formData.slug || undefined,
									is_public: formData.is_public,
								})
							}
							disabled={createMutation.isPending}
						>
							{createMutation.isPending ? 'Creating...' : 'Create'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Edit Dialog */}
			<EditBookDialog book={selectedBook} open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} />

			{/* Connection Details Dialog */}
			<ConnectionDetailsDialog book={selectedBook} open={isConnectionDialogOpen} onOpenChange={setIsConnectionDialogOpen} />
		</div>
	)
}

// ── Table Row ──────────────────────────────────────────────────────

function BookRow({ book, onEdit, onConnectionDetails }: { book: AddressBook; onEdit: () => void; onConnectionDetails: () => void }) {
	const { data: details } = useQuery({
		queryKey: ['address-book', book.id],
		queryFn: () => fetchAddressBook(book.id),
	})

	return (
		<TableRow>
			<TableCell className="font-medium">{book.name}</TableCell>
			<TableCell className="hidden sm:table-cell">
				<code className="text-xs text-muted-foreground">{book.slug}</code>
			</TableCell>
			<TableCell className="hidden sm:table-cell">
				<span
					className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
						book.is_public
							? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
							: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
					}`}
				>
					{book.is_public ? 'Public' : 'Private'}
				</span>
			</TableCell>
			<TableCell className="hidden sm:table-cell">
				<span
					className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
						details?.readonly_enabled
							? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
							: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
					}`}
				>
					{details?.readonly_enabled ? 'Yes' : 'No'}
				</span>
			</TableCell>
			<TableCell className="text-right">
				<div className="flex justify-end gap-2">
					<Button variant="outline" size="sm" asChild>
						<Link to="/" search={{ book: book.id }}>
							<Users className="size-4 mr-1" />
							<span className="hidden sm:inline">Contacts</span>
						</Link>
					</Button>
					<Button variant="outline" size="sm" onClick={onEdit}>
						<Edit className="size-4 mr-1" />
						<span className="hidden sm:inline">Edit</span>
					</Button>
					<Button variant="outline" size="sm" onClick={onConnectionDetails}>
						<Server className="size-4 mr-1" />
						<span className="hidden sm:inline">Connection</span>
					</Button>
				</div>
			</TableCell>
		</TableRow>
	)
}
