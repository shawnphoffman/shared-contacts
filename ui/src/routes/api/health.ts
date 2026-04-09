import { createFileRoute } from '@tanstack/react-router'
import { logger } from '../../lib/logger'
import { proxyRequest } from '../../lib/sync-service'

export const Route = createFileRoute('/api/health')({
	server: {
		handlers: {
			GET: async () => {
				try {
					const { data, status } = await proxyRequest('/ready')
					if (status !== 200) {
						return Response.json({ status: 'not ready', syncService: data }, { status: 503 })
					}
					return Response.json({ status: 'ok', syncService: data })
				} catch (error: any) {
					logger.error({ err: error }, 'Health check failed')
					return Response.json({ status: 'error' }, { status: 503 })
				}
			},
		},
	},
})
