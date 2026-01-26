import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { BookOpen, Edit, Plus, RefreshCw, Trash2, Users } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Field, FieldContent, FieldLabel } from '../components/ui/field'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Checkbox } from '../components/ui/checkbox'
import { Item } from '@/components/ui/item'

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

function RadicaleUsersPage() {
	const queryClient = useQueryClient()
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
	const [isBooksDialogOpen, setIsBooksDialogOpen] = useState(false)
	const [selectedUser, setSelectedUser] = useState<string | null>(null)
	const [formData, setFormData] = useState({ username: '', password: '' })
	const [error, setError] = useState<string | null>(null)
	const [backfillMessage, setBackfillMessage] = useState<string | null>(null)
	const [selectedBookIds, setSelectedBookIds] = useState<Array<string>>([])

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
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['radicale-users'] })
			setIsCreateDialogOpen(false)
			setFormData({ username: '', password: '' })
			setError(null)
		},
		onError: (err: Error) => {
			setError(err.message)
		},
	})

	const updateMutation = useMutation({
		mutationFn: ({ username, password }: { username: string; password: string }) => updateUserPassword(username, password),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['radicale-users'] })
			setIsEditDialogOpen(false)
			setSelectedUser(null)
			setFormData({ username: '', password: '' })
			setError(null)
		},
		onError: (err: Error) => {
			setError(err.message)
		},
	})

	const deleteMutation = useMutation({
		mutationFn: deleteUser,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['radicale-users'] })
			setIsDeleteDialogOpen(false)
			setSelectedUser(null)
			setError(null)
		},
		onError: (err: Error) => {
			setError(err.message)
		},
	})

	const backfillMutation = useMutation({
		mutationFn: backfillSharedContacts,
		onSuccess: (_data, username) => {
			setBackfillMessage(`Backfill complete for ${username}.`)
			setError(null)
		},
		onError: (err: Error) => {
			setError(err.message)
			setBackfillMessage(null)
		},
	})

	const backfillAllMutation = useMutation({
		mutationFn: async (usernames: Array<string>) => {
			await Promise.all(usernames.map(username => backfillSharedContacts(username)))
			return usernames.length
		},
		onSuccess: count => {
			setBackfillMessage(`Backfill complete for ${count} user${count === 1 ? '' : 's'}.`)
			setError(null)
		},
		onError: (err: Error) => {
			setError(err.message)
			setBackfillMessage(null)
		},
	})

	const membershipUpdateMutation = useMutation({
		mutationFn: ({ username, addressBookIds }: { username: string; addressBookIds: Array<string> }) =>
			updateUserMemberships(username, addressBookIds),
		onSuccess: () => {
			setIsBooksDialogOpen(false)
			setSelectedUser(null)
			setSelectedBookIds([])
			setError(null)
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

	if (isLoading) {
		return (
			<div className="container mx-auto p-6">
				<div className="text-center">Loading users...</div>
			</div>
		)
	}

	return (
		<div className="container mx-auto p-6 gap-6 flex flex-col max-w-2xl">
			{/*  */}
			<div className="flex justify-between items-center">
				<div className="flex items-center gap-3">
					<Users className="w-8 h-8" />
					<h1 className="text-3xl font-bold">Radicale Users</h1>
				</div>
				<Button onClick={() => setIsCreateDialogOpen(true)}>
					<Plus className="w-4 h-4 mr-1" />
					New User
				</Button>
			</div>

			<div className="text-muted-foreground">
				Manage users who can sync contacts via Radicale. These users are separate from the web UI authentication.
			</div>
			<Item variant="outline" className="flex flex-col gap-2 ">
				<div className="flex flex-col sm:flex-row items-center w-full justify-between gap-4">
					<div>
						If a user cannot see existing shared contacts, run a backfill to copy the shared address book into their Radicale account.
					</div>
					{users.length > 0 && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => backfillAllMutation.mutate(users.map(user => user.username))}
							disabled={backfillAllMutation.isPending}
						>
							<RefreshCw className="w-4 h-4 mr-1" />
							{backfillAllMutation.isPending ? 'Backfilling...' : 'Backfill All Users'}
						</Button>
					)}
				</div>
				{backfillMessage && <Item variant="outline">{backfillMessage}</Item>}
			</Item>

			{users.length === 0 ? (
				<div className="text-center py-12 border rounded-lg">
					<p className="text-gray-500 mb-4">No Radicale users yet.</p>
					<Button onClick={() => setIsCreateDialogOpen(true)}>
						<Plus className="w-4 h-4 mr-1" />
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
									<TableCell className="font-medium">{user.username}</TableCell>
									<TableCell className="text-right">
										<div className="flex flex-col sm:flex-row justify-end gap-2">
											<Button variant="outline" size="sm" onClick={() => openBooksDialog(user.username)}>
												<BookOpen className="w-4 h-4 mr-1" />
												Books
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => backfillMutation.mutate(user.username)}
												disabled={backfillMutation.isPending}
											>
												<RefreshCw className="w-4 h-4 mr-1" />
												Backfill
											</Button>
											<Button variant="outline" size="sm" onClick={() => openEditDialog(user.username)}>
												<Edit className="w-4 h-4 mr-1" />
												Change Password
											</Button>
											<Button variant="outline" size="sm" onClick={() => openDeleteDialog(user.username)}>
												<Trash2 className="w-4 h-4 mr-1" />
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
						<DialogTitle>Create New Radicale User</DialogTitle>
						<DialogDescription>
							Create a new user account for CardDAV synchronization. This user will be able to sync contacts via Radicale.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
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
						{error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}
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
							{createMutation.isPending ? 'Creating...' : 'Create User'}
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
						{error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}
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
							{membershipUpdateMutation.isPending ? 'Saving...' : 'Save'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Edit User Dialog */}
			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Change Password</DialogTitle>
						<DialogDescription>
							Update the password for user: <strong>{selectedUser}</strong>
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
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
						{error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}
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
							{updateMutation.isPending ? 'Updating...' : 'Update Password'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete User Dialog */}
			<Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete User</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete user <strong>{selectedUser}</strong>? This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					{error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsDeleteDialogOpen(false)
								setSelectedUser(null)
								setError(null)
							}}
						>
							Cancel
						</Button>
						<Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
							{deleteMutation.isPending ? 'Deleting...' : 'Delete User'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
