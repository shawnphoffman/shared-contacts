import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { proxyRequest } from '../../lib/sync-service'

export const Route = createFileRoute('/api/radicale-users/$username/backfill')({
	server: {
		handlers: {
			POST: async ({ params }) => {
				console.log('backfilling user', params)
				try {
					const { username } = params
					const { data, status } = await proxyRequest(`/api/radicale-users/backfill/${encodeURIComponent(username)}`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
					})
					return json(data, { status })
				} catch (error: any) {
					console.error('Error backfilling Radicale user:', error)
					return json({ error: 'Failed to backfill shared contacts' }, { status: 500 })
				}
			},
		},
	},
})
