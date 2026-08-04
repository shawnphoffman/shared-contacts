import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ContactAvatar } from '../ContactAvatar'
import type { Contact } from '../../lib/db'
import type { PlaceholderPerson } from '../../lib/relationships'

export type PersonPick = { contact_id: string } | { placeholder_id: string } | { new_placeholder: { name: string } }

interface PersonPickerProps {
	/** Node keys ("c:<id>" / "p:<id>") already present in this section, excluded from results. */
	excludeKeys: Set<string>
	placeholder: string
	onPick: (pick: PersonPick) => void
	onCancel: () => void
}

async function fetchContacts(): Promise<Array<Contact>> {
	const response = await fetch('/api/contacts')
	if (!response.ok) throw new Error('Failed to fetch contacts')
	return response.json()
}

async function fetchPlaceholders(): Promise<Array<PlaceholderPerson>> {
	const response = await fetch('/api/relationship-placeholders')
	if (!response.ok) throw new Error('Failed to fetch placeholders')
	return response.json()
}

function placeholderYears(person: PlaceholderPerson): string | null {
	if (person.birth_year && person.death_year) return `${person.birth_year}-${person.death_year}`
	if (person.death_year) return `† ${person.death_year}`
	if (person.birth_year) return `b. ${person.birth_year}`
	return null
}

const MAX_RESULTS = 8

/**
 * Typeahead for one edge endpoint: an existing contact, an existing
 * placeholder person (so siblings can share one placeholder parent), or a
 * new placeholder created inline for people who aren't contacts.
 */
export function PersonPicker({ excludeKeys, placeholder, onPick, onCancel }: PersonPickerProps) {
	const [search, setSearch] = useState('')
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		inputRef.current?.focus()
	}, [])

	const { data: contacts } = useQuery({ queryKey: ['contacts'], queryFn: fetchContacts })
	const { data: placeholders } = useQuery({ queryKey: ['relationship-placeholders'], queryFn: fetchPlaceholders })

	const term = search.trim().toLowerCase()
	const contactMatches = (contacts ?? [])
		.filter(contact => !excludeKeys.has(`c:${contact.id}`))
		.filter(contact => {
			if (!term) return true
			const name = (contact.full_name || `${contact.first_name ?? ''} ${contact.last_name ?? ''}`).toLowerCase()
			return name.includes(term)
		})
		.slice(0, MAX_RESULTS)
	const placeholderMatches = (placeholders ?? [])
		.filter(person => !excludeKeys.has(`p:${person.id}`))
		.filter(person => !term || person.name.toLowerCase().includes(term))
		.slice(0, Math.max(2, MAX_RESULTS - contactMatches.length))

	const canCreatePlaceholder = search.trim().length > 0
	const firstPick = (): PersonPick | null => {
		if (contactMatches.length > 0) return { contact_id: contactMatches[0].id }
		if (placeholderMatches.length > 0) return { placeholder_id: placeholderMatches[0].id }
		if (canCreatePlaceholder) return { new_placeholder: { name: search.trim() } }
		return null
	}

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
							const pick = firstPick()
							if (pick) onPick(pick)
						}
					}}
					placeholder={placeholder}
					className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
				/>
			</div>
			<div className="border-t">
				{contactMatches.map(contact => (
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
				{placeholderMatches.map(person => (
					<button
						key={person.id}
						type="button"
						onClick={() => onPick({ placeholder_id: person.id })}
						className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
					>
						<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed text-[8px] font-medium">
							{person.name
								.split(' ')
								.filter(Boolean)
								.slice(0, 2)
								.map(part => part.charAt(0).toUpperCase())
								.join('') || '?'}
						</span>
						<span className="truncate">{person.name}</span>
						{placeholderYears(person) && <span className="shrink-0 text-[10px] opacity-70">{placeholderYears(person)}</span>}
						<span className="ml-auto shrink-0 rounded-sm border border-dashed px-1 text-[10px] opacity-80">placeholder</span>
					</button>
				))}
				{contactMatches.length === 0 && placeholderMatches.length === 0 && !canCreatePlaceholder && (
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
