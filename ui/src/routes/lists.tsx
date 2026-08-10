import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ListChecks, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldContent, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const Route = createFileRoute('/lists')({
	component: ListsPage,
})

interface ContactList {
	id: string
	name: string
	vcard_id: string | null
	member_count: number
	members: Array<{ id: string; name: string }>
	address_books: Array<{ id: string; name: string }>
}

async function fetchLists(): Promise<Array<ContactList>> {
	const response = await fetch('/api/lists')
	if (!response.ok) {
		throw new Error('Failed to fetch lists')
	}
	return response.json()
}

async function renameList(id: string, name: string): Promise<void> {
	const response = await fetch(`/api/lists/${id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name }),
	})
	if (!response.ok) {
		const body = await response.json().catch(() => ({}))
		throw new Error(body.error || 'Failed to rename list')
	}
}

async function deleteList(id: string): Promise<void> {
	const response = await fetch(`/api/lists/${id}`, { method: 'DELETE' })
	if (!response.ok) {
		const body = await response.json().catch(() => ({}))
		throw new Error(body.error || 'Failed to delete list')
	}
}

/** Names of the members we can resolve, capped so a big list stays one row. */
function memberSummary(list: ContactList): string | null {
	if (list.members.length === 0) return null
	const shown = list.members.slice(0, 3).map(member => member.name)
	const remaining = list.members.length - shown.length
	return remaining > 0 ? `${shown.join(', ')} +${remaining} more` : shown.join(', ')
}

function RenameListDialog({
	list,
	open,
	onOpenChange,
}: {
	list: ContactList | null
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const queryClient = useQueryClient()
	const [nameDraft, setNameDraft] = useState('')
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (list) {
			setNameDraft(list.name)
			setError(null)
		}
	}, [list])

	const renameMutation = useMutation({
		mutationFn: (name: string) => renameList(list!.id, name),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['lists'] })
			queryClient.invalidateQueries({ queryKey: ['contacts'] })
			onOpenChange(false)
			toast.success('List renamed')
		},
		onError: (err: Error) => setError(err.message),
	})

	const handleSave = () => {
		const trimmed = nameDraft.trim()
		if (!trimmed) {
			setError('Name is required')
			return
		}
		renameMutation.mutate(trimmed)
	}

	if (!list) return null

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Rename list</DialogTitle>
					<DialogDescription>
						The new name syncs to everyone subscribed to this address book. Members are left exactly as they are.
					</DialogDescription>
				</DialogHeader>
				{/* A real form so Enter saves, which is the whole interaction for a
				    one-field dialog. */}
				<form
					onSubmit={event => {
						event.preventDefault()
						handleSave()
					}}
				>
					<div className="space-y-4 py-2">
						<Field>
							<FieldLabel htmlFor="list-name">Name</FieldLabel>
							<FieldContent>
								<Input
									id="list-name"
									value={nameDraft}
									onChange={event => {
										setNameDraft(event.target.value)
										setError(null)
									}}
									placeholder="List name"
									autoFocus
								/>
							</FieldContent>
						</Field>
						{error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={renameMutation.isPending}>
							{renameMutation.isPending ? 'Saving…' : 'Save'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

function ListsPage() {
	const queryClient = useQueryClient()
	const [renameTarget, setRenameTarget] = useState<ContactList | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<ContactList | null>(null)

	const {
		data: lists = [],
		isLoading,
		error,
	} = useQuery({
		queryKey: ['lists'],
		queryFn: fetchLists,
	})

	const deleteMutation = useMutation({
		mutationFn: (id: string) => deleteList(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['lists'] })
			queryClient.invalidateQueries({ queryKey: ['contacts'] })
			setDeleteTarget(null)
			toast.success('List deleted. It clears from subscribed devices on the next sync.')
		},
		onError: (err: Error) => toast.error(err.message),
	})

	const header = (
		<PageHeader
			icon={<ListChecks />}
			title="Lists"
			description="Groups nested under an address book in Apple Contacts. Rename or remove one here when your CardDAV client will not."
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
				<div className="py-12 text-center text-sm text-destructive">Error loading lists</div>
			</PageContainer>
		)
	}

	return (
		<PageContainer width="standard" className="space-y-6">
			{header}

			{lists.length === 0 ? (
				<div className="flex flex-col items-center gap-2 rounded-2xl border bg-card py-16 text-center">
					<ListChecks className="size-8 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">No lists yet. Create one in Apple Contacts and it will appear here.</p>
				</div>
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead className="hidden sm:table-cell">Members</TableHead>
								<TableHead className="hidden md:table-cell">Books</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{lists.map(list => {
								const summary = memberSummary(list)
								const unresolved = list.member_count - list.members.length
								return (
									<TableRow key={list.id}>
										<TableCell className="font-medium">{list.name}</TableCell>
										<TableCell className="hidden sm:table-cell">
											<div className="text-sm">
												{list.member_count} {list.member_count === 1 ? 'person' : 'people'}
												{unresolved > 0 && <span className="text-muted-foreground"> ({unresolved} not in this app)</span>}
											</div>
											{summary && <div className="max-w-[22rem] truncate text-xs text-muted-foreground">{summary}</div>}
										</TableCell>
										<TableCell className="hidden md:table-cell">
											<div className="flex flex-wrap gap-1">
												{list.address_books.map(book => (
													<Badge key={book.id} variant="outline">
														{book.name}
													</Badge>
												))}
											</div>
										</TableCell>
										<TableCell className="text-right">
											<div className="flex justify-end gap-2">
												<Button variant="outline" size="sm" onClick={() => setRenameTarget(list)}>
													<Pencil className="mr-1 h-3 w-3" />
													<span className="hidden sm:inline">Rename</span>
												</Button>
												<Button variant="destructive" size="sm" onClick={() => setDeleteTarget(list)} disabled={deleteMutation.isPending}>
													<Trash2 className="mr-1 h-3 w-3" />
													<span className="hidden sm:inline">Delete</span>
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

			<RenameListDialog
				list={renameTarget}
				open={renameTarget !== null}
				onOpenChange={open => {
					if (!open) setRenameTarget(null)
				}}
			/>

			<ConfirmDialog
				open={deleteTarget !== null}
				onOpenChange={open => {
					if (!open) setDeleteTarget(null)
				}}
				title={deleteTarget ? `Delete the list ${deleteTarget.name}?` : 'Delete list?'}
				description="The address book is shared, so this removes the list from every subscriber's device. The people in it are not deleted."
				confirmLabel="Delete list"
				pendingLabel="Deleting…"
				onConfirm={() => {
					if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
				}}
				pending={deleteMutation.isPending}
			/>
		</PageContainer>
	)
}
