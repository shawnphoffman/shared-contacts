import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ContactEditPane } from '../components/ContactEditPane'
import { ContactPreview } from '../components/ContactPreview'
import { useContactForm } from '../components/contact-form/useContactForm'
import { Button } from '../components/ui/button'
import { PageContainer } from '../components/ui/page-container'
import { PageHeader } from '../components/ui/page-header'
import type { ContactPayload } from '../components/contact-form/useContactForm'
import type { Contact } from '../lib/db'

export const Route = createFileRoute('/new')({
	component: NewContactPage,
})

async function createContact(data: ContactPayload): Promise<Contact> {
	const response = await fetch('/api/contacts', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
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
		throw new Error(errorData.error || 'Failed to create contact')
	}
	return response.json()
}

function NewContactPage() {
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	// An empty form: useContactForm initializes every group with an empty entry
	// so the editor and live preview render gracefully with no values yet.
	const form = useContactForm()

	const createMutation = useMutation({
		mutationFn: (data: ContactPayload) => createContact(data),
		onSuccess: contact => {
			queryClient.invalidateQueries({ queryKey: ['contacts'] })
			toast.success('Contact created')
			navigate({ to: '/$id', params: { id: contact.id } })
		},
		onError: (error: Error) => toast.error(error.message),
	})

	const handleCreate = () => {
		if (!form.validateAll()) {
			const firstErrorField = document.querySelector('.border-destructive')
			firstErrorField?.scrollIntoView({ behavior: 'smooth', block: 'center' })
			return
		}
		createMutation.mutate(form.buildPayload({ includeAddressBooks: true }))
	}

	return (
		<PageContainer width="wide">
			<PageHeader title="New Contact" description="Fill in the details and watch the live preview update as you type." />

			{/* 1 : 1 columns, matching the editor */}
			<div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
				{/* Left: sticky live preview */}
				<div className="lg:sticky lg:top-6">
					<ContactPreview form={form} />
				</div>

				{/* Right: edit pane with the Cancel/Create action cluster */}
				<div>
					<div className="mb-4 flex flex-wrap items-center gap-3">
						<div className="ml-auto flex gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => navigate({ to: '/', search: { book: undefined } })}
								disabled={createMutation.isPending}
							>
								Cancel
							</Button>
							<Button size="sm" onClick={handleCreate} disabled={createMutation.isPending}>
								{createMutation.isPending ? 'Creating…' : 'Create'}
							</Button>
						</div>
					</div>

					<ContactEditPane form={form} />
				</div>
			</div>
		</PageContainer>
	)
}
