import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export const Route = createFileRoute('/api/about')({
	server: {
		handlers: {
			GET: async () => {
				try {
					// Try to read root package.json first (for version and repo info)
					let version = 'unknown'
					let repository = null

					// Check multiple possible locations for package.json
					const possiblePaths = [
						join(process.cwd(), '..', 'package.json'), // Root package.json (when running from ui/)
						join(process.cwd(), 'package.json'), // Current directory
						join(process.cwd(), '..', '..', 'package.json'), // If nested deeper
					]

					for (const packageJsonPath of possiblePaths) {
						if (existsSync(packageJsonPath)) {
							try {
								const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
								if (packageJson.version) {
									version = packageJson.version
								}
								if (packageJson.repository) {
									repository = packageJson.repository
								}
								break // Use the first valid package.json found
							} catch {
								// Continue to next path if this one fails
							}
						}
					}

					// Get safe environment variables (mask sensitive ones)
					const safeEnvVars: Record<string, string | null> = {
						NODE_ENV: process.env.NODE_ENV || null,
						DATABASE_URL: process.env.DATABASE_URL ? maskSensitiveUrl(process.env.DATABASE_URL) : null,
						SYNC_SERVICE_URL: process.env.SYNC_SERVICE_URL || null,
						RADICALE_STORAGE_PATH: process.env.RADICALE_STORAGE_PATH || null,
						SYNC_INTERVAL: process.env.SYNC_INTERVAL || null,
						FILE_WATCHER_DEBOUNCE_MS: process.env.FILE_WATCHER_DEBOUNCE_MS || null,
						API_PORT: process.env.API_PORT || null,
						DATABASE_SSL: process.env.DATABASE_SSL || null,
						DATABASE_SSL_REJECT_UNAUTHORIZED: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || null,
						RADICALE_USERS_FILE: process.env.RADICALE_USERS_FILE || null,
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
					console.error('Error fetching about info:', error)
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
