import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getAddressBooks, getUserAddressBookIds, setUserAddressBooks } from '../../lib/db'

export const Route = createFileRoute('/api/address-books/memberships')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url)
					const username = url.searchParams.get('username')
					if (!username) {
						return json({ error: 'username is required' }, { status: 400 })
					}
					const ids = await getUserAddressBookIds(username)
					return json({ username, address_book_ids: ids })
				} catch (error) {
					console.error('Error fetching address book memberships:', error)
					return json({ error: 'Failed to fetch memberships' }, { status: 500 })
				}
			},
			PUT: async ({ request }) => {
				try {
					const body = await request.json()
					const username = String(body.username || '').trim()
					if (!username) {
						return json({ error: 'username is required' }, { status: 400 })
					}
					const addressBookIds = Array.isArray(body.address_book_ids) ? body.address_book_ids.map(String) : []
					const books = await getAddressBooks()
					const privateBookIds = new Set(books.filter(book => !book.is_public).map(book => book.id))
					const filteredIds = addressBookIds.filter(id => privateBookIds.has(id))
					await setUserAddressBooks(username, filteredIds)
					return json({ username, address_book_ids: filteredIds })
				} catch (error) {
					console.error('Error updating address book memberships:', error)
					return json({ error: 'Failed to update memberships' }, { status: 500 })
				}
			},
		},
	},
})
