import { logger } from '../logger'
import { getBackupConfig } from './config'
import { backupState } from './state'
import { listBackups, runBackup } from './index'
import type { BackupConfig } from './config'

/**
 * Grace period before the first run after boot, so migrations and the initial
 * Radicale sync have settled before we snapshot the database.
 */
const STARTUP_DELAY_MS = 30_000

export interface BackupSchedulerStatus {
	running: boolean
	/** Epoch millis of the next scheduled run, or null when not scheduled. */
	nextRunAt: number | null
}

export function getBackupSchedulerStatus(): BackupSchedulerStatus {
	const state = backupState()
	return { running: state.timer !== null, nextRunAt: state.nextRunAt }
}

function scheduleIn(config: BackupConfig, delayMs: number): void {
	const state = backupState()
	state.nextRunAt = Date.now() + delayMs
	state.timer = setTimeout(() => {
		void runBackup(config)
			.catch(() => {
				// runBackup already logged and recorded the failure; a bad run
				// must not stop the schedule.
			})
			.finally(() => {
				if (state.started) scheduleIn(config, config.intervalMs)
			})
	}, delayMs)
	// Don't hold the process open on our account; the HTTP server does that.
	state.timer.unref()
}

/**
 * Start the scheduled-backup timer. Safe to call more than once — repeat calls
 * are ignored, which matters because the dev server re-evaluates modules.
 */
export async function startBackupScheduler(config: BackupConfig = getBackupConfig()): Promise<void> {
	const state = backupState()
	if (state.started) return
	state.started = true

	for (const warning of config.warnings) {
		logger.warn({ warning }, 'Backup configuration')
	}

	if (!config.enabled) {
		state.started = false
		logger.info('Scheduled backups are disabled (set BACKUP_ENABLED=true to turn them on)')
		return
	}

	// Pick up where the last run left off rather than restarting the clock.
	// Without this, a container that restarts more often than the interval
	// (deploys, health-check flaps) would never reach its first scheduled run.
	let delayMs = STARTUP_DELAY_MS
	try {
		const newest = (await listBackups(config)).at(0)
		if (newest) {
			const elapsed = Date.now() - new Date(newest.createdAt).getTime()
			delayMs = Math.max(config.intervalMs - elapsed, STARTUP_DELAY_MS)
		}
	} catch (error) {
		logger.error({ err: error, dir: config.dir }, 'Could not read the backup directory; scheduling from now')
	}

	scheduleIn(config, delayMs)
	logger.info({ dir: config.dir, intervalMs: config.intervalMs, keep: config.keep, firstRunInMs: delayMs }, 'Scheduled backups enabled')
}

export function stopBackupScheduler(): void {
	const state = backupState()
	if (state.timer) clearTimeout(state.timer)
	state.timer = null
	state.started = false
	state.nextRunAt = null
}
