import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { proxyRequest } from '../../lib/sync-service'

export const Route = createFileRoute('/api/radicale-users')({
	server: {
		handlers: {
			GET: async () => {
				try {
					const { data, status } = await proxyRequest('/api/radicale-users')
					return json(data, { status })
				} catch (error: any) {
					logger.error({ err: error }, 'Error fetching Radicale users')
					return json({ error: 'Failed to fetch users' }, { status: 500 })
				}
			},
			POST: async ({ request }) => {
				try {
					const body = await request.json()
					const { data, status } = await proxyRequest('/api/radicale-users', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(body),
					})
					return json(data, { status })
				} catch (error: any) {
					logger.error({ err: error }, 'Error creating Radicale user')
					return json({ error: 'Failed to create user' }, { status: 500 })
				}
			},
		},
	},
})
