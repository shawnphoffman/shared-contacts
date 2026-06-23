import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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
	const [deleteTarget, setDeleteTarget] = useState<DeletedContact | null>(null)
	const [emptyOpen, setEmptyOpen] = useState(false)

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
			toast.success('Contact restored')
		},
		onError: (err: Error) => {
			toast.error(err.message)
		},
	})

	const deleteMutation = useMutation({
		mutationFn: (id: string) => trashAction('permanent-delete', id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['trash'] })
			setDeleteTarget(null)
			toast.success('Contact permanently deleted')
		},
		onError: (err: Error) => {
			toast.error(err.message)
		},
	})

	const emptyMutation = useMutation({
		mutationFn: () => trashAction('empty'),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['trash'] })
			setEmptyOpen(false)
			toast.success('Trash emptied')
		},
		onError: (err: Error) => {
			toast.error(err.message)
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

	const header = (
		<PageHeader
			icon={<Trash2 />}
			title="Trash"
			description="Restore contacts or permanently remove them."
			actions={
				contacts.length > 0 ? (
					<Button variant="destructive" onClick={() => setEmptyOpen(true)} disabled={emptyMutation.isPending}>
						<Trash2 className="mr-2 h-4 w-4" />
						{emptyMutation.isPending ? 'Emptying…' : 'Empty trash'}
					</Button>
				) : undefined
			}
		/>
	)

	if (isLoading) {
		return (
			<PageContainer width="standard" className="space-y-6">
				{header}
				<div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
			</PageContainer>
		)
	}

	if (error) {
		return (
			<PageContainer width="standard" className="space-y-6">
				{header}
				<div className="py-12 text-center text-sm text-destructive">Error loading trash</div>
			</PageContainer>
		)
	}

	return (
		<PageContainer width="standard" className="space-y-6">
			{header}

			{contacts.length === 0 ? (
				<div className="flex flex-col items-center gap-2 rounded-2xl border bg-card py-16 text-center">
					<Trash2 className="size-8 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">Trash is empty. Deleted contacts will appear here.</p>
				</div>
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
							{contacts.map(contact => {
								const deletingThis = deleteMutation.isPending && deleteTarget?.id === contact.id
								const restoringThis = restoreMutation.isPending && restoreMutation.variables === contact.id
								return (
									<TableRow key={contact.id}>
										<TableCell className="font-medium">{getDisplayName(contact)}</TableCell>
										<TableCell className="hidden text-muted-foreground sm:table-cell">{contact.email || '-'}</TableCell>
										<TableCell className="hidden text-sm text-muted-foreground md:table-cell">{formatDate(contact.deleted_at)}</TableCell>
										<TableCell className="text-right">
											<div className="flex justify-end gap-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() => restoreMutation.mutate(contact.id)}
													disabled={restoreMutation.isPending}
												>
													<RotateCcw className="mr-1 h-3 w-3" />
													{restoringThis ? 'Restoring…' : 'Restore'}
												</Button>
												<Button
													variant="destructive"
													size="sm"
													onClick={() => setDeleteTarget(contact)}
													disabled={deleteMutation.isPending}
												>
													<Trash2 className="mr-1 h-3 w-3" />
													{deletingThis ? 'Deleting…' : 'Delete'}
												</Button>
											</div>
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				</div>
			)}

			<ConfirmDialog
				open={deleteTarget !== null}
				onOpenChange={open => {
					if (!open) setDeleteTarget(null)
				}}
				title={deleteTarget ? `Permanently delete ${getDisplayName(deleteTarget)}?` : 'Permanently delete contact?'}
				description="This cannot be undone."
				confirmLabel="Delete"
				pendingLabel="Deleting…"
				onConfirm={() => {
					if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
				}}
				pending={deleteMutation.isPending}
			/>

			<ConfirmDialog
				open={emptyOpen}
				onOpenChange={setEmptyOpen}
				title={`Permanently delete all ${contacts.length} contact${contacts.length === 1 ? '' : 's'} in trash?`}
				description="This cannot be undone."
				confirmLabel="Empty trash"
				pendingLabel="Emptying…"
				onConfirm={() => emptyMutation.mutate()}
				pending={emptyMutation.isPending}
			/>
		</PageContainer>
	)
}
