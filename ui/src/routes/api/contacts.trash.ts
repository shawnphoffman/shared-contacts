import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { emptyTrash, getContactById, getDeletedContacts, permanentlyDeleteContact, restoreContact } from '../../lib/db'
import { actorFromRequest, recordHistory } from '../../lib/history'

export const Route = createFileRoute('/api/contacts/trash')({
	server: {
		handlers: {
			GET: async () => {
				try {
					const contacts = await getDeletedContacts()
					return json(contacts)
				} catch (error) {
					logger.error({ err: error }, 'Failed to fetch deleted contacts')
					return json({ error: 'Failed to fetch deleted contacts' }, { status: 500 })
				}
			},
			POST: async ({ request }) => {
				try {
					const body = await request.json()
					const { action, id } = body as { action: string; id?: string }
					const meta = actorFromRequest(request)

					if (action === 'restore' && id) {
						const before = await getContactById(id, true)
						await restoreContact(id)
						const after = await getContactById(id, true)
						await recordHistory({
							contactId: id,
							operation: 'restore',
							source: meta.source,
							actor: meta.actor,
							actorType: meta.actorType,
							userAgent: meta.userAgent,
							clientIp: meta.clientIp,
							summary: `Restored ${after?.full_name || after?.email || 'contact'}`,
							previousState: before,
							newState: after,
						})
						return json({ message: 'Contact restored' })
					}

					if (action === 'permanent-delete' && id) {
						const before = await getContactById(id, true)
						await permanentlyDeleteContact(id)
						await recordHistory({
							contactId: null,
							operation: 'permanent_delete',
							source: meta.source,
							actor: meta.actor,
							actorType: meta.actorType,
							userAgent: meta.userAgent,
							clientIp: meta.clientIp,
							summary: `Permanently deleted ${before?.full_name || before?.email || 'contact'}`,
							previousState: before,
							relatedContactIds: [id],
						})
						return json({ message: 'Contact permanently deleted' })
					}

					if (action === 'empty') {
						const count = await emptyTrash()
						await recordHistory({
							contactId: null,
							operation: 'permanent_delete',
							source: meta.source,
							actor: meta.actor,
							actorType: meta.actorType,
							userAgent: meta.userAgent,
							clientIp: meta.clientIp,
							summary: `Emptied trash (${count} contacts)`,
							metadata: { count },
						})
						return json({ message: `Permanently deleted ${count} contacts` })
					}

					return json({ error: 'Invalid action. Use restore, permanent-delete, or empty' }, { status: 400 })
				} catch (error) {
					logger.error({ err: error }, 'Failed to process trash action')
					return json({ error: 'Failed to process trash action' }, { status: 500 })
				}
			},
		},
	},
})
