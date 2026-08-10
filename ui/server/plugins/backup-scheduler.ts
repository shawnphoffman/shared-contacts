import { definePlugin } from 'nitro'
import { startBackupScheduler } from '../../src/lib/backup/scheduler'

/**
 * Kick off the scheduled-backup timer when the server boots. Starting is a
 * no-op unless BACKUP_ENABLED is set, and is idempotent, so the dev server
 * re-evaluating this module doesn't stack up timers.
 */
export default definePlugin(() => {
	void startBackupScheduler()
})
