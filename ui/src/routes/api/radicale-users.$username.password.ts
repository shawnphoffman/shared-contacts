import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { proxyRequest } from '../../lib/sync-service'

export const Route = createFileRoute('/api/radicale-users/$username/password')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const { username } = params
					const { data, status } = await proxyRequest(`/api/radicale-users/${encodeURIComponent(username)}/password`)
					return json(data, { status })
				} catch (error: any) {
					logger.error({ err: error }, 'Error fetching user password')
					return json({ error: 'Failed to fetch password' }, { status: 500 })
				}
			},
		},
	},
})
