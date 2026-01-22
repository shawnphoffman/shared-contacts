import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/ui/button'
import { Field, FieldContent, FieldLabel } from '../components/ui/field'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Checkbox } from '../components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'

interface AddressBook {
	id: string
	name: string
	slug: string
	is_public: boolean
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

export const Route = createFileRoute('/books')({
	component: BooksPage,
})

function BooksPage() {
	const queryClient = useQueryClient()
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
	const [formData, setFormData] = useState({ name: '', slug: '', is_public: true })
	const [error, setError] = useState<string | null>(null)

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
		},
		onError: (err: Error) => {
			setError(err.message)
		},
	})

	if (isLoading) {
		return (
			<div className="container mx-auto p-6">
				<div className="text-center">Loading address books...</div>
			</div>
		)
	}

	return (
		<div className="container mx-auto p-6 gap-6 flex flex-col max-w-3xl">
			<div className="flex justify-between items-center">
				<div className="flex items-center gap-3">
					<BookOpen className="w-8 h-8" />
					<h1 className="text-3xl font-bold">Books</h1>
				</div>
				<Button onClick={() => setIsCreateDialogOpen(true)}>
					<Plus className="w-4 h-4 mr-1" />
					New Book
				</Button>
			</div>

			{books.length === 0 ? (
				<div className="text-center py-12 border rounded-lg">
					<p className="text-gray-500 mb-4">No address books yet.</p>
					<Button onClick={() => setIsCreateDialogOpen(true)}>
						<Plus className="w-4 h-4 mr-1" />
						Create First Book
					</Button>
				</div>
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Slug</TableHead>
								<TableHead>Visibility</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{books.map(book => (
								<TableRow key={book.id}>
									<TableCell className="font-medium">{book.name}</TableCell>
									<TableCell>{book.slug}</TableCell>
									<TableCell>{book.is_public ? 'Public' : 'Private'}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
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
									onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
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
									onChange={e => setFormData(prev => ({ ...prev, slug: e.target.value }))}
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
						{error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsCreateDialogOpen(false)
								setFormData({ name: '', slug: '', is_public: true })
								setError(null)
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
