import 'dotenv/config'
import { closePool, waitForDatabase } from './db'
import { syncDbToRadicale, syncRadicaleToDb, startWatchingRadicale, startPeriodicSync } from './sync'
import { startApiServer, setMigrationsComplete, setStartupError } from './api'
import { runMigrations } from './migrations'
import { runPathMigrationIfNeeded } from './path-migration'
import { runCompositeUsersMigrationIfNeeded } from './composite-users-migration'
import { ensureAllCompositeUsersExist } from './htpasswd'
import { syncReadonlyUsersToHtpasswd } from './readonly-auth'
import { retry, isTransientDbError } from './retry'
import { logger } from './logger'

let shuttingDown = false

async function shutdown(code: number): Promise<void> {
	if (shuttingDown) return
	shuttingDown = true
	try {
		await closePool()
	} catch (err) {
		logger.error({ err }, 'Error while closing database pool during shutdown')
	}
	process.exit(code)
}

function setupProcessHandlers() {
	process.on('SIGTERM', () => {
		logger.info({ signal: 'SIGTERM' }, 'Received signal, shutting down gracefully...')
		void shutdown(0)
	})

	process.on('SIGINT', () => {
		logger.info({ signal: 'SIGINT' }, 'Received signal, shutting down gracefully...')
		void shutdown(0)
	})

	// Transient DB errors during normal operation are caught at the call site
	// and never reach here. If something does, it's almost certainly a
	// programming error — log and exit so the entrypoint tears the container
	// down and Docker's restart policy brings us back clean.
	process.on('uncaughtException', err => {
		logger.fatal({ err }, 'Uncaught exception, exiting')
		void shutdown(1)
	})

	process.on('unhandledRejection', reason => {
		logger.fatal({ err: reason }, 'Unhandled promise rejection, exiting')
		void shutdown(1)
	})
}

function startReadonlyAuthSync() {
	const readonlyAuthInterval = parseInt(process.env.READONLY_AUTH_SYNC_INTERVAL || '30000', 10)
	let isReadonlyAuthSyncing = false
	setInterval(async () => {
		if (isReadonlyAuthSyncing) return
		isReadonlyAuthSyncing = true
		try {
			await syncReadonlyUsersToHtpasswd()
		} catch (err) {
			logger.error({ err }, 'Read-only auth sync error — will retry on next tick')
		} finally {
			isReadonlyAuthSyncing = false
		}
	}, readonlyAuthInterval)
}

async function main() {
	logger.info('Starting Shared Contacts Sync Service...')
	logger.info({ radicaleStoragePath: '/data/collections' }, 'RADICALE_STORAGE_PATH')
	logger.info({ syncInterval: process.env.SYNC_INTERVAL || '30000' }, 'SYNC_INTERVAL')

	setupProcessHandlers()

	// Start the API server first so /health and /ready respond even while the
	// database is still coming up. /ready reports 503 until startup finishes.
	startApiServer()

	try {
		// Wait for Postgres to accept a connection. Retries forever on
		// transient errors, so a slow or briefly-unavailable DB doesn't kill us.
		await waitForDatabase()

		// Migrations + one-shot bootstrap. Individual migrations are
		// idempotent, so re-running after a mid-flight DB blip is safe.
		await retry(
			async () => {
				await runMigrations()
				await runPathMigrationIfNeeded()
				await runCompositeUsersMigrationIfNeeded()
				await ensureAllCompositeUsersExist()
				await syncReadonlyUsersToHtpasswd()
			},
			{
				label: 'startup bootstrap',
				initialDelayMs: 1000,
				maxDelayMs: 30_000,
				isRetryable: isTransientDbError,
			}
		)

		setMigrationsComplete()

		// Initial syncs — if the DB drops mid-sync we retry the whole pass.
		// Non-transient failures (e.g. a bug in the sync code) surface.
		logger.info('Performing initial sync...')
		await retry(() => syncRadicaleToDb(), {
			label: 'initial Radicale→DB sync',
			initialDelayMs: 1000,
			maxDelayMs: 30_000,
			isRetryable: isTransientDbError,
		})
		await retry(() => syncDbToRadicale(), {
			label: 'initial DB→Radicale sync',
			initialDelayMs: 1000,
			maxDelayMs: 30_000,
			isRetryable: isTransientDbError,
		})

		await startWatchingRadicale()
		startPeriodicSync()
		startReadonlyAuthSync()

		logger.info('Sync service started successfully')
	} catch (error) {
		// Only non-transient errors reach here — transient ones retry forever
		// above. Surface via /ready briefly, then exit so Docker restarts us.
		logger.fatal({ err: error }, 'Fatal error during sync service startup')
		setStartupError(error)
		setTimeout(() => void shutdown(1), 2000)
	}
}

main()
