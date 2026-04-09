import { logger } from '../logger'
import { SYNC_INTERVAL } from './constants'
import { syncDbToRadicale } from './db-to-radicale'

/**
 * Start periodic sync
 */
let isSyncing = false

export function startPeriodicSync(): void {
	logger.info({ intervalMs: SYNC_INTERVAL }, 'Starting periodic sync')

	setInterval(async () => {
		if (isSyncing) {
			logger.info('Sync already in progress, skipping periodic sync')
			return
		}
		isSyncing = true
		try {
			await syncDbToRadicale()
		} catch (error) {
			logger.error({ err: error }, 'Periodic sync error')
		} finally {
			isSyncing = false
		}
	}, SYNC_INTERVAL)
}
