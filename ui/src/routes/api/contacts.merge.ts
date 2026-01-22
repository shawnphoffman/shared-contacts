import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { deleteContact, getContactById, setContactAddressBooks, updateContact } from '../../lib/db'
import { extractUID, generateVCard } from '../../lib/vcard'
import { mergeContacts } from '../../lib/merge'
import type { Contact } from '../../lib/db'

function sanitizeContact(contact: Contact): Omit<Contact, 'photo_blob'> {
	const { photo_blob, ...rest } = contact
	return rest
}

export const Route = createFileRoute('/api/contacts/merge')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const body = await request.json()
					const { contactIds } = body

					// Validate input
					if (!Array.isArray(contactIds)) {
						return json({ error: 'contactIds must be an array' }, { status: 400 })
					}

					if (contactIds.length < 2) {
						return json({ error: 'At least 2 contacts are required to merge' }, { status: 400 })
					}

					// Fetch all contacts
					const contacts: Array<Contact> = []
					for (const id of contactIds) {
						const contact = await getContactById(id)
						if (!contact) {
							return json({ error: `Contact with id ${id} not found` }, { status: 404 })
						}
						contacts.push(contact)
					}

					// Merge contacts (this will sort by created_at and identify primary)
					const mergedData = mergeContacts(contacts)

					// Primary contact is the oldest (first in sorted array)
					const sorted = [...contacts].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
					const primaryContact = sorted[0]

					// Generate new vCard for merged contact
					const vcardData = generateVCard(mergedData)
					const vcardId = extractUID(vcardData) || primaryContact.vcard_id

					// Update primary contact with merged data
					const updatedContact = await updateContact(primaryContact.id, {
						...mergedData,
						vcard_id: vcardId,
						vcard_data: vcardData,
					})

					const mergedBookIds = new Set<string>()
					for (const contact of contacts) {
						contact.address_books?.forEach(book => mergedBookIds.add(book.id))
					}
					if (mergedBookIds.size > 0) {
						await setContactAddressBooks(primaryContact.id, Array.from(mergedBookIds))
					}

					// Delete all other contacts
					const deletedIds: Array<string> = []
					for (const contact of sorted.slice(1)) {
						await deleteContact(contact.id)
						deletedIds.push(contact.id)
					}

					return json({
						message: `Successfully merged ${contacts.length} contacts into ${primaryContact.full_name || primaryContact.email || 'contact'}`,
						primaryContactId: primaryContact.id,
						deletedContactIds: deletedIds,
						mergedContact: sanitizeContact(updatedContact),
					})
				} catch (error) {
					console.error('Error merging contacts:', error)
					return json(
						{
							error: 'Failed to merge contacts',
							details: error instanceof Error ? error.message : 'Unknown error',
						},
						{ status: 500 }
					)
				}
			},
		},
	},
})
