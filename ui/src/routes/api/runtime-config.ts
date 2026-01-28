import { createFileRoute } from '@tanstack/react-router'

interface RuntimeConfigResponse {
	uiBaseUrl: string | null
	carddavBaseUrl: string | null
}

export const Route = createFileRoute('/api/runtime-config')({
	server: {
		handlers: {
			GET: () => {
				const uiBaseUrl = process.env.PUBLIC_UI_URL || null
				const carddavBaseUrl = process.env.PUBLIC_CARDDAV_URL || null

				const body: RuntimeConfigResponse = {
					uiBaseUrl,
					carddavBaseUrl,
				}

				return Response.json(body)
			},
		},
	},
})
