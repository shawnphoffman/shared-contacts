import { useEffect, useState } from 'react'
import { getContactPhotoUrl } from '../lib/image'
import { cn } from '../lib/utils'
import type { Contact } from '../lib/db'

interface ContactAvatarProps {
	contact: Pick<Contact, 'id' | 'full_name' | 'photo_hash' | 'photo_updated_at'>
	className?: string
}

export function ContactAvatar({ contact, className }: ContactAvatarProps) {
	const [showPhoto, setShowPhoto] = useState(true)
	const displayName = contact.full_name || 'Unnamed Contact'
	const initials = displayName
		.split(' ')
		.filter(Boolean)
		.slice(0, 2)
		.map(part => part.charAt(0).toUpperCase())
		.join('')

	useEffect(() => {
		setShowPhoto(true)
	}, [contact.id, contact.photo_hash, contact.photo_updated_at])

	return (
		<div className={cn('rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-500 shrink-0', className)}>
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
	)
}
