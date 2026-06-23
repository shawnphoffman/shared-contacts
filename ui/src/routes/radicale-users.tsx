import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { BookOpen, Check, Copy, Edit, Plus, RefreshCw, Trash2, Users, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Field, FieldContent, FieldLabel } from '../components/ui/field'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Textarea } from '../components/ui/textarea'
import { Checkbox } from '../components/ui/checkbox'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/radicale-users')({
	component: RadicaleUsersPage,
})

interface RadicaleUser {
	username: string
}

interface AddressBook {
	id: string
	name: string
	slug: string
	is_public: boolean
}

async function fetchUsers(): Promise<Array<RadicaleUser>> {
	const response = await fetch('/api/radicale-users')
	if (!response.ok) {
		throw new Error('Failed to fetch users')
	}
	return response.json()
}

async function createUser(username: string, password: string): Promise<RadicaleUser> {
	const response = await fetch('/api/radicale-users', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ username, password }),
	})
	if (!response.ok) {
		const error = await response.json()
		throw new Error(error.error || 'Failed to create user')
	}
	return response.json()
}

async function updateUserPassword(username: string, password: string): Promise<void> {
	const response = await fetch(`/api/radicale-users/${encodeURIComponent(username)}`, {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ password }),
	})
	if (!response.ok) {
		const error = await response.json()
		throw new Error(error.error || 'Failed to update user')
	}
}

async function deleteUser(username: string): Promise<void> {
	const response = await fetch(`/api/radicale-users/${encodeURIComponent(username)}`, {
		method: 'DELETE',
	})
	if (!response.ok) {
		const error = await response.json()
		throw new Error(error.error || 'Failed to delete user')
	}
}

async function backfillSharedContacts(username: string): Promise<void> {
	const response = await fetch(`/api/radicale-users/${encodeURIComponent(username)}/backfill`, {
		method: 'POST',
	})
	if (!response.ok) {
		const error = await response.json()
		throw new Error(error.error || 'Failed to backfill shared contacts')
	}
}

async function fetchAddressBooks(): Promise<Array<AddressBook>> {
	const response = await fetch('/api/address-books')
	if (!response.ok) {
		throw new Error('Failed to fetch address books')
	}
	return response.json()
}

async function fetchUserMemberships(username: string): Promise<Array<string>> {
	const response = await fetch(`/api/address-books/memberships?username=${encodeURIComponent(username)}`)
	if (!response.ok) {
		const error = await response.json()
		throw new Error(error.error || 'Failed to fetch memberships')
	}
	const data = await response.json()
	return data.address_book_ids || []
}

async function updateUserMemberships(username: string, addressBookIds: Array<string>): Promise<void> {
	const response = await fetch('/api/address-books/memberships', {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ username, address_book_ids: addressBookIds }),
	})
	if (!response.ok) {
		const error = await response.json()
		throw new Error(error.error || 'Failed to update memberships')
	}
}

// ── Username (machine value) with copy affordance ──────────────────

function UsernameCell({ username }: { username: string }) {
	const [copied, setCopied] = useState(false)

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(username)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch (err) {
			console.error('Failed to copy:', err)
		}
	}

	return (
		<div className="flex items-center gap-2">
			<span className="font-mono font-medium">{username}</span>
			<Button
				variant="ghost"
				size="icon-sm"
				className="text-muted-foreground"
				onClick={handleCopy}
				aria-label={copied ? `Copied ${username}` : `Copy username ${username}`}
			>
				{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
			</Button>
		</div>
	)
}

function RadicaleUsersPage() {
	const queryClient = useQueryClient()
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
	const [isBooksDialogOpen, setIsBooksDialogOpen] = useState(false)
	const [selectedUser, setSelectedUser] = useState<string | null>(null)
	const [formData, setFormData] = useState({ username: '', password: '' })
	const [error, setError] = useState<string | null>(null)
	const [selectedBookIds, setSelectedBookIds] = useState<Array<string>>([])
	const [isBulkCreateDialogOpen, setIsBulkCreateDialogOpen] = useState(false)
	const [bulkCreateInput, setBulkCreateInput] = useState('')
	const [bulkCreatePassword, setBulkCreatePassword] = useState('')
	const [bulkCreateResults, setBulkCreateResults] = useState<Array<{ username: string; status: 'success' | 'error'; message?: string }>>([])
	const [isBulkCreating, setIsBulkCreating] = useState(false)

	const { data: users = [], isLoading } = useQuery({
		queryKey: ['radicale-users'],
		queryFn: fetchUsers,
	})

	const { data: addressBooks = [] } = useQuery({
		queryKey: ['address-books'],
		queryFn: fetchAddressBooks,
	})

	const createMutation = useMutation({
		mutationFn: ({ username, password }: { username: string; password: string }) => createUser(username, password),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ['radicale-users'] })
			setIsCreateDialogOpen(false)
			setFormData({ username: '', password: '' })
			setError(null)
			toast.success(`User ${variables.username} created`)
		},
		onError: (err: Error) => {
			setError(err.message)
		},
	})

	const updateMutation = useMutation({
		mutationFn: ({ username, password }: { username: string; password: string }) => updateUserPassword(username, password),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ['radicale-users'] })
			setIsEditDialogOpen(false)
			setSelectedUser(null)
			setFormData({ username: '', password: '' })
			setError(null)
			toast.success(`Password updated for ${variables.username}`)
		},
		onError: (err: Error) => {
			setError(err.message)
		},
	})

	const deleteMutation = useMutation({
		mutationFn: deleteUser,
		onSuccess: (_data, username) => {
			queryClient.invalidateQueries({ queryKey: ['radicale-users'] })
			setIsDeleteDialogOpen(false)
			setSelectedUser(null)
			toast.success(`User ${username} deleted`)
		},
		onError: (err: Error) => {
			toast.error(err.message)
		},
	})

	const backfillMutation = useMutation({
		mutationFn: backfillSharedContacts,
		onSuccess: (_data, username) => {
			toast.success(`Backfill complete for ${username}`)
		},
		onError: (err: Error) => {
			toast.error(err.message)
		},
	})

	const backfillAllMutation = useMutation({
		mutationFn: async (usernames: Array<string>) => {
			await Promise.all(usernames.map(username => backfillSharedContacts(username)))
			return usernames.length
		},
		onSuccess: count => {
			toast.success(`Backfill complete for ${count} user${count === 1 ? '' : 's'}`)
		},
		onError: (err: Error) => {
			toast.error(err.message)
		},
	})

	const membershipUpdateMutation = useMutation({
		mutationFn: ({ username, addressBookIds }: { username: string; addressBookIds: Array<string> }) =>
			updateUserMemberships(username, addressBookIds),
		onSuccess: (_data, variables) => {
			setIsBooksDialogOpen(false)
			setSelectedUser(null)
			setSelectedBookIds([])
			setError(null)
			toast.success(`Address books updated for ${variables.username}`)
		},
		onError: (err: Error) => {
			setError(err.message)
		},
	})

	const handleCreate = () => {
		setError(null)
		if (!formData.username || !formData.password) {
			setError('Username and password are required')
			return
		}
		createMutation.mutate({
			username: formData.username,
			password: formData.password,
		})
	}

	const handleUpdate = () => {
		setError(null)
		if (!selectedUser || !formData.password) {
			setError('Password is required')
			return
		}
		updateMutation.mutate({
			username: selectedUser,
			password: formData.password,
		})
	}

	const handleDelete = () => {
		if (!selectedUser) return
		deleteMutation.mutate(selectedUser)
	}

	const openEditDialog = (username: string) => {
		setSelectedUser(username)
		setFormData({ username: '', password: '' })
		setError(null)
		setIsEditDialogOpen(true)
	}

	const openDeleteDialog = (username: string) => {
		setSelectedUser(username)
		setError(null)
		setIsDeleteDialogOpen(true)
	}

	const openBooksDialog = async (username: string) => {
		setSelectedUser(username)
		setError(null)
		setIsBooksDialogOpen(true)
		try {
			const memberships = await fetchUserMemberships(username)
			setSelectedBookIds(memberships)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load memberships')
		}
	}

	const handleBulkCreate = async () => {
		if (!bulkCreateInput.trim() || !bulkCreatePassword.trim()) {
			setError('Usernames and password are required')
			return
		}
		setIsBulkCreating(true)
		setError(null)
		setBulkCreateResults([])

		const usernames = bulkCreateInput
			.split(/[,\n]+/)
			.map(u => u.trim())
			.filter(u => u.length > 0)

		if (usernames.length === 0) {
			setError('No valid usernames found')
			setIsBulkCreating(false)
			return
		}

		const results: Array<{ username: string; status: 'success' | 'error'; message?: string }> = []
		for (const username of usernames) {
			try {
				await createUser(username, bulkCreatePassword)
				results.push({ username, status: 'success' })
			} catch (err) {
				results.push({ username, status: 'error', message: err instanceof Error ? err.message : 'Failed' })
			}
		}

		setBulkCreateResults(results)
		setIsBulkCreating(false)
		queryClient.invalidateQueries({ queryKey: ['radicale-users'] })

		const succeeded = results.filter(r => r.status === 'success').length
		const failed = results.length - succeeded
		if (failed === 0) {
			toast.success(`Created ${succeeded} user${succeeded === 1 ? '' : 's'}`)
			setTimeout(() => {
				setIsBulkCreateDialogOpen(false)
				setBulkCreateInput('')
				setBulkCreatePassword('')
				setBulkCreateResults([])
			}, 1500)
		} else {
			toast.error(`${failed} of ${results.length} users could not be created`)
		}
	}

	return (
		<PageContainer width="standard" className="space-y-6">
			<PageHeader
				title="Book Users"
				description="CardDAV sync accounts that clients use to subscribe to address books. Separate from web UI sign-in."
				actions={
					<>
						<Button
							variant="outline"
							onClick={() => {
								setBulkCreateInput('')
								setBulkCreatePassword('')
								setBulkCreateResults([])
								setError(null)
								setIsBulkCreateDialogOpen(true)
							}}
						>
							<UsersRound className="mr-1 size-4" />
							Bulk Create
						</Button>
						<Button onClick={() => setIsCreateDialogOpen(true)}>
							<Plus className="mr-1 size-4" />
							New User
						</Button>
					</>
				}
			/>

			<Item variant="outline">
				<ItemContent>
					<ItemTitle>
						<RefreshCw className="size-4 text-muted-foreground" />
						Backfill shared contacts
					</ItemTitle>
					<ItemDescription>
						If a user cannot see existing shared contacts, run a backfill to copy the shared address book into their CardDAV account. This
						does not affect their sign-in or assignments.
					</ItemDescription>
				</ItemContent>
				{users.length > 0 && (
					<Button
						variant="outline"
						size="sm"
						className="self-start"
						onClick={() => backfillAllMutation.mutate(users.map(user => user.username))}
						disabled={backfillAllMutation.isPending}
					>
						<RefreshCw className="mr-1 size-4" />
						{backfillAllMutation.isPending ? 'Backfilling…' : 'Backfill All Users'}
					</Button>
				)}
			</Item>

			{isLoading ? (
				<div className="space-y-3">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : users.length === 0 ? (
				<div className="flex flex-col items-center rounded-md border py-12 text-center">
					<Users className="mb-4 size-10 text-muted-foreground" />
					<p className="mb-1 text-muted-foreground">No book users yet</p>
					<p className="mb-6 text-sm text-muted-foreground">Create one so a CardDAV client can subscribe to your address books.</p>
					<Button onClick={() => setIsCreateDialogOpen(true)}>
						<Plus className="mr-1 size-4" />
						Create First User
					</Button>
				</div>
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Username</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{users.map(user => (
								<TableRow key={user.username}>
									<TableCell>
										<UsernameCell username={user.username} />
									</TableCell>
									<TableCell className="text-right">
										<div className="flex flex-col justify-end gap-2 sm:flex-row">
											<Button variant="outline" size="sm" onClick={() => openBooksDialog(user.username)}>
												<BookOpen className="mr-1 size-4" />
												Books
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => backfillMutation.mutate(user.username)}
												disabled={backfillMutation.isPending}
											>
												<RefreshCw className="mr-1 size-4" />
												{backfillMutation.isPending && backfillMutation.variables === user.username ? 'Backfilling…' : 'Backfill'}
											</Button>
											<Button variant="outline" size="sm" onClick={() => openEditDialog(user.username)}>
												<Edit className="mr-1 size-4" />
												Change Password
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => openDeleteDialog(user.username)}
												aria-label={`Delete user ${user.username}`}
											>
												<Trash2 className="mr-1 size-4" />
												<span className="inline sm:hidden md:inline">Delete</span>
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			{/* Create User Dialog */}
			<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>New Book User</DialogTitle>
						<DialogDescription>
							Create a CardDAV sync account. This user will be able to subscribe to address books via CardDAV clients.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<Field>
							<FieldLabel htmlFor="create-username">Username</FieldLabel>
							<FieldContent>
								<Input
									id="create-username"
									value={formData.username}
									onChange={e => setFormData({ ...formData, username: e.target.value })}
									placeholder="Enter username"
								/>
							</FieldContent>
						</Field>
						<Field>
							<FieldLabel htmlFor="create-password">Password</FieldLabel>
							<FieldContent>
								<Input
									id="create-password"
									type="password"
									value={formData.password}
									onChange={e => setFormData({ ...formData, password: e.target.value })}
									placeholder="Enter password"
								/>
							</FieldContent>
						</Field>
						{error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsCreateDialogOpen(false)
								setFormData({ username: '', password: '' })
								setError(null)
							}}
						>
							Cancel
						</Button>
						<Button onClick={handleCreate} disabled={createMutation.isPending}>
							{createMutation.isPending ? 'Creating…' : 'Create User'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Address Books Dialog */}
			<Dialog open={isBooksDialogOpen} onOpenChange={setIsBooksDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Assign Address Books to {selectedUser}</DialogTitle>
						<DialogDescription>
							Select which private address books <strong>{selectedUser}</strong> can access. Public books are always visible.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2 py-2">
						{addressBooks.length === 0 ? (
							<div className="text-sm text-muted-foreground">No address books available.</div>
						) : (
							addressBooks.map(book => {
								const isPublic = book.is_public
								const checked = isPublic ? true : selectedBookIds.includes(book.id)
								return (
									<label key={book.id} className="flex items-center gap-2">
										<Checkbox
											checked={checked}
											disabled={isPublic}
											onCheckedChange={value => {
												setSelectedBookIds(prev => {
													if (value) {
														return prev.includes(book.id) ? prev : [...prev, book.id]
													}
													return prev.filter(id => id !== book.id)
												})
											}}
										/>
										<span>{book.name}</span>
										{isPublic && <span className="text-xs text-muted-foreground">(public)</span>}
									</label>
								)
							})
						)}
						{error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsBooksDialogOpen(false)
								setSelectedUser(null)
								setSelectedBookIds([])
								setError(null)
							}}
						>
							Cancel
						</Button>
						<Button
							onClick={() => selectedUser && membershipUpdateMutation.mutate({ username: selectedUser, addressBookIds: selectedBookIds })}
							disabled={membershipUpdateMutation.isPending || !selectedUser}
						>
							{membershipUpdateMutation.isPending ? 'Saving…' : 'Save'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Change Password Dialog */}
			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Change Password</DialogTitle>
						<DialogDescription>
							Update the password for <strong>{selectedUser}</strong>. CardDAV clients using the old password will need to reconnect.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<Field>
							<FieldLabel htmlFor="edit-password">New Password</FieldLabel>
							<FieldContent>
								<Input
									id="edit-password"
									type="password"
									value={formData.password}
									onChange={e => setFormData({ ...formData, password: e.target.value })}
									placeholder="Enter new password"
								/>
							</FieldContent>
						</Field>
						{error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsEditDialogOpen(false)
								setSelectedUser(null)
								setFormData({ username: '', password: '' })
								setError(null)
							}}
						>
							Cancel
						</Button>
						<Button onClick={handleUpdate} disabled={updateMutation.isPending}>
							{updateMutation.isPending ? 'Saving…' : 'Update Password'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete User Confirm */}
			<ConfirmDialog
				open={isDeleteDialogOpen}
				onOpenChange={open => {
					setIsDeleteDialogOpen(open)
					if (!open) setSelectedUser(null)
				}}
				title={`Delete user ${selectedUser}?`}
				description="This removes their access. CardDAV clients using this account will stop syncing. This cannot be undone."
				confirmLabel="Delete"
				pendingLabel="Deleting…"
				onConfirm={handleDelete}
				pending={deleteMutation.isPending}
			/>

			{/* Bulk Create Users Dialog */}
			<Dialog open={isBulkCreateDialogOpen} onOpenChange={setIsBulkCreateDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Bulk Create Users</DialogTitle>
						<DialogDescription>
							Create multiple book users at once. Enter one username per line or separate with commas. All users will share the same initial
							password.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<Field>
							<FieldLabel htmlFor="bulk-usernames">Usernames</FieldLabel>
							<FieldContent>
								<Textarea
									id="bulk-usernames"
									value={bulkCreateInput}
									onChange={e => setBulkCreateInput(e.target.value)}
									placeholder={'alice\nbob\ncharlie'}
									rows={5}
								/>
							</FieldContent>
						</Field>
						<Field>
							<FieldLabel htmlFor="bulk-password">Password (shared)</FieldLabel>
							<FieldContent>
								<Input
									id="bulk-password"
									type="password"
									value={bulkCreatePassword}
									onChange={e => setBulkCreatePassword(e.target.value)}
									placeholder="Enter password for all users"
								/>
							</FieldContent>
						</Field>
						{error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
						{bulkCreateResults.length > 0 && (
							<div className="space-y-1.5">
								{bulkCreateResults.map((result, i) => (
									<div key={i} className="flex items-center gap-2 text-sm">
										<Badge variant={result.status === 'success' ? 'secondary' : 'destructive'}>
											{result.status === 'success' ? 'Created' : 'Failed'}
										</Badge>
										<span className="font-mono font-medium">{result.username}</span>
										{result.message && <span className="text-muted-foreground">{result.message}</span>}
									</div>
								))}
							</div>
						)}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsBulkCreateDialogOpen(false)
								setError(null)
							}}
						>
							Cancel
						</Button>
						<Button onClick={handleBulkCreate} disabled={isBulkCreating}>
							{isBulkCreating ? 'Creating…' : 'Create Users'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</PageContainer>
	)
}
