import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getContactById, updateContact, deleteContact, type Contact } from '../../lib/db'
import { generateVCard, extractUID } from '../../lib/vcard'
import { mergeContacts } from '../../lib/merge'

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
					const contacts: Contact[] = []
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
					const primaryContact = sorted[0]!

					// Generate new vCard for merged contact
					const vcardData = generateVCard(mergedData)
					const vcardId = extractUID(vcardData) || primaryContact.vcard_id

					// Update primary contact with merged data
					const updatedContact = await updateContact(primaryContact.id, {
						...mergedData,
						vcard_id: vcardId,
						vcard_data: vcardData,
					})

					// Delete all other contacts
					const deletedIds: string[] = []
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
