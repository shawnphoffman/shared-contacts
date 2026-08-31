import { logger } from '../logger'
import { SYNC_INTERVAL } from './constants'
import { syncDbToRadicale } from './db-to-radicale'
import { syncRadicaleToDb } from './radicale-to-db'
import { refreshRadicaleWatchers } from './watcher'

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

		// Pick up collections that appeared since the last tick. Watching used to
		// be a one-shot at boot, so a book or CardDAV account created later was
		// never watched and edits made there were invisible until a restart.
		try {
			const added = await refreshRadicaleWatchers()
			if (added > 0) {
				logger.info({ added }, 'Started watching new Radicale collections')
			}
		} catch (error) {
			logger.error({ err: error }, 'Could not refresh Radicale watchers')
		}

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
