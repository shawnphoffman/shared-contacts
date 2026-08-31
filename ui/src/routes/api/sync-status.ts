import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { proxyRequest } from '../../lib/sync-service'
import { getSyncActivity } from '../../lib/db'

/**
 * What the sync is doing, for the indicator in the sidebar.
 *
 * /api/health answers the container healthcheck and says only up or down;
 * nothing told a person whether their edits were actually reaching their
 * devices. A stalled sync service looked exactly like a quiet one.
 */
export const Route = createFileRoute('/api/sync-status')({
	server: {
		handlers: {
			GET: async () => {
				// The sync service being unreachable is a status to report, not a
				// failure to fetch the status, so the two halves are gathered
				// independently.
				const [service, activity] = await Promise.allSettled([proxyRequest('/ready', { timeoutMs: 5_000 }), getSyncActivity()])

				const reachable = service.status === 'fulfilled' && service.value.status === 200
				if (service.status === 'rejected') {
					logger.warn({ err: service.reason }, 'Sync service did not answer the status check')
				}

				if (activity.status === 'rejected') {
					logger.error({ err: activity.reason }, 'Could not read sync activity')
					return json({ syncService: reachable ? 'ready' : 'unreachable', activity: null }, { status: 200 })
				}

				return json({
					syncService: reachable ? 'ready' : service.status === 'fulfilled' ? 'not ready' : 'unreachable',
					activity: activity.value,
				})
			},
		},
	},
})
