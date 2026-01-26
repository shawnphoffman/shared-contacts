import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Eye, EyeOff, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { Field, FieldContent, FieldLabel } from '../components/ui/field'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Checkbox } from '../components/ui/checkbox'
import { Switch } from '../components/ui/switch'

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
		headers: {
			'Content-Type': 'application/json',
		},
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
		headers: {
			'Content-Type': 'application/json',
		},
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

export const Route = createFileRoute('/books')({
	component: BooksPage,
})

function BookCard({ book }: { book: AddressBook }) {
	const queryClient = useQueryClient()
	const [nameDraft, setNameDraft] = useState(book.name)
	const [readonlyPassword, setReadonlyPassword] = useState('')
	const [showPassword, setShowPassword] = useState(false)
	const [nameError, setNameError] = useState<string | null>(null)
	const [readonlyError, setReadonlyError] = useState<string | null>(null)

	const { data: details, isLoading: detailsLoading } = useQuery({
		queryKey: ['address-book', book.id],
		queryFn: () => fetchAddressBook(book.id),
	})

	const updateMutation = useMutation({
		mutationFn: (payload: { name?: string; is_public?: boolean; readonly_enabled?: boolean; readonly_password?: string }) =>
			updateAddressBook(book.id, payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['address-books'] })
			queryClient.invalidateQueries({ queryKey: ['address-book', book.id] })
			setNameError(null)
			setReadonlyError(null)
			setReadonlyPassword('')
		},
		onError: (err: Error, variables: { name?: string; is_public?: boolean; readonly_enabled?: boolean; readonly_password?: string }) => {
			const isReadonlyUpdate = variables.readonly_enabled !== undefined || variables.readonly_password !== undefined
			if (isReadonlyUpdate) setReadonlyError(err.message)
			else setNameError(err.message)
		},
	})

	const readonlyEnabled = details?.readonly_enabled ?? false

	useEffect(() => {
		if (details?.name) setNameDraft(details.name)
	}, [details?.name])

	const handleNameBlur = () => {
		const trimmed = nameDraft.trim()
		if (!trimmed) {
			setNameDraft(book.name)
			return
		}
		if (trimmed === book.name) return
		updateMutation.mutate({ name: trimmed })
	}

	const handleReadonlyToggle = (checked: boolean) => {
		setReadonlyError(null)
		updateMutation.mutate({
			readonly_enabled: checked,
			...(checked && readonlyPassword.trim() ? { readonly_password: readonlyPassword } : {}),
		})
	}

	const handleChangePassword = () => {
		if (!readonlyPassword.trim()) return
		updateMutation.mutate({ readonly_enabled: true, readonly_password: readonlyPassword })
	}

	if (detailsLoading || !details) {
		return (
			<Card className="overflow-hidden border bg-card shadow-sm">
				<CardHeader className="">
					<div className="h-7 w-48 animate-pulse rounded bg-muted" />
				</CardHeader>
				<CardContent>
					<div className="h-4 w-32 animate-pulse rounded bg-muted" />
				</CardContent>
			</Card>
		)
	}

	return (
		<Card className="overflow-hidden border bg-card shadow-sm">
			<CardHeader className="space-y-4 gap-0">
				<div className="space-y-4">
					<Input
						value={nameDraft}
						onChange={e => {
							setNameDraft(e.target.value)
							setNameError(null)
						}}
						onBlur={handleNameBlur}
						className="h-11 text-lg font-semibold bg-muted/40 border-muted focus-visible:bg-background focus-visible:ring-2"
						placeholder="Book name"
					/>
					<div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
						<div>
							<p className="font-medium text-foreground">Public book</p>
							<p className="text-sm text-muted-foreground">Visible to all users in the system</p>
						</div>
						<Switch checked={details.is_public} onCheckedChange={checked => updateMutation.mutate({ is_public: Boolean(checked) })} />
					</div>
				</div>
				{nameError && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{nameError}</p>}
			</CardHeader>
			<CardContent className="space-y-5 border-t pt-5">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
					<div className="min-w-0 flex-1">
						<h3 className="font-medium text-foreground">Read-only subscription</h3>
						<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
							Share a subscribe-only link so others can view (but not edit) these contacts. You can set a password so only people you share
							it with can use the link.
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-3">
						<span className="text-sm text-muted-foreground">{readonlyEnabled ? 'On' : 'Off'}</span>
						<Switch id={`readonly-toggle-${book.id}`} checked={readonlyEnabled} onCheckedChange={handleReadonlyToggle} />
					</div>
				</div>

				{readonlyEnabled && (
					<div className="space-y-4 rounded-lg border bg-muted/20 p-4">
						<Field>
							<FieldLabel htmlFor={`readonly-password-${book.id}`} className="text-foreground">
								Read-only Password
							</FieldLabel>
							<FieldContent className="">
								<div className="flex flex-col sm:flex-row sm:items-center gap-2">
									<div className="relative w-full">
										<Input
											id={`readonly-password-${book.id}`}
											type={showPassword ? 'text' : 'password'}
											value={readonlyPassword}
											onChange={e => {
												setReadonlyPassword(e.target.value)
												setReadonlyError(null)
											}}
											placeholder="Set a password to secure the link"
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
									<Button
										variant="secondary"
										size="sm"
										onClick={handleChangePassword}
										disabled={updateMutation.isPending || !readonlyPassword.trim()}
									>
										{updateMutation.isPending ? 'Saving…' : 'Save password'}
									</Button>
								</div>
								{!readonlyPassword && (
									<span className="text-sm text-muted-foreground">Optional — leave empty to use a random password until you set one.</span>
								)}
							</FieldContent>
						</Field>
					</div>
				)}

				{readonlyError && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{readonlyError}</p>}
			</CardContent>
		</Card>
	)
}

function generateSlug(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-') // Replace unsafe characters with hyphens
		.replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
}

function BooksPage() {
	const queryClient = useQueryClient()
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
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
		onError: (err: Error) => {
			setError(err.message)
		},
	})

	// Auto-generate slug from name when name changes (if slug hasn't been manually edited)
	useEffect(() => {
		if (!slugManuallyEdited && formData.name) {
			const generatedSlug = generateSlug(formData.name)
			setFormData(prev => ({ ...prev, slug: generatedSlug }))
		}
	}, [formData.name, slugManuallyEdited])

	if (isLoading) {
		return (
			<div className="container mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
				<div className="h-16 w-64 animate-pulse rounded bg-muted" />
				<div className="space-y-6">
					<div className="h-48 animate-pulse rounded-lg bg-muted" />
					<div className="h-48 animate-pulse rounded-lg bg-muted" />
				</div>
			</div>
		)
	}

	return (
		<div className="container mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Address books</h1>
					<p className="mt-1 text-sm text-muted-foreground">Manage books and read-only subscription links.</p>
				</div>
				<Button onClick={() => setIsCreateDialogOpen(true)} className="shrink-0">
					<Plus className="mr-2 h-4 w-4" />
					New book
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
							Create first book
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-6">
					{books.map(book => (
						<BookCard key={book.id} book={book} />
					))}
				</div>
			)}

			<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
				<DialogContent>
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
										// Reset manual edit flag when name changes, so slug regenerates
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
		</div>
	)
}
