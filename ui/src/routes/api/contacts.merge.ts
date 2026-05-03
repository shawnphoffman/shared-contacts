import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { deleteContact, getContactById, getContactsByIds, setContactAddressBooks, updateContact } from '../../lib/db'
import { extractUID, generateVCard } from '../../lib/vcard'
import { mergeContacts } from '../../lib/merge'
import { sanitizeContact, zodError } from '../../lib/contact-helpers'
import { MergeContactsSchema } from '../../lib/schemas'
import { actorFromRequest, recordHistory, snapshotContact } from '../../lib/history'

export const Route = createFileRoute('/api/contacts/merge')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const body = await request.json()
					const parsed = MergeContactsSchema.safeParse(body)
					if (!parsed.success) return zodError(parsed.error)
					const { contactIds } = parsed.data

					// Fetch all contacts in a single query
					const contacts = await getContactsByIds(contactIds)
					if (contacts.length !== contactIds.length) {
						const foundIds = new Set(contacts.map(c => c.id))
						const missingId = contactIds.find(id => !foundIds.has(id))
						return json({ error: `Contact with id ${missingId} not found` }, { status: 404 })
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

					const primaryAfter = await getContactById(primaryContact.id)
					const meta = actorFromRequest(request)
					await recordHistory({
						contactId: primaryContact.id,
						operation: 'merge',
						source: 'merge',
						actor: meta.actor,
						actorType: meta.actorType,
						userAgent: meta.userAgent,
						clientIp: meta.clientIp,
						summary: `Merged ${contacts.length} contacts into ${primaryAfter?.full_name || primaryAfter?.email || 'contact'}`,
						previousState: primaryContact,
						newState: primaryAfter,
						relatedContactIds: deletedIds,
						metadata: {
							consumedContacts: sorted.slice(1).map(c => snapshotContact(c)),
							mergedBookIds: Array.from(mergedBookIds),
						},
					})

					return json({
						message: `Successfully merged ${contacts.length} contacts into ${primaryContact.full_name || primaryContact.email || 'contact'}`,
						primaryContactId: primaryContact.id,
						deletedContactIds: deletedIds,
						mergedContact: sanitizeContact(updatedContact),
					})
				} catch (error) {
					logger.error({ err: error }, 'Error merging contacts')
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
