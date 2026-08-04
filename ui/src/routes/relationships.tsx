import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { RelationshipPanel } from '../components/relationships/RelationshipPanel'
import { ContactAvatar } from '../components/ContactAvatar'
import { PageContainer } from '../components/ui/page-container'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import type { AddressBook, Contact } from '../lib/db'

export const Route = createFileRoute('/relationships')({
	component: RelationshipsPage,
})

async function fetchContacts(): Promise<Array<Contact>> {
	const response = await fetch('/api/contacts')
	if (!response.ok) throw new Error('Failed to fetch contacts')
	return response.json()
}

async function fetchAddressBooks(): Promise<Array<AddressBook>> {
	const response = await fetch('/api/address-books')
	if (!response.ok) throw new Error('Failed to fetch address books')
	return response.json()
}

const ALL_BOOKS = 'all'

function contactName(contact: Contact): string {
	return contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unnamed contact'
}

/**
 * Book-level tri-pane: roster of everyone in the selected book on the left,
 * and the shared relationship editor + tree beside it. Clicking a person (in
 * the roster or in the tree) refocuses the panel - the graph itself is
 * global, the book only filters who is listed.
 */
function RelationshipsPage() {
	const [bookId, setBookId] = useState<string>(ALL_BOOKS)
	const [search, setSearch] = useState('')
	const [selectedId, setSelectedId] = useState<string | null>(null)

	const { data: books } = useQuery({ queryKey: ['address-books'], queryFn: fetchAddressBooks })
	const { data: contacts, isLoading } = useQuery({ queryKey: ['contacts'], queryFn: fetchContacts })

	const roster = useMemo(() => {
		const term = search.trim().toLowerCase()
		return (contacts ?? [])
			.filter(contact => bookId === ALL_BOOKS || (contact.address_books ?? []).some(book => book.id === bookId))
			.filter(contact => !term || contactName(contact).toLowerCase().includes(term))
			.sort((a, b) => contactName(a).localeCompare(contactName(b)))
	}, [contacts, bookId, search])

	const selected = roster.find(contact => contact.id === selectedId) ?? (contacts ?? []).find(contact => contact.id === selectedId) ?? null

	return (
		<PageContainer width="wide">
			<div className="mb-6 flex flex-wrap items-center gap-3">
				<h1 className="text-lg font-semibold">Relationships</h1>
				<p className="text-sm text-muted-foreground">one shared graph · every tree is a projection</p>
			</div>

			<div className="flex flex-col items-start gap-6 lg:flex-row">
				{/* Roster */}
				<aside className="w-full shrink-0 overflow-hidden rounded-sm border bg-card lg:w-60">
					<div className="space-y-2 border-b p-3">
						<Select value={bookId} onValueChange={setBookId}>
							<SelectTrigger className="h-8 w-full text-xs">
								<SelectValue placeholder="Select a book" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_BOOKS}>All contacts</SelectItem>
								{(books ?? []).map(book => (
									<SelectItem key={book.id} value={book.id}>
										{book.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Input value={search} onChange={event => setSearch(event.target.value)} placeholder="filter people…" className="h-8 text-xs" />
					</div>
					<ul className="max-h-[520px] overflow-y-auto p-1.5">
						{isLoading && <li className="px-2 py-4 text-center text-xs text-muted-foreground">Loading contacts…</li>}
						{!isLoading && roster.length === 0 && (
							<li className="px-2 py-4 text-center text-xs text-muted-foreground">No contacts in this book.</li>
						)}
						{roster.map(contact => (
							<li key={contact.id}>
								<button
									type="button"
									onClick={() => setSelectedId(contact.id)}
									data-active={contact.id === selectedId}
									className="flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 text-left text-xs text-sidebar-foreground transition-colors hover:bg-accent hover:text-accent-foreground data-[active=true]:border-primary data-[active=true]:bg-secondary data-[active=true]:text-foreground"
								>
									<ContactAvatar contact={contact} className="h-6 w-6 text-[9px]" />
									<span className="truncate">{contactName(contact)}</span>
								</button>
							</li>
						))}
					</ul>
					<div className="border-t border-dashed px-3 py-2 text-[10px] leading-snug text-muted-foreground">
						click a person to load their tree · placeholder people appear only in trees
					</div>
				</aside>

				{/* Panel */}
				<div className="min-w-0 flex-1">
					{selected ? (
						<RelationshipPanel contactId={selected.id} focusName={contactName(selected)} onFocusContact={setSelectedId} />
					) : (
						<div className="flex h-[520px] items-center justify-center rounded-sm border bg-card p-8 text-center text-sm text-muted-foreground">
							Select a person to view and build their relationship tree.
						</div>
					)}
				</div>
			</div>
		</PageContainer>
	)
}
