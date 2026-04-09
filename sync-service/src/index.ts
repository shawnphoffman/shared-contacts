import 'dotenv/config'
import { closePool } from './db'
import { syncDbToRadicale, syncRadicaleToDb, startWatchingRadicale, startPeriodicSync } from './sync'
import { startApiServer, setMigrationsComplete, setStartupError } from './api'
import { runMigrations } from './migrations'
import { runPathMigrationIfNeeded } from './path-migration'
import { runCompositeUsersMigrationIfNeeded } from './composite-users-migration'
import { ensureAllCompositeUsersExist } from './htpasswd'
import { syncReadonlyUsersToHtpasswd } from './readonly-auth'
import { logger } from './logger'

function setupSignalHandlers() {
	const handleShutdown = async (signal: 'SIGTERM' | 'SIGINT') => {
		logger.info({ signal }, 'Received signal, shutting down gracefully...')
		try {
			await closePool()
		} catch (err) {
			logger.error({ err }, 'Error while closing database pool during shutdown')
		}
		process.exit(0)
	}

	process.on('SIGTERM', () => {
		void handleShutdown('SIGTERM')
	})

	process.on('SIGINT', () => {
		void handleShutdown('SIGINT')
	})
}

async function main() {
	logger.info('Starting Shared Contacts Sync Service...')
	logger.info({ radicaleStoragePath: '/data/collections' }, 'RADICALE_STORAGE_PATH')
	logger.info({ syncInterval: process.env.SYNC_INTERVAL || '30000' }, 'SYNC_INTERVAL')

	// Always register signal handlers so we can shut down gracefully,
	// even if startup throws before migrations complete.
	setupSignalHandlers()

	try {
		// Start API server first (so health checks work)
		startApiServer()

		// Run database migrations to ensure schema is up to date
		await runMigrations()

		// One-time path migration: rename collection-root/{slug} -> collection-root/{id}
		await runPathMigrationIfNeeded()

		// One-time composite users migration: create username-bookid users for existing assignments
		await runCompositeUsersMigrationIfNeeded()

		// Ensure all composite users exist for current assignments (catches any missing ones)
		await ensureAllCompositeUsersExist()

		// Sync read-only subscription users from DB to htpasswd
		await syncReadonlyUsersToHtpasswd()

		// Mark migrations as complete (enables /ready endpoint)
		setMigrationsComplete()

		// Initial sync: Radicale → DB (in case there are existing contacts)
		logger.info('Performing initial sync...')
		await syncRadicaleToDb()

		// Initial sync: DB → Radicale (to ensure consistency)
		await syncDbToRadicale()

		// Start watching Radicale for changes
		await startWatchingRadicale()

		// Start periodic sync from DB to Radicale
		startPeriodicSync()

		// Periodically sync read-only users to htpasswd (in case UI enabled/disabled or changed password)
		const readonlyAuthInterval = parseInt(process.env.READONLY_AUTH_SYNC_INTERVAL || '30000', 10)
		let isReadonlyAuthSyncing = false
		setInterval(async () => {
			if (isReadonlyAuthSyncing) {
				return
			}
			isReadonlyAuthSyncing = true
			try {
				await syncReadonlyUsersToHtpasswd()
			} catch (err) {
				logger.error({ err }, 'Read-only auth sync error')
			} finally {
				isReadonlyAuthSyncing = false
			}
		}, readonlyAuthInterval)

		logger.info('Sync service started successfully')
	} catch (error) {
		logger.error({ err: error }, 'Fatal error during sync service startup')
		// Record the startup error so /ready can report it, but keep the process alive
		setStartupError(error)
		try {
			await closePool()
		} catch (closeError) {
			logger.error({ err: closeError }, 'Error while closing database pool after startup failure')
		}
	}
}

main()
