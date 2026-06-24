import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ContactEditPane } from '../components/ContactEditPane'
import { ContactHistoryPanel } from '../components/ContactHistoryPanel'
import { ContactPreview } from '../components/ContactPreview'
import { useContactForm } from '../components/contact-form/useContactForm'
import { Button } from '../components/ui/button'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { PageContainer } from '../components/ui/page-container'
import type { ContactPayload } from '../components/contact-form/useContactForm'
import type { Contact } from '../lib/db'

export const Route = createFileRoute('/$id')({
	beforeLoad: ({ params }) => {
		// Exclude "new" from matching this dynamic route so the static /new route
		// takes precedence.
		if (params.id === 'new') {
			throw notFound()
		}
	},
	component: ContactDetailPage,
})

async function fetchContact(id: string): Promise<Contact> {
	const response = await fetch(`/api/contacts/${id}`)
	if (!response.ok) {
		throw new Error('Failed to fetch contact')
	}
	return response.json()
}

async function updateContact(id: string, data: ContactPayload): Promise<Contact> {
	const response = await fetch(`/api/contacts/${id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data),
	})
	if (!response.ok) {
		const errorText = await response.text()
		let errorData
		try {
			errorData = JSON.parse(errorText)
		} catch {
			errorData = { error: errorText }
		}
		throw new Error(errorData.error || 'Failed to update contact')
	}
	return response.json()
}

async function deleteContact(id: string): Promise<void> {
	const response = await fetch(`/api/contacts/${id}`, { method: 'DELETE' })
	if (!response.ok) {
		throw new Error('Failed to delete contact')
	}
}

function ContactDetailPage() {
	const { id } = Route.useParams()
	// Bumping this remounts the editor, discarding unsaved edits (Cancel).
	const [resetNonce, setResetNonce] = useState(0)

	const { data: contact, isLoading } = useQuery({
		queryKey: ['contacts', id],
		queryFn: () => fetchContact(id),
	})

	if (isLoading) {
		return <div className="p-8 text-center text-muted-foreground">Loading contact…</div>
	}

	if (!contact) {
		return <div className="p-8 text-center text-muted-foreground">Contact not found</div>
	}

	// Key on the saved revision (and the reset nonce) so a successful save or an
	// explicit Cancel re-baselines the form: resets the unsaved-changes indicator
	// and reflects server-normalized values.
	return <ContactEditor key={`${String(contact.updated_at)}-${resetNonce}`} contact={contact} onDiscard={() => setResetNonce(n => n + 1)} />
}

type Tab = 'edit' | 'history'

function ContactEditor({ contact, onDiscard }: { contact: Contact; onDiscard: () => void }) {
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const form = useContactForm(contact)
	const [tab, setTab] = useState<Tab>('edit')
	const [showDeleteDialog, setShowDeleteDialog] = useState(false)

	const updateMutation = useMutation({
		mutationFn: (data: ContactPayload) => updateContact(contact.id, data),
		onSuccess: updated => {
			queryClient.setQueryData(['contacts', contact.id], updated)
			queryClient.invalidateQueries({ queryKey: ['contacts'] })
			queryClient.invalidateQueries({ queryKey: ['history', contact.id] })
			toast.success('Contact saved')
		},
		onError: (error: Error) => toast.error(error.message),
	})

	const deleteMutation = useMutation({
		mutationFn: () => deleteContact(contact.id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['contacts'] })
			navigate({ to: '/', search: { book: undefined } })
		},
	})

	const handleSave = () => {
		if (!form.validateAll()) {
			const firstErrorField = document.querySelector('.border-destructive')
			firstErrorField?.scrollIntoView({ behavior: 'smooth', block: 'center' })
			return
		}
		updateMutation.mutate(form.buildPayload({ includeAddressBooks: true }))
	}

	const displayName = form.fullName.trim() || 'Unnamed contact'

	return (
		<PageContainer width="wide">
			{/* Header */}
			<div className="mb-6 flex flex-wrap items-center gap-3">
				<button
					type="button"
					className="text-sm text-muted-foreground hover:text-foreground"
					onClick={() => navigate({ to: '/', search: { book: undefined } })}
				>
					All Contacts /
				</button>
				<h1 className="text-lg font-semibold">{displayName}</h1>
				{form.isDirty && <span className="rounded-full border bg-muted px-2.5 py-1 text-xs text-muted-foreground">Unsaved changes</span>}
			</div>

			{/* 1 : 1 columns */}
			<div className="grid items-start gap-6 lg:grid-cols-2">
				{/* Left: sticky live preview */}
				<div className="lg:sticky lg:top-6">
					<ContactPreview form={form} contact={contact} onDelete={() => setShowDeleteDialog(true)} />
				</div>

				{/* Right: tabbed edit / history */}
				<div>
					<div className="mb-4 flex flex-wrap items-center gap-3">
						<div className="flex w-max gap-1 rounded-xl border bg-card p-1">
							<button
								type="button"
								onClick={() => setTab('edit')}
								data-active={tab === 'edit'}
								className="rounded-lg px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors data-[active=true]:bg-secondary data-[active=true]:text-foreground"
							>
								Edit
							</button>
							<button
								type="button"
								onClick={() => setTab('history')}
								data-active={tab === 'history'}
								className="rounded-lg px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors data-[active=true]:bg-secondary data-[active=true]:text-foreground"
							>
								History
							</button>
						</div>
						{tab === 'edit' && (
							<div className="ml-auto flex gap-2">
								<Button variant="outline" size="sm" onClick={onDiscard} disabled={!form.isDirty || updateMutation.isPending}>
									Cancel
								</Button>
								<Button size="sm" onClick={handleSave} disabled={!form.isDirty || updateMutation.isPending}>
									{updateMutation.isPending ? 'Saving…' : 'Save'}
								</Button>
							</div>
						)}
					</div>

					{tab === 'edit' ? <ContactEditPane form={form} /> : <ContactHistoryPanel contactId={contact.id} />}

					{tab === 'edit' && (
						<p className="select-none pt-1 text-right text-xs text-muted-foreground">
							<span className="text-primary">:w</span> save · <span className="text-primary">esc</span> cancel
						</p>
					)}
				</div>
			</div>

			<ConfirmDialog
				open={showDeleteDialog}
				onOpenChange={setShowDeleteDialog}
				title="Delete Contact"
				description={`Are you sure you want to delete ${contact.full_name || 'this contact'}? This action cannot be undone.`}
				confirmLabel="Delete"
				pendingLabel="Deleting…"
				onConfirm={() => deleteMutation.mutate()}
				pending={deleteMutation.isPending}
			/>
		</PageContainer>
	)
}
