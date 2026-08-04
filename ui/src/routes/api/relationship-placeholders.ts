import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { listPlaceholders, relationshipsEnabled } from '../../lib/relationships'

export const Route = createFileRoute('/api/relationship-placeholders')({
	server: {
		handlers: {
			GET: async () => {
				try {
					if (!(await relationshipsEnabled())) {
						return json({ error: 'Relationships are not available (migration pending)' }, { status: 503 })
					}
					return json(await listPlaceholders())
				} catch (error) {
					logger.error({ err: error }, 'Error listing relationship placeholders')
					return json({ error: 'Failed to list placeholders' }, { status: 500 })
				}
			},
		},
	},
})
