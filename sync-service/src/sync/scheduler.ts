import { logger } from '../logger'
import { SYNC_INTERVAL } from './constants'
import { syncDbToRadicale } from './db-to-radicale'
import { syncRadicaleToDb } from './radicale-to-db'

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

		// Inbound first, the same order the startup pass uses. This tick used to
		// run outbound only, which left inbound reconciliation to startup and to
		// the file watcher alone: a chokidar event that never arrived — a dropped
		// event, a collection created after boot and so never watched — stranded
		// that client's edit until someone restarted the service.
		//
		// The two directions are guarded separately so a failing inbound pass
		// (say a transient DB error mid-sweep) doesn't also stop cards being
		// written out for the rest of the outage.
		try {
			await syncRadicaleToDb(true)
		} catch (error) {
			logger.error({ err: error }, 'Periodic Radicale → DB sync error')
		}

		try {
			await syncDbToRadicale()
		} catch (error) {
			logger.error({ err: error }, 'Periodic DB → Radicale sync error')
		} finally {
			isSyncing = false
		}
	}, SYNC_INTERVAL)
}
