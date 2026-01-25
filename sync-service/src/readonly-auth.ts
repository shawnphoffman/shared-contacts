import { deleteUser, getUsers, setUserHash } from './htpasswd'
import { getAllAddressBookReadonly } from './db'

const READONLY_USERNAME_PREFIX = 'ro-'

/**
 * Sync address_book_readonly table to htpasswd.
 * Ensures each row has a user ro-{address_book_id} with the stored hash;
 * removes any ro-* users whose book is no longer in the table.
 */
export async function syncReadonlyUsersToHtpasswd(): Promise<void> {
	const rows = await getAllAddressBookReadonly()
	const allowedBookIds = new Set(rows.map(r => r.address_book_id))

	for (const row of rows) {
		const username = `${READONLY_USERNAME_PREFIX}${row.address_book_id}`
		await setUserHash(username, row.password_hash)
	}

	const users = await getUsers()
	for (const user of users) {
		if (!user.username.startsWith(READONLY_USERNAME_PREFIX)) continue
		const addressBookId = user.username.slice(READONLY_USERNAME_PREFIX.length)
		if (!allowedBookIds.has(addressBookId)) {
			try {
				await deleteUser(user.username)
			} catch (err) {
				// User might have been removed already
				console.warn(`Could not remove read-only user ${user.username}:`, err)
			}
		}
	}
}
