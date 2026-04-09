import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { createAddressBook, getAddressBooks, getAddressBooksWithReadonly } from '../../lib/db'
import { zodError } from '../../lib/contact-helpers'
import { CreateAddressBookSchema } from '../../lib/schemas'

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
					logger.error({ err: error }, 'Error fetching address books')
					return json({ error: 'Failed to fetch address books' }, { status: 500 })
				}
			},
			POST: async ({ request }) => {
				try {
					const body = await request.json()
					const parsed = CreateAddressBookSchema.safeParse(body)
					if (!parsed.success) return zodError(parsed.error)
					const { name, slug: parsedSlug, is_public: isPublic } = parsed.data
					const slug = parsedSlug || slugify(name)
					const created = await createAddressBook({ name, slug, is_public: isPublic })
					return json(created, { status: 201 })
				} catch (error) {
					logger.error({ err: error }, 'Error creating address book')
					return json({ error: 'Failed to create address book' }, { status: 500 })
				}
			},
		},
	},
})
