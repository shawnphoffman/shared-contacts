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

		// Inbound first. The outbound pass decides conflicts by comparing the row
		// against the *master mirror*, which is stale for a card a client has
		// edited but nothing has ingested yet — precisely the case this tick was
		// extended to cover. Running outbound first would overwrite that edit from
		// the stale mirror before inbound ever read it.
		//
		// The tick used to run outbound only, so inbound reconciliation happened
		// at startup and on file-watcher events alone: a chokidar event that never
		// arrived — a dropped event, or a collection created after boot and
		// therefore never watched — stranded that client's edit until someone
		// restarted the service.
		//
		// The directions are guarded separately so a failure in one doesn't stop
		// the other for the rest of the outage. One caveat comes with that: when
		// inbound defers to the database it stamps last_synced_from_radicale_at,
		// which switches off its own conflict guard next time round, so the
		// outbound half is what makes that resolution stick by writing the winning
		// version to disk. While outbound is failing, a database-side edit that
		// keeps conflicting will eventually lose to the file.
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
