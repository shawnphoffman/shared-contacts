import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { readAppPackageInfo } from '../../lib/app-version'

export const Route = createFileRoute('/api/about')({
	server: {
		handlers: {
			GET: () => {
				try {
					// Root package.json carries the version and repo info.
					const { version: packageVersion, repository } = readAppPackageInfo()
					const version = packageVersion ?? 'unknown'

					// Get safe environment variables (mask sensitive ones)
					const safeEnvVars: Record<string, string | null> = {
						NODE_ENV: process.env.NODE_ENV || null,
						DATABASE_URL: process.env.DATABASE_URL ? maskSensitiveUrl(process.env.DATABASE_URL) : null,
						SYNC_SERVICE_URL: process.env.SYNC_SERVICE_URL || null,
						SYNC_INTERVAL: process.env.SYNC_INTERVAL || null,
						FILE_WATCHER_DEBOUNCE_MS: process.env.FILE_WATCHER_DEBOUNCE_MS || null,
						DATABASE_SSL: process.env.DATABASE_SSL || null,
						DATABASE_SSL_REJECT_UNAUTHORIZED: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || null,
						BACKUP_ENABLED: process.env.BACKUP_ENABLED || null,
						BACKUP_DIR: process.env.BACKUP_DIR || null,
						BACKUP_INTERVAL: process.env.BACKUP_INTERVAL || null,
						BACKUP_KEEP: process.env.BACKUP_KEEP || null,
					}

					return json({
						version,
						repository,
						environment: safeEnvVars,
						nodeVersion: process.version,
						platform: process.platform,
						arch: process.arch,
					})
				} catch (error) {
					logger.error({ err: error }, 'Error fetching about info')
					return json({ error: 'Failed to fetch about information' }, { status: 500 })
				}
			},
		},
	},
})

function maskSensitiveUrl(url: string): string {
	try {
		const urlObj = new URL(url)
		if (urlObj.password) {
			urlObj.password = '***masked***'
		}
		return urlObj.toString()
	} catch {
		// If URL parsing fails, return a masked version
		return url.replace(/:[^:@]+@/, ':***masked***@')
	}
}
