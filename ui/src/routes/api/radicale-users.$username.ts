import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { proxyRequest } from '../../lib/sync-service'

export const Route = createFileRoute('/api/radicale-users/$username')({
	server: {
		handlers: {
			PUT: async ({ request, params }) => {
				try {
					const { username } = params
					const body = await request.json()
					const { data, status } = await proxyRequest(`/api/radicale-users/${encodeURIComponent(username)}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(body),
					})
					return json(data, { status })
				} catch (error: any) {
					logger.error({ err: error }, 'Error updating Radicale user')
					return json({ error: 'Failed to update user' }, { status: 500 })
				}
			},
			DELETE: async ({ params }) => {
				try {
					const { username } = params
					const { data, status } = await proxyRequest(`/api/radicale-users/${encodeURIComponent(username)}`, { method: 'DELETE' })
					return json(data, { status })
				} catch (error: any) {
					logger.error({ err: error }, 'Error deleting Radicale user')
					return json({ error: 'Failed to delete user' }, { status: 500 })
				}
			},
		},
	},
})
