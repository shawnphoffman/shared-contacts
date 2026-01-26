import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getUserAddressBookIds, getAddressBooks, getPool, tableExists } from '../../lib/db'

export const Route = createFileRoute('/api/user-book-assignments')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url)
					const username = url.searchParams.get('username')
					
					if (username) {
						// Get assignments for a specific user
						const bookIds = await getUserAddressBookIds(username)
						return json({ username, address_book_ids: bookIds })
					}
					
					// Get all assignments: map of username -> bookIds[]
					const books = await getAddressBooks()
					const allAssignments: Record<string, Array<string>> = {}
					
					// Get all base usernames from user_address_books table
					if (await tableExists('user_address_books')) {
						const pool = getPool()
						const result = await pool.query('SELECT DISTINCT username FROM user_address_books')
						const baseUsernames = result.rows.map(row => row.username)
						
						for (const baseUsername of baseUsernames) {
							const bookIds = await getUserAddressBookIds(baseUsername)
							if (bookIds.length > 0) {
								allAssignments[baseUsername] = bookIds
							}
						}
					}
					
					// Also include public books for all users (we'll handle this in the UI)
					return json({ assignments: allAssignments, public_book_ids: books.filter(b => b.is_public).map(b => b.id) })
				} catch (error) {
					console.error('Error fetching user-book assignments:', error)
					return json({ error: 'Failed to fetch assignments' }, { status: 500 })
				}
			},
		},
	},
})
