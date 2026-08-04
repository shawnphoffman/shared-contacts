import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { getEgoGraph, relationshipsEnabled } from '../../lib/relationships'

export const Route = createFileRoute('/api/contacts/$id/relationships')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					if (!(await relationshipsEnabled())) {
						return json({ error: 'Relationships are not available (migration pending)' }, { status: 503 })
					}
					const graph = await getEgoGraph(params.id)
					if (!graph) return json({ error: 'Contact not found' }, { status: 404 })
					return json(graph)
				} catch (error) {
					logger.error({ err: error, contactId: params.id }, 'Error fetching relationship graph')
					return json({ error: 'Failed to fetch relationship graph' }, { status: 500 })
				}
			},
		},
	},
})
