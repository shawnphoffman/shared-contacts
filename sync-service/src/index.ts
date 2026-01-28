import 'dotenv/config'
import { closePool } from './db'
import { syncDbToRadicale, syncRadicaleToDb, startWatchingRadicale, startPeriodicSync } from './sync'
import { startApiServer, setMigrationsComplete, setStartupError } from './api'
import { runMigrations } from './migrations'
import { runPathMigrationIfNeeded } from './path-migration'
import { runCompositeUsersMigrationIfNeeded } from './composite-users-migration'
import { ensureAllCompositeUsersExist } from './htpasswd'
import { syncReadonlyUsersToHtpasswd } from './readonly-auth'

function setupSignalHandlers() {
	const handleShutdown = async (signal: 'SIGTERM' | 'SIGINT') => {
		console.log(`${signal} received, shutting down gracefully...`)
		try {
			await closePool()
		} catch (err) {
			console.error('Error while closing database pool during shutdown:', err)
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
	console.log('Starting Shared Contacts Sync Service...')
	console.log('RADICALE_STORAGE_PATH: /data/collections')
	console.log(`SYNC_INTERVAL: ${process.env.SYNC_INTERVAL || '30000'}ms`)

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
		console.log('Performing initial sync...')
		await syncRadicaleToDb()

		// Initial sync: DB → Radicale (to ensure consistency)
		await syncDbToRadicale()

		// Start watching Radicale for changes
		await startWatchingRadicale()

		// Start periodic sync from DB to Radicale
		startPeriodicSync()

		// Periodically sync read-only users to htpasswd (in case UI enabled/disabled or changed password)
		const readonlyAuthInterval = parseInt(process.env.READONLY_AUTH_SYNC_INTERVAL || '30000', 10)
		setInterval(async () => {
			try {
				await syncReadonlyUsersToHtpasswd()
			} catch (err) {
				console.error('Read-only auth sync error:', err)
			}
		}, readonlyAuthInterval)

		console.log('Sync service started successfully')
	} catch (error) {
		console.error('Fatal error during sync service startup:', error)
		// Record the startup error so /ready can report it, but keep the process alive
		setStartupError(error)
		try {
			await closePool()
		} catch (closeError) {
			console.error('Error while closing database pool after startup failure:', closeError)
		}
	}
}

main()
