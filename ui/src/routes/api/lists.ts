import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { getContactLists } from '../../lib/contact-groups'

export const Route = createFileRoute('/api/lists')({
	server: {
		handlers: {
			GET: async () => {
				try {
					return json(await getContactLists())
				} catch (error) {
					logger.error({ err: error }, 'Error fetching contact lists')
					return json({ error: 'Failed to fetch lists' }, { status: 500 })
				}
			},
		},
	},
})
