import { createFileRoute } from '@tanstack/react-router'
import { logger } from '../../lib/logger'

interface RuntimeConfigResponse {
	uiBaseUrl: string | null
	carddavBaseUrl: string | null
}

export const Route = createFileRoute('/api/runtime-config')({
	server: {
		handlers: {
			GET: () => {
				try {
					const uiBaseUrl = process.env.PUBLIC_UI_URL || null
					const carddavBaseUrl = process.env.PUBLIC_CARDDAV_URL || null

					const body: RuntimeConfigResponse = {
						uiBaseUrl,
						carddavBaseUrl,
					}

					return Response.json(body)
				} catch (error) {
					logger.error({ err: error }, 'Error loading runtime config')
					return Response.json({ error: 'Failed to load runtime config' }, { status: 500 })
				}
			},
		},
	},
})
