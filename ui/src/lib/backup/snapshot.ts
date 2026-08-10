import { getPool, tableExists } from '../db'

/**
 * A logical, restore-oriented dump of every table this app owns. Unlike the
 * `.vcf`/`.csv` exports (which carry contacts only), the snapshot preserves
 * address books, per-user book assignments, the relationship graph and change
 * history, so a backup can rebuild the application state rather than just the
 * contact cards.
 */

export const SNAPSHOT_FORMAT = 'shared-contacts-backup'
export const SNAPSHOT_VERSION = 1

/** Marker object used to carry `bytea` columns (contact photos) as base64. */
export const BINARY_MARKER = '$binary'

interface SnapshotTable {
	name: string
	/** Deterministic ordering so two backups of unchanged data diff cleanly. */
	orderBy: string
}

/**
 * Ordered so a restore can insert them front-to-back without tripping foreign
 * keys. Better-auth's `user`/`account`/`session`/`verification` tables and the
 * one-shot migration sentinels are deliberately excluded: they hold no
 * user-authored data. Radicale's own credentials live in `/data/users`, not in
 * Postgres, and are outside this snapshot.
 */
export const SNAPSHOT_TABLES: Array<SnapshotTable> = [
	{ name: 'app_settings', orderBy: 'key' },
	{ name: 'address_books', orderBy: 'id' },
	{ name: 'address_book_readonly', orderBy: 'address_book_id' },
	{ name: 'user_address_books', orderBy: 'username, address_book_id' },
	{ name: 'contacts', orderBy: 'id' },
	{ name: 'contact_address_books', orderBy: 'contact_id, address_book_id' },
	{ name: 'relationship_placeholders', orderBy: 'id' },
	{ name: 'contact_relationships', orderBy: 'id' },
	{ name: 'contact_history', orderBy: 'created_at, id' },
]

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/

export interface Snapshot {
	format: typeof SNAPSHOT_FORMAT
	version: typeof SNAPSHOT_VERSION
	createdAt: string
	appVersion: string | null
	/** Row counts per table, mirrored here so the UI needn't parse `tables`. */
	counts: Record<string, number>
	/** Tables listed in SNAPSHOT_TABLES that this database doesn't have. */
	skippedTables: Array<string>
	tables: Record<string, Array<Record<string, unknown>>>
}

/**
 * Convert a pg row value into something `JSON.stringify` renders usefully.
 *
 * Buffers get special treatment: `JSON.stringify` would otherwise expand a
 * `bytea` photo into `{"type":"Buffer","data":[137,80,...]}`, roughly six bytes
 * of JSON per byte of image.
 */
export function encodeSnapshotValue(value: unknown): unknown {
	if (value === null || value === undefined) return null
	if (Buffer.isBuffer(value)) return { [BINARY_MARKER]: value.toString('base64') }
	if (value instanceof Uint8Array) return { [BINARY_MARKER]: Buffer.from(value).toString('base64') }
	if (value instanceof Date) return value.toISOString()
	if (typeof value === 'bigint') return value.toString()
	if (Array.isArray(value)) return value.map(encodeSnapshotValue)
	if (typeof value === 'object') {
		const encoded: Record<string, unknown> = {}
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			encoded[key] = encodeSnapshotValue(entry)
		}
		return encoded
	}
	return value
}

export function encodeSnapshotRow(row: Record<string, unknown>): Record<string, unknown> {
	return encodeSnapshotValue(row) as Record<string, unknown>
}

export async function buildSnapshot(appVersion: string | null = null): Promise<Snapshot> {
	const pool = getPool()
	const tables: Record<string, Array<Record<string, unknown>>> = {}
	const counts: Record<string, number> = {}
	const skippedTables: Array<string> = []

	for (const table of SNAPSHOT_TABLES) {
		// Table and column names are interpolated (pg can't parameterize
		// identifiers), so re-assert they're plain identifiers even though the
		// list above is a hardcoded constant.
		if (!SAFE_IDENTIFIER.test(table.name) || !/^[a-z_, ]+$/.test(table.orderBy)) {
			throw new Error(`Unsafe snapshot table definition: ${table.name}`)
		}
		if (!(await tableExists(table.name))) {
			skippedTables.push(table.name)
			continue
		}

		const result = await pool.query(`SELECT * FROM ${table.name} ORDER BY ${table.orderBy}`)
		tables[table.name] = result.rows.map(encodeSnapshotRow)
		counts[table.name] = result.rows.length
	}

	return {
		format: SNAPSHOT_FORMAT,
		version: SNAPSHOT_VERSION,
		createdAt: new Date().toISOString(),
		appVersion,
		counts,
		skippedTables,
		tables,
	}
}
