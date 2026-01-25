import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
	getAddressBook,
	getAddressBookReadonly,
	setAddressBookReadonly,
	updateAddressBook,
} from '../../lib/db'

const READONLY_USERNAME_PREFIX = 'ro-'

export const Route = createFileRoute('/api/address-books/$id')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const book = await getAddressBook(params.id)
					if (!book) {
						return json({ error: 'Address book not found' }, { status: 404 })
					}
					const readonlyRow = await getAddressBookReadonly(params.id)
					return json({
						...book,
						readonly_enabled: !!readonlyRow,
						readonly_username: readonlyRow ? `${READONLY_USERNAME_PREFIX}${params.id}` : undefined,
					})
				} catch (error) {
					console.error('Error fetching address book:', error)
					return json({ error: 'Failed to fetch address book' }, { status: 500 })
				}
			},
			PUT: async ({ request, params }) => {
				try {
					const body = await request.json()
					// Only name and is_public are updatable; slug is not (paths use stable id).
					const updates: { name?: string; is_public?: boolean } = {}
					if (body.name !== undefined) {
						const name = String(body.name).trim()
						if (!name) {
							return json({ error: 'Name cannot be empty' }, { status: 400 })
						}
						updates.name = name
					}
					if (body.is_public !== undefined) {
						updates.is_public = Boolean(body.is_public)
					}
					if (Object.keys(updates).length > 0) {
						await updateAddressBook(params.id, updates)
					}
					// Read-only subscription: 0 or 1 per book, toggle + password
					if (body.readonly_enabled !== undefined) {
						if (body.readonly_enabled) {
							const password = body.readonly_password != null ? String(body.readonly_password).trim() : ''
							const hash =
								password !== ''
									? await bcrypt.hash(password, 10)
									: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10)
							await setAddressBookReadonly(params.id, hash)
						} else {
							await setAddressBookReadonly(params.id, null)
						}
					} else if (body.readonly_password !== undefined && body.readonly_password !== '') {
						// Change password only (read-only already enabled)
						const readonlyRow = await getAddressBookReadonly(params.id)
						if (readonlyRow) {
							const hash = await bcrypt.hash(String(body.readonly_password), 10)
							await setAddressBookReadonly(params.id, hash)
						}
					}
					const updated = await getAddressBook(params.id)
					if (!updated) {
						return json({ error: 'Address book not found' }, { status: 404 })
					}
					const readonlyRow = await getAddressBookReadonly(params.id)
					return json({
						...updated,
						readonly_enabled: !!readonlyRow,
						readonly_username: readonlyRow ? `${READONLY_USERNAME_PREFIX}${params.id}` : undefined,
					})
				} catch (error) {
					console.error('Error updating address book:', error)
					return json({ error: 'Failed to update address book' }, { status: 500 })
				}
			},
		},
	},
})
