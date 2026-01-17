import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { proxyRequest } from '../../lib/sync-service'

export const Route = createFileRoute('/api/health')({
	server: {
		handlers: {
			GET: async () => {
				try {
					const { data, status } = await proxyRequest('/ready')
					if (status !== 200) {
						return json({ status: 'not ready', syncService: data }, { status: 503 })
					}
					return json({ status: 'ok', syncService: data })
				} catch (error: any) {
					console.error('Health check failed:', error)
					return json({ status: 'error' }, { status: 503 })
				}
			},
		},
	},
})
