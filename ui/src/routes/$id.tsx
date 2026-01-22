import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Briefcase, Building, Edit, Globe, Mail, MapPin, Phone, StickyNote, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ContactForm } from '../components/ContactForm'
import { formatAddressForDisplay, parseAddress } from '../components/AddressInput'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { formatPhoneNumber } from '../lib/utils'
import { getContactPhotoUrl } from '../lib/image'
import type { ContactPayload } from '../components/ContactForm'
import type { Contact } from '../lib/db'

export const Route = createFileRoute('/$id')({
	beforeLoad: ({ params }) => {
		// Exclude "new" from matching this dynamic route
		// This ensures the static /new route takes precedence
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
		throw new Error(errorData.error || 'Failed to update contact')
	}
	return response.json()
}

async function deleteContact(id: string): Promise<void> {
	const response = await fetch(`/api/contacts/${id}`, {
		method: 'DELETE',
	})
	if (!response.ok) {
		throw new Error('Failed to delete contact')
	}
}

function ContactDetailPage() {
	const { id } = Route.useParams()
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const [isEditing, setIsEditing] = useState(false)
	const [showDeleteDialog, setShowDeleteDialog] = useState(false)
	const [showPhoto, setShowPhoto] = useState(true)

	const { data: contact, isLoading } = useQuery({
		queryKey: ['contacts', id],
		queryFn: () => fetchContact(id),
	})

	useEffect(() => {
		if (!contact) {
			return
		}
		setShowPhoto(true)
	}, [contact?.id, contact?.photo_hash, contact?.photo_updated_at])

	const updateMutation = useMutation({
		mutationFn: (data: Partial<Contact>) => updateContact(id, data),
		onSuccess: updatedContact => {
			queryClient.setQueryData(['contacts', id], updatedContact)
			queryClient.invalidateQueries({ queryKey: ['contacts'] })
			queryClient.invalidateQueries({ queryKey: ['contacts', id] })
			setIsEditing(false)
		},
	})

	const deleteMutation = useMutation({
		mutationFn: () => deleteContact(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['contacts'] })
			navigate({ to: '/' })
		},
	})

	if (isLoading) {
		return (
			<div className="container mx-auto p-6">
				<div className="text-center">Loading contact...</div>
			</div>
		)
	}

	if (!contact) {
		return (
			<div className="container mx-auto p-6">
				<div className="text-center">Contact not found</div>
			</div>
		)
	}

	if (isEditing) {
		return (
			<div className="container mx-auto p-6 max-w-2xl">
				<h1 className="text-3xl font-bold mb-6">Edit Contact</h1>
				<ContactForm
					contact={contact}
					onSubmit={async data => {
						await updateMutation.mutateAsync(data)
					}}
					onCancel={() => setIsEditing(false)}
				/>
			</div>
		)
	}

	const displayName = contact.full_name || 'Unnamed Contact'
	const initials = displayName
		.split(' ')
		.filter(Boolean)
		.slice(0, 2)
		.map(part => part[0].toUpperCase())
		.join('')

	const fallbackStructuredAddress = {
		street: [contact.address_street, contact.address_extended].filter(Boolean).join(', '),
		city: contact.address_city || '',
		state: contact.address_state || '',
		postal: contact.address_postal || '',
		country: contact.address_country || '',
	}

	const orgUnits = contact.org_units?.filter(Boolean) ?? []
	const categories = contact.categories?.filter(Boolean) ?? []
	const labels = contact.labels?.filter(label => label.value.trim()) ?? []
	const logos = contact.logos?.filter(logo => logo.value.trim()) ?? []
	const sounds = contact.sounds?.filter(sound => sound.value.trim()) ?? []
	const keys = contact.keys?.filter(key => key.value.trim()) ?? []
	const customFields = contact.custom_fields?.filter(field => field.key.trim() && field.value.trim()) ?? []
	const addressBooks = contact.address_books?.filter(book => book.name) ?? []

	const hasAdvancedFields = Boolean(
		contact.middle_name ||
		contact.name_prefix ||
		contact.name_suffix ||
		contact.maiden_name ||
		contact.role ||
		contact.mailer ||
		contact.time_zone ||
		contact.geo ||
		contact.agent ||
		contact.prod_id ||
		contact.revision ||
		contact.sort_string ||
		contact.class ||
		orgUnits.length > 0 ||
		categories.length > 0 ||
		labels.length > 0 ||
		logos.length > 0 ||
		sounds.length > 0 ||
		keys.length > 0 ||
		customFields.length > 0
	)

	return (
		<div className="container mx-auto p-6 max-w-2xl">
			<div className="flex justify-between items-center mb-6">
				<div className="flex items-center gap-4">
					<div className="h-20 w-20 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-500">
						{showPhoto && (
							<img
								src={getContactPhotoUrl(contact)}
								alt={displayName}
								className="h-full w-full object-cover"
								onError={() => setShowPhoto(false)}
							/>
						)}
						{!showPhoto && <span>{initials || '—'}</span>}
					</div>
					<h1 className="text-3xl font-bold">{displayName}</h1>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" onClick={() => setIsEditing(true)}>
						<Edit className="w-4 h-4 mr-1" />
						Edit
					</Button>
					<Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
						<Trash2 className="w-4 h-4 mr-1" />
						Delete
					</Button>
				</div>
			</div>
			{addressBooks.length > 0 && (
				<div className="flex flex-wrap gap-2 mb-6">
					{addressBooks.map(book => (
						<span key={book.id} className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
							{book.name}
						</span>
					))}
				</div>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Contact Information</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{((contact.emails && contact.emails.length > 0) || contact.email) && (
						<div className="flex items-center gap-3">
							<Mail className="w-5 h-5 text-gray-400" />
							<div className="flex-1">
								<p className="text-sm text-gray-500 mb-1">Email{contact.emails && contact.emails.length > 1 ? 's' : ''}</p>
								<div className="space-y-1">
									{contact.emails && contact.emails.length > 0
										? contact.emails.map((email, index) => (
												<div key={index}>
													<a href={`mailto:${email.value}`} className="text-blue-600 hover:underline">
														{email.value}
														{email.type && <span className="text-gray-500 text-sm ml-2">({email.type})</span>}
													</a>
												</div>
											))
										: contact.email && (
												<a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">
													{contact.email}
												</a>
											)}
								</div>
							</div>
						</div>
					)}
					{((contact.phones && contact.phones.length > 0) || contact.phone) && (
						<div className="flex items-center gap-3">
							<Phone className="w-5 h-5 text-gray-400" />
							<div className="flex-1">
								<p className="text-sm text-gray-500 mb-1">Phone{contact.phones && contact.phones.length > 1 ? 's' : ''}</p>
								<div className="space-y-1">
									{contact.phones && contact.phones.length > 0
										? contact.phones.map((phone, index) => (
												<div key={index}>
													<a href={`tel:${phone.value}`} className="text-blue-600 hover:underline">
														{formatPhoneNumber(phone.value)}
														{phone.type && <span className="text-gray-500 text-sm ml-2">({phone.type})</span>}
													</a>
												</div>
											))
										: contact.phone && (
												<a href={`tel:${contact.phone}`} className="text-blue-600 hover:underline">
													{formatPhoneNumber(contact.phone)}
												</a>
											)}
								</div>
							</div>
						</div>
					)}
					{contact.organization && (
						<div className="flex items-center gap-3">
							<Building className="w-5 h-5 text-gray-400" />
							<div>
								<p className="text-sm text-gray-500">Organization</p>
								<p>{contact.organization}</p>
							</div>
						</div>
					)}
					{contact.job_title && (
						<div className="flex items-center gap-3">
							<Briefcase className="w-5 h-5 text-gray-400" />
							<div>
								<p className="text-sm text-gray-500">Job Title</p>
								<p>{contact.job_title}</p>
							</div>
						</div>
					)}
					{((contact.addresses && contact.addresses.length > 0) || contact.address) && (
						<div className="flex items-center gap-3">
							<MapPin className="w-5 h-5 text-gray-400" />
							<div className="flex-1">
								<p className="text-sm text-gray-500 mb-1">
									Address
									{contact.addresses && contact.addresses.length > 1 ? 'es' : ''}
								</p>
								<div className="space-y-1">
									{contact.addresses && contact.addresses.length > 0
										? contact.addresses.map((address, index) => (
												<div key={index}>
													<div className="space-y-1">
														{formatAddressForDisplay(parseAddress(address.value || '')).map((line, lineIndex) => (
															<p key={lineIndex}>{line}</p>
														))}
														{address.type && <p className="text-gray-500 text-sm">({address.type})</p>}
													</div>
												</div>
											))
										: (() => {
												const structured = contact.address ? parseAddress(contact.address) : fallbackStructuredAddress
												const lines = formatAddressForDisplay(structured)
												return lines.length > 0 ? (
													<div className="space-y-1">
														{lines.map((line, lineIndex) => (
															<p key={lineIndex}>{line}</p>
														))}
													</div>
												) : null
											})()}
								</div>
							</div>
						</div>
					)}
					{((contact.urls && contact.urls.length > 0) || contact.homepage) && (
						<div className="flex items-center gap-3">
							<Globe className="w-5 h-5 text-gray-400" />
							<div className="flex-1">
								<p className="text-sm text-gray-500 mb-1">URL{contact.urls && contact.urls.length > 1 ? 's' : ''}</p>
								<div className="space-y-1">
									{contact.urls && contact.urls.length > 0
										? contact.urls.map((url, index) => (
												<div key={index}>
													<a href={url.value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
														{url.value}
														{url.type && <span className="text-gray-500 text-sm ml-2">({url.type})</span>}
													</a>
												</div>
											))
										: contact.homepage && (
												<a href={contact.homepage} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
													{contact.homepage}
												</a>
											)}
								</div>
							</div>
						</div>
					)}
					{contact.notes && (
						<div className="flex items-start gap-3">
							<StickyNote className="w-5 h-5 text-gray-400 mt-0.5" />
							<div className="flex-1">
								<p className="text-sm text-gray-500 mb-2">Notes</p>
								<p className="whitespace-pre-wrap">{contact.notes}</p>
							</div>
						</div>
					)}
					{hasAdvancedFields && (
						<div className="pt-4 border-t space-y-3">
							<p className="text-sm font-medium text-gray-700">Advanced fields</p>
							<div className="space-y-2 text-sm">
								{contact.name_prefix && (
									<div>
										<span className="text-gray-500">Name Prefix:</span> {contact.name_prefix}
									</div>
								)}
								{contact.middle_name && (
									<div>
										<span className="text-gray-500">Middle Name:</span> {contact.middle_name}
									</div>
								)}
								{contact.name_suffix && (
									<div>
										<span className="text-gray-500">Name Suffix:</span> {contact.name_suffix}
									</div>
								)}
								{contact.maiden_name && (
									<div>
										<span className="text-gray-500">Maiden Name:</span> {contact.maiden_name}
									</div>
								)}
								{contact.role && (
									<div>
										<span className="text-gray-500">Role:</span> {contact.role}
									</div>
								)}
								{contact.mailer && (
									<div>
										<span className="text-gray-500">Mailer:</span> {contact.mailer}
									</div>
								)}
								{contact.time_zone && (
									<div>
										<span className="text-gray-500">Time Zone:</span> {contact.time_zone}
									</div>
								)}
								{contact.geo && (
									<div>
										<span className="text-gray-500">Geo:</span> {contact.geo}
									</div>
								)}
								{contact.agent && (
									<div>
										<span className="text-gray-500">Agent:</span> {contact.agent}
									</div>
								)}
								{contact.prod_id && (
									<div>
										<span className="text-gray-500">Product ID:</span> {contact.prod_id}
									</div>
								)}
								{contact.revision && (
									<div>
										<span className="text-gray-500">Revision:</span> {contact.revision}
									</div>
								)}
								{contact.sort_string && (
									<div>
										<span className="text-gray-500">Sort String:</span> {contact.sort_string}
									</div>
								)}
								{contact.class && (
									<div>
										<span className="text-gray-500">Class:</span> {contact.class}
									</div>
								)}
								{orgUnits.length > 0 && (
									<div>
										<span className="text-gray-500">Organization Units:</span> {orgUnits.join(', ')}
									</div>
								)}
								{categories.length > 0 && (
									<div>
										<span className="text-gray-500">Categories:</span> {categories.join(', ')}
									</div>
								)}
								{labels.length > 0 && (
									<div>
										<span className="text-gray-500">Labels:</span>
										<div className="mt-1 space-y-1">
											{labels.map((label, index) => (
												<div key={index}>
													{label.value}
													{label.type && <span className="text-gray-500 text-sm ml-2">({label.type})</span>}
												</div>
											))}
										</div>
									</div>
								)}
								{logos.length > 0 && (
									<div>
										<span className="text-gray-500">Logos:</span>
										<div className="mt-1 space-y-1">
											{logos.map((logo, index) => (
												<div key={index}>
													{logo.value}
													{logo.type && <span className="text-gray-500 text-sm ml-2">({logo.type})</span>}
												</div>
											))}
										</div>
									</div>
								)}
								{sounds.length > 0 && (
									<div>
										<span className="text-gray-500">Sounds:</span>
										<div className="mt-1 space-y-1">
											{sounds.map((sound, index) => (
												<div key={index}>
													{sound.value}
													{sound.type && <span className="text-gray-500 text-sm ml-2">({sound.type})</span>}
												</div>
											))}
										</div>
									</div>
								)}
								{keys.length > 0 && (
									<div>
										<span className="text-gray-500">Keys:</span>
										<div className="mt-1 space-y-1">
											{keys.map((key, index) => (
												<div key={index}>
													{key.value}
													{key.type && <span className="text-gray-500 text-sm ml-2">({key.type})</span>}
												</div>
											))}
										</div>
									</div>
								)}
								{customFields.length > 0 && (
									<div>
										<span className="text-gray-500">Custom Fields:</span>
										<div className="mt-1 space-y-1">
											{customFields.map((field, index) => (
												<div key={index}>
													{field.key}: {field.value}
												</div>
											))}
										</div>
									</div>
								)}
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			<Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Contact</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete {contact.full_name || 'this contact'}? This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
							Cancel
						</Button>
						<Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
							{deleteMutation.isPending ? 'Deleting...' : 'Delete'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
