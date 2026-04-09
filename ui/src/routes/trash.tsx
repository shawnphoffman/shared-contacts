import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'

export const Route = createFileRoute('/trash')({
	component: TrashPage,
})

interface DeletedContact {
	id: string
	full_name: string | null
	first_name: string | null
	last_name: string | null
	email: string | null
	phone: string | null
	deleted_at: string
}

async function fetchDeletedContacts(): Promise<Array<DeletedContact>> {
	const response = await fetch('/api/contacts/trash')
	if (!response.ok) {
		throw new Error('Failed to fetch deleted contacts')
	}
	return response.json()
}

async function trashAction(action: string, id?: string): Promise<void> {
	const response = await fetch('/api/contacts/trash', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action, id }),
	})
	if (!response.ok) {
		throw new Error('Failed to perform trash action')
	}
}

function TrashPage() {
	const queryClient = useQueryClient()

	const {
		data: contacts = [],
		isLoading,
		error,
	} = useQuery({
		queryKey: ['trash'],
		queryFn: fetchDeletedContacts,
	})

	const restoreMutation = useMutation({
		mutationFn: (id: string) => trashAction('restore', id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['trash'] })
			queryClient.invalidateQueries({ queryKey: ['contacts'] })
		},
	})

	const deleteMutation = useMutation({
		mutationFn: (id: string) => trashAction('permanent-delete', id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['trash'] })
		},
	})

	const emptyMutation = useMutation({
		mutationFn: () => trashAction('empty'),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['trash'] })
		},
	})

	const getDisplayName = (contact: DeletedContact) => {
		if (contact.full_name) return contact.full_name
		const parts = [contact.first_name, contact.last_name].filter(Boolean)
		return parts.length > 0 ? parts.join(' ') : 'Unnamed Contact'
	}

	const formatDate = (dateStr: string) => {
		const date = new Date(dateStr)
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		})
	}

	if (isLoading) {
		return (
			<div className="container mx-auto p-6">
				<div className="text-center">Loading...</div>
			</div>
		)
	}

	if (error) {
		return (
			<div className="container mx-auto p-6">
				<div className="text-center text-red-500">Error loading trash</div>
			</div>
		)
	}

	return (
		<div className="container mx-auto p-6 max-w-4xl">
			<div className="flex items-center justify-between mb-6">
				<div>
					<h1 className="text-3xl font-bold flex items-center gap-2">
						<Trash2 className="w-7 h-7" />
						Trash
					</h1>
					<p className="text-muted-foreground mt-1">
						{contacts.length === 0
							? 'No deleted contacts'
							: `${contacts.length} deleted contact${contacts.length === 1 ? '' : 's'}`}
					</p>
				</div>
				{contacts.length > 0 && (
					<Button
						variant="destructive"
						onClick={() => {
							if (window.confirm('Permanently delete all contacts in trash? This cannot be undone.')) {
								emptyMutation.mutate()
							}
						}}
						disabled={emptyMutation.isPending}
					>
						<Trash2 className="w-4 h-4 mr-1" />
						{emptyMutation.isPending ? 'Emptying...' : 'Empty Trash'}
					</Button>
				)}
			</div>

			{contacts.length === 0 ? (
				<Card>
					<CardContent className="py-12 text-center text-muted-foreground">
						Trash is empty. Deleted contacts will appear here.
					</CardContent>
				</Card>
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead className="hidden sm:table-cell">Email</TableHead>
								<TableHead className="hidden md:table-cell">Deleted</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{contacts.map((contact) => (
								<TableRow key={contact.id}>
									<TableCell className="font-medium">{getDisplayName(contact)}</TableCell>
									<TableCell className="hidden sm:table-cell text-muted-foreground">
										{contact.email || '—'}
									</TableCell>
									<TableCell className="hidden md:table-cell text-muted-foreground text-sm">
										{formatDate(contact.deleted_at)}
									</TableCell>
									<TableCell className="text-right">
										<div className="flex justify-end gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => restoreMutation.mutate(contact.id)}
												disabled={restoreMutation.isPending}
											>
												<RotateCcw className="w-3 h-3 mr-1" />
												Restore
											</Button>
											<Button
												variant="destructive"
												size="sm"
												onClick={() => {
													if (window.confirm(`Permanently delete "${getDisplayName(contact)}"? This cannot be undone.`)) {
														deleteMutation.mutate(contact.id)
													}
												}}
												disabled={deleteMutation.isPending}
											>
												<Trash2 className="w-3 h-3 mr-1" />
												Delete
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	)
}
