import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { emptyTrash, getDeletedContacts, permanentlyDeleteContact, restoreContact } from '../../lib/db'

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

					if (action === 'restore' && id) {
						await restoreContact(id)
						return json({ message: 'Contact restored' })
					}

					if (action === 'permanent-delete' && id) {
						await permanentlyDeleteContact(id)
						return json({ message: 'Contact permanently deleted' })
					}

					if (action === 'empty') {
						const count = await emptyTrash()
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
