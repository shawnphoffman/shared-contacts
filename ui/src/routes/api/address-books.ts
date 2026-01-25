import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { createAddressBook, getAddressBooks, getAddressBooksWithReadonly } from '../../lib/db'

function slugify(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

export const Route = createFileRoute('/api/address-books')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url)
					const withReadonly = url.searchParams.get('readonly') === '1'
					const books = withReadonly ? await getAddressBooksWithReadonly() : await getAddressBooks()
					return json(books)
				} catch (error) {
					console.error('Error fetching address books:', error)
					return json({ error: 'Failed to fetch address books' }, { status: 500 })
				}
			},
			POST: async ({ request }) => {
				try {
					const body = await request.json()
					const name = String(body.name || '').trim()
					if (!name) {
						return json({ error: 'Name is required' }, { status: 400 })
					}
					const slug = String(body.slug || slugify(name))
					const isPublic = body.is_public !== undefined ? Boolean(body.is_public) : true
					const created = await createAddressBook({ name, slug, is_public: isPublic })
					return json(created, { status: 201 })
				} catch (error) {
					console.error('Error creating address book:', error)
					return json({ error: 'Failed to create address book' }, { status: 500 })
				}
			},
		},
	},
})
