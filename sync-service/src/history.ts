import { getPool, Contact } from './db'
import { logger } from './logger'

export type HistoryOperation =
	| 'create'
	| 'update'
	| 'delete'
	| 'restore'
	| 'permanent_delete'
	| 'merge'
	| 'unmerge'
	| 'import'
	| 'undo'
	// An edit that last-write-wins threw away. Not a change to the contact, a
	// record that one was dropped.
	| 'conflict_discard'

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

/**
 * Fields that we never persist into history snapshots — too large or
 * derivable from the rest of the row. The vCard text is preserved on its own
 * because it's the canonical CardDAV payload.
 */
const SNAPSHOT_OMIT = new Set(['photo_blob'])

/** Fields that are pure metadata for sync bookkeeping and don't represent a
 * user-visible change. They're excluded from changed_fields detection. */
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
		} else if (Buffer.isBuffer(value)) {
			// Skip raw buffers — they shouldn't be in snapshots
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

let tableChecked = false
let tableExists = false

async function ensureTableExists(): Promise<boolean> {
	if (tableChecked) return tableExists
	const pool = getPool()
	const result = await pool.query(
		`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contact_history'`
	)
	tableExists = result.rows.length > 0
	tableChecked = true
	return tableExists
}

export interface ConflictDiscardInput {
	contactId: string
	vcardId: string
	bookId: string
	/** Which side's edit was thrown away. */
	discarded: 'db' | 'carddav'
	summary: string
	dbUpdatedAt?: Date | null
	radicaleFileMtime?: Date | null
	dbHash: string | null
	radicaleHash: string | null
}

/**
 * Record that last-write-wins threw an edit away.
 *
 * Written once per conflict, not once per pass that notices it: an unresolved
 * conflict is re-detected on every sync until one side changes or the winning
 * version reaches the other, and the outbound pass sees the same conflict the
 * inbound one did. Both would otherwise pile up identical rows - every 30
 * seconds, for as long as it takes - and bury the contact's real history. The
 * pair of hashes identifies the conflict, so the same pair means the same one.
 *
 * Deliberately no state snapshots: a vcard_data payload with an embedded photo
 * runs to megabytes and the row would carry it twice.
 */
export async function recordConflictDiscard(input: ConflictDiscardInput): Promise<string | null> {
	try {
		if (!(await ensureTableExists())) return null

		const pool = getPool()
		const existing = await pool.query(
			`SELECT 1 FROM contact_history
			 WHERE contact_id = $1
			   AND operation = 'conflict_discard'
			   AND metadata->>'dbHash' IS NOT DISTINCT FROM $2
			   AND metadata->>'radicaleHash' IS NOT DISTINCT FROM $3
			 LIMIT 1`,
			[input.contactId, input.dbHash, input.radicaleHash]
		)
		if (existing.rows.length > 0) return null

		return await recordHistory({
			contactId: input.contactId,
			operation: 'conflict_discard',
			source: 'sync',
			actor: null,
			actorType: 'system',
			summary: input.summary,
			metadata: {
				vcardId: input.vcardId,
				bookId: input.bookId,
				discarded: input.discarded,
				dbUpdatedAt: input.dbUpdatedAt?.toISOString() ?? null,
				radicaleFileMtime: input.radicaleFileMtime?.toISOString() ?? null,
				dbHash: input.dbHash,
				radicaleHash: input.radicaleHash,
			},
		})
	} catch (error) {
		// Same contract as recordHistory: logging must not break the sync.
		logger.error({ err: error, contactId: input.contactId }, 'Failed to record conflict discard')
		return null
	}
}

export async function recordHistory(entry: HistoryEntryInput): Promise<string | null> {
	try {
		if (!(await ensureTableExists())) {
			return null
		}
		const previousSnapshot = entry.previousState ? snapshotContact(entry.previousState) : null
		const newSnapshot = entry.newState ? snapshotContact(entry.newState) : null
		const changedFields = diffContacts(previousSnapshot, newSnapshot)

		// Idempotence: skip pure no-op updates (CardDAV clients often re-PUT
		// identical vCards; without this, every sync cycle pollutes history).
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
		// History logging must not break the underlying operation.
		logger.error({ err: error, operation: entry.operation, contactId: entry.contactId }, 'Failed to record contact history')
		return null
	}
}
