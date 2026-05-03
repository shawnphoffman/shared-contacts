import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { listHistory } from '../../lib/history'

export const Route = createFileRoute('/api/history')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url)
					const contactId = url.searchParams.get('contactId') || undefined
					const limit = url.searchParams.get('limit')
					const offset = url.searchParams.get('offset')
					const result = await listHistory({
						contactId,
						limit: limit ? parseInt(limit, 10) : undefined,
						offset: offset ? parseInt(offset, 10) : undefined,
					})
					return json(result)
				} catch (error) {
					logger.error({ err: error }, 'Failed to fetch history')
					return json({ error: 'Failed to fetch history' }, { status: 500 })
				}
			},
		},
	},
})
