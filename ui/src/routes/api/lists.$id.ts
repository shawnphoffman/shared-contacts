import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { deleteContact, getContactById, updateContact } from '../../lib/db'
import { renameGroupVCard } from '../../lib/contact-groups'
import { generateVCard } from '../../lib/vcard'
import { zodError } from '../../lib/contact-helpers'
import { RenameListSchema } from '../../lib/schemas'
import { actorFromRequest, recordHistory } from '../../lib/history'
import type { Contact } from '../../lib/db'

/**
 * Rename and delete for CardDAV group cards ("lists" in Apple Contacts).
 *
 * These live behind their own endpoints rather than the contact ones so a list
 * can never be reached by a request meant for a person, and vice versa: the
 * kind guard below is the whole point.
 */

async function loadList(id: string): Promise<{ list: Contact } | { error: Response }> {
	const list = await getContactById(id)
	if (!list) {
		return { error: json({ error: 'List not found' }, { status: 404 }) }
	}
	if (list.kind !== 'group') {
		return { error: json({ error: 'Not a list' }, { status: 400 }) }
	}
	return { list }
}

export const Route = createFileRoute('/api/lists/$id')({
	server: {
		handlers: {
			PUT: async ({ params, request }) => {
				try {
					const body = await request.json()
					const parsed = RenameListSchema.safeParse(body)
					if (!parsed.success) return zodError(parsed.error)

					const loaded = await loadList(params.id)
					if ('error' in loaded) return loaded.error
					const { list } = loaded

					const name = parsed.data.name.trim()
					const vcardData = list.vcard_data
						? renameGroupVCard(list.vcard_data, name)
						: generateVCard({ ...list, full_name: name, last_name: name, first_name: null })

					const updated = await updateContact(params.id, {
						full_name: name,
						// Apple stores a list name as "N:<name>;;;;", which the inbound
						// parser reads back as a last name. Mirror it so the round trip
						// through Radicale does not look like a second edit.
						last_name: name,
						first_name: null,
						middle_name: null,
						name_prefix: null,
						name_suffix: null,
						vcard_data: vcardData,
						// sync_source is deliberately left alone. The delete paths in the
						// sync service only honour a client-side delete while it still
						// reads 'radicale', so stamping 'api' here would rename the list
						// and make it undeletable from Apple Contacts in the same breath.
						// Clearing the outbound watermark is enough to push the rename to
						// every subscriber.
						last_synced_to_radicale_at: null,
					})

					const meta = actorFromRequest(request)
					await recordHistory({
						contactId: params.id,
						operation: 'update',
						source: meta.source,
						actor: meta.actor,
						actorType: meta.actorType,
						userAgent: meta.userAgent,
						clientIp: meta.clientIp,
						summary: `Renamed list ${list.full_name || 'Untitled list'} to ${name}`,
						previousState: list,
						newState: updated,
					})

					return json({ id: updated.id, name: updated.full_name })
				} catch (error) {
					logger.error({ err: error }, 'Error renaming list')
					return json({ error: 'Failed to rename list' }, { status: 500 })
				}
			},
			DELETE: async ({ params, request }) => {
				try {
					const loaded = await loadList(params.id)
					if ('error' in loaded) return loaded.error
					const { list } = loaded

					// Soft-delete only. Dropping the row out of the sync service's
					// outbound query is what makes the orphan sweep in db-to-radicale
					// remove the card from the master mirror and from every
					// subscriber's collection, which is what makes the list disappear
					// on their devices.
					await deleteContact(params.id)

					const meta = actorFromRequest(request)
					await recordHistory({
						contactId: params.id,
						operation: 'delete',
						source: meta.source,
						actor: meta.actor,
						actorType: meta.actorType,
						userAgent: meta.userAgent,
						clientIp: meta.clientIp,
						summary: `Deleted list ${list.full_name || 'Untitled list'}`,
						previousState: list,
					})

					return json({ message: 'List deleted' })
				} catch (error) {
					logger.error({ err: error }, 'Error deleting list')
					return json({ error: 'Failed to delete list' }, { status: 500 })
				}
			},
		},
	},
})
