import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { updateAddressBook } from '../../lib/db'

export const Route = createFileRoute('/api/address-books/$id')({
	server: {
		handlers: {
			PUT: async ({ request, params }) => {
				try {
					const body = await request.json()
					const updates: { name?: string; slug?: string; is_public?: boolean } = {}
					if (body.name !== undefined) {
						const name = String(body.name).trim()
						if (!name) {
							return json({ error: 'Name cannot be empty' }, { status: 400 })
						}
						updates.name = name
					}
					if (body.slug !== undefined) {
						const slug = String(body.slug).trim()
						if (!slug) {
							return json({ error: 'Slug cannot be empty' }, { status: 400 })
						}
						updates.slug = slug
					}
					if (body.is_public !== undefined) {
						updates.is_public = Boolean(body.is_public)
					}
					const updated = await updateAddressBook(params.id, updates)
					return json(updated)
				} catch (error) {
					console.error('Error updating address book:', error)
					return json({ error: 'Failed to update address book' }, { status: 500 })
				}
			},
		},
	},
})
