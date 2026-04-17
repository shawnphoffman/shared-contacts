import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { getAppSetting, setAppSetting } from '../../lib/db'

const ALLOWED_KEYS = new Set(['mobileconfig_org'])

export const Route = createFileRoute('/api/settings')({
	server: {
		handlers: {
			GET: async () => {
				try {
					const entries = await Promise.all(
						Array.from(ALLOWED_KEYS).map(async key => [key, await getAppSetting(key)] as const)
					)
					const settings: Record<string, string | null> = {}
					for (const [key, value] of entries) {
						settings[key] = value
					}
					return json(settings)
				} catch (error) {
					logger.error({ err: error }, 'Error loading app settings')
					return json({ error: 'Failed to load settings' }, { status: 500 })
				}
			},
			PUT: async ({ request }) => {
				try {
					const body = (await request.json()) as Record<string, unknown>
					const updates: Record<string, string | null> = {}
					for (const [key, value] of Object.entries(body)) {
						if (!ALLOWED_KEYS.has(key)) {
							return json({ error: `Unknown setting: ${key}` }, { status: 400 })
						}
						if (value === null || value === '') {
							updates[key] = null
						} else if (typeof value === 'string') {
							updates[key] = value.trim()
						} else {
							return json({ error: `Setting ${key} must be a string or null` }, { status: 400 })
						}
					}
					for (const [key, value] of Object.entries(updates)) {
						await setAppSetting(key, value)
					}
					return json({ ok: true, settings: updates })
				} catch (error) {
					logger.error({ err: error }, 'Error updating app settings')
					return json({ error: 'Failed to update settings' }, { status: 500 })
				}
			},
		},
	},
})
