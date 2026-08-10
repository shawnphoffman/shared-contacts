import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { InvalidBackupNameError, deleteBackup, resolveBackupPath } from '../../lib/backup'

function isNotFound(error: unknown): boolean {
	return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

export const Route = createFileRoute('/api/backups/$name')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const { name } = params
				try {
					const path = resolveBackupPath(name)
					const info = await stat(path)
					const stream = Readable.toWeb(createReadStream(path)) as ReadableStream
					return new Response(stream, {
						status: 200,
						headers: {
							'Content-Type': 'application/gzip',
							'Content-Length': String(info.size),
							'Content-Disposition': `attachment; filename="${name}"`,
						},
					})
				} catch (error) {
					if (error instanceof InvalidBackupNameError) {
						return json({ error: error.message }, { status: 400 })
					}
					if (isNotFound(error)) {
						return json({ error: 'Backup not found' }, { status: 404 })
					}
					logger.error({ err: error, backup: name }, 'Failed to download backup')
					return json({ error: 'Failed to download backup' }, { status: 500 })
				}
			},
			DELETE: async ({ params }) => {
				const { name } = params
				try {
					const deleted = await deleteBackup(name)
					if (!deleted) {
						return json({ error: 'Backup not found' }, { status: 404 })
					}
					return json({ message: 'Backup deleted' })
				} catch (error) {
					if (error instanceof InvalidBackupNameError) {
						return json({ error: error.message }, { status: 400 })
					}
					logger.error({ err: error, backup: name }, 'Failed to delete backup')
					return json({ error: 'Failed to delete backup' }, { status: 500 })
				}
			},
		},
	},
})
