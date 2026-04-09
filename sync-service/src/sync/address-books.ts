import { AddressBook, getAddressBooks, getDefaultAddressBook } from '../db'

export function getFallbackAddressBook(): AddressBook {
	const now = new Date(0)
	return {
		id: '00000000-0000-0000-0000-000000000000',
		name: 'Shared Contacts',
		slug: 'shared-contacts',
		is_public: true,
		created_at: now,
		updated_at: now,
	}
}

export async function getAddressBooksForSync(): Promise<{
	books: Array<AddressBook>
	defaultBook: AddressBook
	hasAddressBooks: boolean
}> {
	const books = await getAddressBooks()
	if (books.length === 0) {
		const fallback = getFallbackAddressBook()
		return { books: [fallback], defaultBook: fallback, hasAddressBooks: false }
	}
	const defaultBook = (await getDefaultAddressBook()) || books[0]
	return { books, defaultBook, hasAddressBooks: true }
}
