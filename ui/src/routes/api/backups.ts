import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { getBackupConfig } from '../../lib/backup/config'
import { getBackupSchedulerStatus } from '../../lib/backup/scheduler'
import { getLastBackupRun, listBackups, runBackup } from '../../lib/backup'

export const Route = createFileRoute('/api/backups')({
	server: {
		handlers: {
			GET: async () => {
				try {
					const config = getBackupConfig()
					const backups = await listBackups(config)
					return json({
						config: {
							enabled: config.enabled,
							dir: config.dir,
							intervalMs: config.intervalMs,
							keep: config.keep,
							warnings: config.warnings,
						},
						scheduler: getBackupSchedulerStatus(),
						lastRun: getLastBackupRun(),
						backups,
					})
				} catch (error) {
					logger.error({ err: error }, 'Failed to list backups')
					return json({ error: 'Failed to list backups' }, { status: 500 })
				}
			},
			POST: async ({ request }) => {
				let action: string | undefined
				try {
					const body = (await request.json()) as { action?: string }
					action = body.action
				} catch {
					return json({ error: 'Invalid JSON body' }, { status: 400 })
				}

				if (action !== 'run') {
					return json({ error: 'Invalid action. Use run' }, { status: 400 })
				}

				try {
					const run = await runBackup()
					return json({ message: 'Backup created', run }, { status: 201 })
				} catch (error) {
					logger.error({ err: error }, 'Failed to create backup')
					const message = error instanceof Error ? error.message : 'Failed to create backup'
					return json({ error: message }, { status: 500 })
				}
			},
		},
	},
})
