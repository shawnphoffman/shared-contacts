import { Link } from '@tanstack/react-router'
import { Building, Mail, MapPin, Phone } from 'lucide-react'
import { formatPhoneNumber } from '../lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { ContactAvatar } from './ContactAvatar'
import { formatAddressForSingleLine, parseAddress } from './AddressInput'
import type { Contact } from '../lib/db'

interface ContactCardProps {
	contact: Contact
}

export function ContactCard({ contact }: ContactCardProps) {
	const displayName = contact.full_name || 'Unnamed Contact'

	const fallbackStreet = [contact.address_street, contact.address_extended].filter(Boolean).join(', ')

	const structuredAddress =
		contact.addresses && contact.addresses.length > 0
			? parseAddress(contact.addresses[0]?.value || '')
			: contact.address
				? parseAddress(contact.address)
				: {
						street: fallbackStreet,
						city: contact.address_city || '',
						state: contact.address_state || '',
						postal: contact.address_postal || '',
						country: contact.address_country || '',
					}
	const addressLine = formatAddressForSingleLine(structuredAddress)

	return (
		<Link to="/$id" params={{ id: contact.id }}>
			<Card className="hover:shadow-lg transition-shadow cursor-pointer">
				<CardHeader>
					<div className="flex items-center gap-3">
						<ContactAvatar contact={contact} className="h-12 w-12 text-sm" />
						<div className="space-y-1">
							<CardTitle className="text-xl">
								{displayName}
								{contact.nickname && <span className="text-base font-normal text-gray-500 ml-2">({contact.nickname})</span>}
							</CardTitle>
							{contact.job_title && contact.organization && (
								<p className="text-sm text-gray-500">
									{contact.job_title} at {contact.organization}
								</p>
							)}
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-2">
					{contact.email && (
						<div className="flex items-center gap-2 text-sm">
							<Mail className="w-4 h-4 text-gray-400" />
							<span>{contact.email}</span>
						</div>
					)}
					{contact.phone && (
						<div className="flex items-center gap-2 text-sm">
							<Phone className="w-4 h-4 text-gray-400" />
							<span>{formatPhoneNumber(contact.phone)}</span>
						</div>
					)}
					{contact.organization && !contact.job_title && (
						<div className="flex items-center gap-2 text-sm">
							<Building className="w-4 h-4 text-gray-400" />
							<span>{contact.organization}</span>
						</div>
					)}
					{addressLine && (
						<div className="flex items-center gap-2 text-sm">
							<MapPin className="w-4 h-4 text-gray-400" />
							<span className="truncate">{addressLine}</span>
						</div>
					)}
				</CardContent>
			</Card>
		</Link>
	)
}
