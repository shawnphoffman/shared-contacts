import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getContactAddressBookIds, setContactAddressBooks } from '../../lib/db'

export const Route = createFileRoute('/api/contacts/bulk-books')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const body = await request.json()
					const contactIds = Array.isArray(body.contact_ids) ? body.contact_ids.map(String) : []
					const addToBookIds = Array.isArray(body.add_to_book_ids) ? body.add_to_book_ids.map(String) : []
					const removeFromBookIds = Array.isArray(body.remove_from_book_ids) ? body.remove_from_book_ids.map(String) : []

					if (contactIds.length === 0) {
						return json({ error: 'contact_ids is required and must be a non-empty array' }, { status: 400 })
					}
					if (addToBookIds.length === 0 && removeFromBookIds.length === 0) {
						return json({ error: 'Provide at least one of add_to_book_ids or remove_from_book_ids' }, { status: 400 })
					}

					for (const contactId of contactIds) {
						const current = new Set(await getContactAddressBookIds(contactId))
						for (const id of addToBookIds) current.add(id)
						for (const id of removeFromBookIds) current.delete(id)
						await setContactAddressBooks(contactId, Array.from(current))
					}

					return json({ updated: contactIds.length })
				} catch (error) {
					console.error('Error updating contact address books:', error)
					return json({ error: 'Failed to update contact address books' }, { status: 500 })
				}
			},
		},
	},
})
