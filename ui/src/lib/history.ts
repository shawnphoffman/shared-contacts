import { getPool, tableExists } from './db'
import { logger } from './logger'
import type { Contact } from './db'

export type HistoryOperation = 'create' | 'update' | 'delete' | 'restore' | 'permanent_delete' | 'merge' | 'unmerge' | 'import' | 'undo'

export type HistorySource = 'web' | 'api' | 'carddav' | 'sync' | 'import' | 'merge' | 'dedup' | 'system'

export interface HistoryEntryInput {
	contactId: string | null
	operation: HistoryOperation
	source: HistorySource
	actor?: string | null
	actorType?: 'user' | 'system' | 'carddav-client' | null
	userAgent?: string | null
	clientIp?: string | null
	summary?: string | null
	previousState?: Partial<Contact> | Record<string, unknown> | null
	newState?: Partial<Contact> | Record<string, unknown> | null
	relatedContactIds?: Array<string> | null
	metadata?: Record<string, unknown> | null
	undoesHistoryId?: string | null
}

const SNAPSHOT_OMIT = new Set(['photo_blob'])

const NON_CONTENT_FIELDS = new Set([
	'updated_at',
	'created_at',
	'last_synced_from_radicale_at',
	'last_synced_to_radicale_at',
	'vcard_hash',
	'sync_source',
	'radicale_file_mtime',
])

export function snapshotContact(contact: Partial<Contact> | Record<string, unknown> | null | undefined): Record<string, unknown> | null {
	if (!contact) return null
	const out: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(contact as Record<string, unknown>)) {
		if (SNAPSHOT_OMIT.has(key)) continue
		if (value instanceof Date) {
			out[key] = value.toISOString()
		} else if (value && typeof value === 'object' && 'type' in value && (value as { type?: string }).type === 'Buffer') {
			continue
		} else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
			continue
		} else {
			out[key] = value
		}
	}
	return out
}

export function diffContacts(prev: Record<string, unknown> | null, next: Record<string, unknown> | null): Array<string> {
	if (!prev || !next) {
		return Object.keys(next || prev || {}).filter(k => !NON_CONTENT_FIELDS.has(k))
	}
	const fields = new Set<string>([...Object.keys(prev), ...Object.keys(next)])
	const changed: Array<string> = []
	for (const field of fields) {
		if (NON_CONTENT_FIELDS.has(field)) continue
		const a = prev[field]
		const b = next[field]
		if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
			changed.push(field)
		}
	}
	return changed
}

/**
 * Pull actor / source / user-agent metadata off an incoming Request. Falls
 * back to "web" because the only authenticated path through the UI today is
 * the browser hitting our API routes; consumers can override the source.
 */
export function actorFromRequest(request: Request): {
	actor: string | null
	actorType: 'user' | 'system' | null
	userAgent: string | null
	clientIp: string | null
	source: HistorySource
} {
	const headers = request.headers
	const actor = headers.get('x-actor') || headers.get('x-user-name') || null
	const userAgent = headers.get('user-agent') || null
	const forwardedFor = headers.get('x-forwarded-for')
	const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : headers.get('x-real-ip')
	const sourceHeader = (headers.get('x-source') as HistorySource | null) || 'web'
	return {
		actor,
		actorType: actor ? 'user' : null,
		userAgent,
		clientIp,
		source: sourceHeader,
	}
}

export async function recordHistory(entry: HistoryEntryInput): Promise<string | null> {
	try {
		if (!(await tableExists('contact_history'))) {
			return null
		}
		const previousSnapshot = entry.previousState ? snapshotContact(entry.previousState) : null
		const newSnapshot = entry.newState ? snapshotContact(entry.newState) : null
		const changedFields = diffContacts(previousSnapshot, newSnapshot)

		// Idempotence: skip pure no-op updates so re-saves don't pollute history.
		if (entry.operation === 'update' && previousSnapshot && newSnapshot && changedFields.length === 0) {
			return null
		}

		const pool = getPool()
		const result = await pool.query(
			`INSERT INTO contact_history (
				contact_id, operation, source, actor, actor_type, user_agent, client_ip,
				summary, changed_fields, previous_state, new_state, related_contact_ids,
				metadata, undoes_history_id
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
			RETURNING id`,
			[
				entry.contactId,
				entry.operation,
				entry.source,
				entry.actor ?? null,
				entry.actorType ?? null,
				entry.userAgent ?? null,
				entry.clientIp ?? null,
				entry.summary ?? null,
				changedFields.length > 0 ? changedFields : null,
				previousSnapshot ? JSON.stringify(previousSnapshot) : null,
				newSnapshot ? JSON.stringify(newSnapshot) : null,
				entry.relatedContactIds && entry.relatedContactIds.length > 0 ? entry.relatedContactIds : null,
				entry.metadata ? JSON.stringify(entry.metadata) : null,
				entry.undoesHistoryId ?? null,
			]
		)
		return result.rows[0]?.id ?? null
	} catch (error) {
		// Never let history logging take down a mutation.
		logger.error({ err: error, operation: entry.operation, contactId: entry.contactId }, 'Failed to record contact history')
		return null
	}
}

export interface HistoryRow {
	id: string
	contact_id: string | null
	operation: HistoryOperation
	source: HistorySource
	actor: string | null
	actor_type: string | null
	user_agent: string | null
	client_ip: string | null
	summary: string | null
	changed_fields: Array<string> | null
	previous_state: Record<string, unknown> | null
	new_state: Record<string, unknown> | null
	related_contact_ids: Array<string> | null
	metadata: Record<string, unknown> | null
	undone_at: Date | null
	undone_by_history_id: string | null
	undoes_history_id: string | null
	created_at: Date
}

export async function listHistory(opts: { contactId?: string; limit?: number; offset?: number }): Promise<{
	rows: Array<HistoryRow>
	total: number
}> {
	if (!(await tableExists('contact_history'))) {
		return { rows: [], total: 0 }
	}
	const pool = getPool()
	const limit = Math.max(1, Math.min(500, opts.limit ?? 100))
	const offset = Math.max(0, opts.offset ?? 0)

	if (opts.contactId) {
		const [count, data] = await Promise.all([
			pool.query('SELECT COUNT(*) FROM contact_history WHERE contact_id = $1 OR $1 = ANY(related_contact_ids)', [opts.contactId]),
			pool.query(
				`SELECT * FROM contact_history
				 WHERE contact_id = $1 OR $1 = ANY(related_contact_ids)
				 ORDER BY created_at DESC
				 LIMIT $2 OFFSET $3`,
				[opts.contactId, limit, offset]
			),
		])
		return { rows: data.rows, total: parseInt(count.rows[0].count, 10) }
	}

	const [count, data] = await Promise.all([
		pool.query('SELECT COUNT(*) FROM contact_history'),
		pool.query('SELECT * FROM contact_history ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]),
	])
	return { rows: data.rows, total: parseInt(count.rows[0].count, 10) }
}

export async function getHistoryById(id: string): Promise<HistoryRow | null> {
	if (!(await tableExists('contact_history'))) return null
	const pool = getPool()
	const result = await pool.query('SELECT * FROM contact_history WHERE id = $1', [id])
	return result.rows[0] || null
}

export async function markHistoryUndone(historyId: string, undoneByHistoryId: string): Promise<void> {
	const pool = getPool()
	await pool.query('UPDATE contact_history SET undone_at = NOW(), undone_by_history_id = $1 WHERE id = $2', [undoneByHistoryId, historyId])
}
