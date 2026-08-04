import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ContactAvatar } from '../ContactAvatar'
import type { Contact } from '../../lib/db'

export type PersonPick = { contact_id: string } | { new_placeholder: { name: string } }

interface PersonPickerProps {
	/** Node keys ("c:<id>") already present in this section, excluded from results. */
	excludeContactIds: Set<string>
	placeholder: string
	onPick: (pick: PersonPick) => void
	onCancel: () => void
}

async function fetchContacts(): Promise<Array<Contact>> {
	const response = await fetch('/api/contacts')
	if (!response.ok) throw new Error('Failed to fetch contacts')
	return response.json()
}

const MAX_RESULTS = 8

/**
 * Typeahead for one edge endpoint: an existing contact, or a placeholder
 * person created inline for people who aren't contacts (the "create
 * placeholder" row). Matches the locked mock's dropdown.
 */
export function PersonPicker({ excludeContactIds, placeholder, onPick, onCancel }: PersonPickerProps) {
	const [search, setSearch] = useState('')
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		inputRef.current?.focus()
	}, [])

	const { data: contacts } = useQuery({ queryKey: ['contacts'], queryFn: fetchContacts })

	const term = search.trim().toLowerCase()
	const matches = (contacts ?? [])
		.filter(contact => !excludeContactIds.has(contact.id))
		.filter(contact => {
			if (!term) return true
			const name = (contact.full_name || `${contact.first_name ?? ''} ${contact.last_name ?? ''}`).toLowerCase()
			return name.includes(term)
		})
		.slice(0, MAX_RESULTS)

	const canCreatePlaceholder = search.trim().length > 0

	return (
		<div className="rounded-sm border border-primary bg-background">
			<div className="flex items-center gap-2 px-2 py-1.5">
				<span className="text-primary">›</span>
				<input
					ref={inputRef}
					value={search}
					onChange={event => setSearch(event.target.value)}
					onKeyDown={event => {
						if (event.key === 'Escape') onCancel()
						if (event.key === 'Enter') {
							event.preventDefault()
							if (matches.length > 0) onPick({ contact_id: matches[0].id })
							else if (canCreatePlaceholder) onPick({ new_placeholder: { name: search.trim() } })
						}
					}}
					placeholder={placeholder}
					className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
				/>
			</div>
			<div className="border-t">
				{matches.map(contact => (
					<button
						key={contact.id}
						type="button"
						onClick={() => onPick({ contact_id: contact.id })}
						className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
					>
						<ContactAvatar contact={contact} className="h-5 w-5 text-[8px]" />
						<span className="truncate">{contact.full_name || 'Unnamed contact'}</span>
						<span className="ml-auto shrink-0 text-[10px] opacity-70">contact</span>
					</button>
				))}
				{matches.length === 0 && !canCreatePlaceholder && (
					<div className="px-2 py-1.5 text-xs text-muted-foreground">Type a name to search…</div>
				)}
				{canCreatePlaceholder && (
					<button
						type="button"
						onClick={() => onPick({ new_placeholder: { name: search.trim() } })}
						className="flex w-full items-center gap-2 border-t border-dashed px-2 py-1.5 text-left text-xs text-primary hover:bg-secondary"
					>
						+ create placeholder “{search.trim()}” (not a contact)
					</button>
				)}
			</div>
		</div>
	)
}
