import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { getContactAddressBookIds, setContactAddressBooks } from '../../lib/db'
import { zodError } from '../../lib/contact-helpers'
import { BulkBooksSchema } from '../../lib/schemas'

export const Route = createFileRoute('/api/contacts/bulk-books')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const body = await request.json()
					const parsed = BulkBooksSchema.safeParse(body)
					if (!parsed.success) return zodError(parsed.error)
					const { contact_ids: contactIds, add_to_book_ids: addToBookIds, remove_from_book_ids: removeFromBookIds } = parsed.data

					for (const contactId of contactIds) {
						const current = new Set(await getContactAddressBookIds(contactId))
						for (const id of addToBookIds) current.add(id)
						for (const id of removeFromBookIds) current.delete(id)
						await setContactAddressBooks(contactId, Array.from(current))
					}

					return json({ updated: contactIds.length })
				} catch (error) {
					logger.error({ err: error }, 'Error updating contact address books')
					return json({ error: 'Failed to update contact address books' }, { status: 500 })
				}
			},
		},
	},
})
