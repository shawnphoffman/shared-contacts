import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Cake, Edit, Globe, History, Mail, MapPin, Phone, StickyNote, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ContactForm } from '../components/ContactForm'
import { formatAddressForDisplay, parseAddress } from '../components/AddressInput'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { formatPhoneNumber } from '../lib/utils'
import { getContactPhotoUrl } from '../lib/image'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
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

/**
 * Format a date-only birthday string ("YYYY-MM-DD") for display without
 * timezone shifts. Years at or below 1700 (e.g. Apple's 1604 placeholder)
 * are treated as "no year given" and omitted.
 */
function formatBirthday(value: string): string | null {
	const trimmed = value.trim()
	if (!trimmed) {
		return null
	}
	const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
	if (!match) {
		return trimmed
	}
	const year = Number(match[1])
	const date = new Date(year, Number(match[2]) - 1, Number(match[3]))
	if (Number.isNaN(date.getTime())) {
		return trimmed
	}
	const hasYear = year > 1700
	return date.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		...(hasYear ? { year: 'numeric' } : {}),
	})
}

function getAge(value: string): number | null {
	const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
	if (!match) {
		return null
	}
	const year = Number(match[1])
	if (year <= 1700) {
		return null
	}
	const birth = new Date(year, Number(match[2]) - 1, Number(match[3]))
	const now = new Date()
	let age = now.getFullYear() - birth.getFullYear()
	const monthDiff = now.getMonth() - birth.getMonth()
	if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
		age--
	}
	return age >= 0 && age < 200 ? age : null
}

function InfoRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
	return (
		<div className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
			<Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
			<div className="min-w-0 flex-1 space-y-1.5">
				<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
				<div className="text-sm text-foreground">{children}</div>
			</div>
		</div>
	)
}

function FieldType({ type }: { type?: string }) {
	if (!type) {
		return null
	}
	return (
		<span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground align-middle">
			{type}
		</span>
	)
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
			navigate({ to: '/', search: { book: undefined } })
		},
	})

	if (isLoading) {
		return (
			<div className="container mx-auto p-6">
				<div className="text-center text-muted-foreground">Loading contact...</div>
			</div>
		)
	}

	if (!contact) {
		return (
			<div className="container mx-auto p-6">
				<div className="text-center text-muted-foreground">Contact not found</div>
			</div>
		)
	}

	if (isEditing) {
		return (
			<div className="container mx-auto p-6 max-w-2xl">
				<h1 className="text-3xl font-bold">Edit Contact</h1>
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

	const subtitle = [contact.job_title, contact.organization].filter(Boolean).join(' · ')

	const fallbackStructuredAddress = {
		street: [contact.address_street, contact.address_extended].filter(Boolean).join(', '),
		city: contact.address_city || '',
		state: contact.address_state || '',
		postal: contact.address_postal || '',
		country: contact.address_country || '',
	}

	const emails = contact.emails?.filter(email => email.value.trim()) ?? []
	const phones = contact.phones?.filter(phone => phone.value.trim()) ?? []
	const urls = contact.urls?.filter(url => url.value.trim()) ?? []

	// Pre-compute address display lines so we can skip entries that render
	// nothing (e.g. an empty address that only carries a type label).
	const addresses = (contact.addresses ?? [])
		.map(address => ({ type: address.type, lines: formatAddressForDisplay(parseAddress(address.value || '')) }))
		.filter(address => address.lines.length > 0)
	const fallbackAddressLines =
		addresses.length === 0 ? formatAddressForDisplay(contact.address ? parseAddress(contact.address) : fallbackStructuredAddress) : []

	const birthdayDisplay = contact.birthday ? formatBirthday(contact.birthday) : null
	const birthdayAge = contact.birthday ? getAge(contact.birthday) : null

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

	const hasContactInfo = Boolean(
		emails.length ||
		phones.length ||
		addresses.length ||
		fallbackAddressLines.length ||
		urls.length ||
		birthdayDisplay ||
		contact.notes ||
		hasAdvancedFields
	)

	return (
		<div className="container mx-auto p-6 max-w-2xl flex flex-col gap-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-4">
					<div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xl font-medium text-muted-foreground ring-1 ring-border aspect-square">
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
					<div className="min-w-0">
						<h1 className="truncate text-3xl font-bold leading-tight">{displayName}</h1>
						{subtitle && <p className="mt-1 truncate text-muted-foreground">{subtitle}</p>}
						{addressBooks.length > 0 && (
							<div className="mt-2 flex flex-wrap gap-1.5">
								{addressBooks.map(book => (
									<span key={book.id} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
										{book.name}
									</span>
								))}
							</div>
						)}
					</div>
				</div>
				<div className="flex flex-row gap-2">
					<Button variant="outline" onClick={() => setIsEditing(true)} className="flex-1">
						<Edit className="size-4" />
						Edit
					</Button>
					<Button variant="outline" onClick={() => navigate({ to: '/history', search: { contactId: id } })} className="flex-1">
						<History className="size-4" />
						History
					</Button>
					<Button variant="destructive" onClick={() => setShowDeleteDialog(true)} className="flex-1">
						<Trash2 className="size-4" />
						Delete
					</Button>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Contact Information</CardTitle>
				</CardHeader>
				<CardContent>
					{!hasContactInfo ? (
						<p className="text-sm text-muted-foreground">No contact details have been added yet.</p>
					) : (
						<div className="divide-y divide-border">
							{birthdayDisplay && (
								<InfoRow icon={Cake} label="Birthday">
									<span className="font-medium">{birthdayDisplay}</span>
									{birthdayAge !== null && <span className="ml-2 text-muted-foreground">turns {birthdayAge + 1} this year</span>}
								</InfoRow>
							)}
							{emails.length > 0 && (
								<InfoRow icon={Mail} label={emails.length > 1 ? 'Emails' : 'Email'}>
									<div className="space-y-1">
										{emails.map((email, index) => (
											<div key={index}>
												<a href={`mailto:${email.value}`} className="text-primary hover:underline">
													{email.value}
												</a>
												<FieldType type={email.type} />
											</div>
										))}
									</div>
								</InfoRow>
							)}
							{phones.length > 0 && (
								<InfoRow icon={Phone} label={phones.length > 1 ? 'Phones' : 'Phone'}>
									<div className="space-y-1">
										{phones.map((phone, index) => (
											<div key={index}>
												<a href={`tel:${phone.value}`} className="text-primary hover:underline">
													{formatPhoneNumber(phone.value)}
												</a>
												<FieldType type={phone.type} />
											</div>
										))}
									</div>
								</InfoRow>
							)}
							{(addresses.length > 0 || fallbackAddressLines.length > 0) && (
								<InfoRow icon={MapPin} label={addresses.length > 1 ? 'Addresses' : 'Address'}>
									<div className="space-y-3">
										{addresses.length > 0 ? (
											addresses.map((address, index) => (
												<div key={index} className="not-italic leading-relaxed">
													{address.lines.map((line, lineIndex) => (
														<p key={lineIndex}>{line}</p>
													))}
													<FieldType type={address.type} />
												</div>
											))
										) : (
											<div className="leading-relaxed">
												{fallbackAddressLines.map((line, lineIndex) => (
													<p key={lineIndex}>{line}</p>
												))}
											</div>
										)}
									</div>
								</InfoRow>
							)}
							{urls.length > 0 && (
								<InfoRow icon={Globe} label={urls.length > 1 ? 'URLs' : 'URL'}>
									<div className="space-y-1">
										{urls.map((url, index) => (
											<div key={index}>
												<a href={url.value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
													{url.value}
												</a>
												<FieldType type={url.type} />
											</div>
										))}
									</div>
								</InfoRow>
							)}
							{contact.notes && (
								<InfoRow icon={StickyNote} label="Notes">
									<p className="whitespace-pre-wrap leading-relaxed">{contact.notes}</p>
								</InfoRow>
							)}
							{hasAdvancedFields && (
								<div className="py-4 first:pt-0 last:pb-0">
									<p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Advanced fields</p>
									<dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
										{contact.name_prefix && <AdvancedField label="Name Prefix" value={contact.name_prefix} />}
										{contact.middle_name && <AdvancedField label="Middle Name" value={contact.middle_name} />}
										{contact.name_suffix && <AdvancedField label="Name Suffix" value={contact.name_suffix} />}
										{contact.maiden_name && <AdvancedField label="Maiden Name" value={contact.maiden_name} />}
										{contact.role && <AdvancedField label="Role" value={contact.role} />}
										{contact.mailer && <AdvancedField label="Mailer" value={contact.mailer} />}
										{contact.time_zone && <AdvancedField label="Time Zone" value={contact.time_zone} />}
										{contact.geo && <AdvancedField label="Geo" value={contact.geo} />}
										{contact.agent && <AdvancedField label="Agent" value={contact.agent} />}
										{contact.prod_id && <AdvancedField label="Product ID" value={contact.prod_id} />}
										{contact.revision && <AdvancedField label="Revision" value={contact.revision} />}
										{contact.sort_string && <AdvancedField label="Sort String" value={contact.sort_string} />}
										{contact.class && <AdvancedField label="Class" value={contact.class} />}
										{orgUnits.length > 0 && <AdvancedField label="Organization Units" value={orgUnits.join(', ')} />}
										{categories.length > 0 && <AdvancedField label="Categories" value={categories.join(', ')} />}
										{labels.length > 0 && (
											<AdvancedField
												label="Labels"
												value={labels.map(label => label.value + (label.type ? ` (${label.type})` : '')).join(', ')}
											/>
										)}
										{logos.length > 0 && (
											<AdvancedField
												label="Logos"
												value={logos.map(logo => logo.value + (logo.type ? ` (${logo.type})` : '')).join(', ')}
											/>
										)}
										{sounds.length > 0 && (
											<AdvancedField
												label="Sounds"
												value={sounds.map(sound => sound.value + (sound.type ? ` (${sound.type})` : '')).join(', ')}
											/>
										)}
										{keys.length > 0 && (
											<AdvancedField label="Keys" value={keys.map(key => key.value + (key.type ? ` (${key.type})` : '')).join(', ')} />
										)}
										{customFields.length > 0 && (
											<AdvancedField label="Custom Fields" value={customFields.map(field => `${field.key}: ${field.value}`).join(', ')} />
										)}
									</dl>
								</div>
							)}
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

function AdvancedField({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="text-foreground">{value}</dd>
		</div>
	)
}
