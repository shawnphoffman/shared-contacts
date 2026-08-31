import { getPool, tableExists } from '../db'
import { logger } from '../logger'
import { BINARY_MARKER, SNAPSHOT_FORMAT, SNAPSHOT_TABLES, SNAPSHOT_VERSION } from './snapshot'
import { readTarGz } from './tar'
import type { Snapshot } from './snapshot'
import type { Pool, PoolClient } from 'pg'

/**
 * Load a snapshot back into the database.
 *
 * This is the inverse of snapshot.ts and it is destructive: every table the
 * snapshot covers is emptied and rebuilt from the archive, so what comes out is
 * the state at backup time, not a merge. Nothing in the app calls it - there is
 * no restore button and no route - and that is deliberate: the admin API has no
 * login, so a one-click "replace everything" would be reachable by anyone who
 * can reach the UI. It runs from the tests, and from a hand-run script.
 */

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/

/** Postgres caps a statement at 65535 bind parameters. */
const MAX_BIND_PARAMS = 65535
const MAX_ROWS_PER_INSERT = 500

export class InvalidSnapshotError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'InvalidSnapshotError'
	}
}

export interface RestoreResult {
	/** Rows written, per table. */
	counts: Record<string, number>
	/** Tables in the snapshot that this database doesn't have. */
	skippedTables: Array<string>
}

/** Inverse of encodeSnapshotValue: base64 binary markers become Buffers again. */
export function decodeSnapshotValue(value: unknown): unknown {
	if (value === null || value === undefined) return null
	if (Array.isArray(value)) return value.map(decodeSnapshotValue)
	if (typeof value === 'object') {
		const record = value as Record<string, unknown>
		const encoded = record[BINARY_MARKER]
		if (typeof encoded === 'string' && Object.keys(record).length === 1) {
			return Buffer.from(encoded, 'base64')
		}
		const decoded: Record<string, unknown> = {}
		for (const [key, entry] of Object.entries(record)) {
			decoded[key] = decodeSnapshotValue(entry)
		}
		return decoded
	}
	return value
}

/**
 * Check that this is one of our snapshots and a version we understand, before
 * anything destructive happens.
 */
export function parseSnapshot(input: unknown): Snapshot {
	const snapshot = typeof input === 'string' ? (JSON.parse(input) as unknown) : input
	if (typeof snapshot !== 'object' || snapshot === null) {
		throw new InvalidSnapshotError('Snapshot is not an object')
	}

	// Read as loose values, not as a Partial<Snapshot>: the input is whatever
	// was in the file, and typing it as the shape we are checking for makes the
	// checks look redundant to the compiler.
	const candidate = snapshot as Record<string, unknown>
	if (candidate.format !== SNAPSHOT_FORMAT) {
		throw new InvalidSnapshotError(`Not a ${SNAPSHOT_FORMAT} snapshot (format: ${String(candidate.format)})`)
	}
	if (candidate.version !== SNAPSHOT_VERSION) {
		// Forward compatibility is not free and nothing writes another version
		// yet; refuse rather than half-restore a shape we don't know.
		throw new InvalidSnapshotError(`Unsupported snapshot version ${String(candidate.version)}, expected ${SNAPSHOT_VERSION}`)
	}
	if (typeof candidate.tables !== 'object' || candidate.tables === null) {
		throw new InvalidSnapshotError('Snapshot has no tables')
	}

	for (const [name, rows] of Object.entries(candidate.tables)) {
		if (!Array.isArray(rows)) {
			throw new InvalidSnapshotError(`Table ${name} is not an array of rows`)
		}
	}

	return candidate as unknown as Snapshot
}

/** Pull the snapshot out of a `.tar.gz` archive this app wrote. */
export function readSnapshotFromArchive(archive: Buffer): Snapshot {
	const entry = readTarGz(archive).find(file => file.name.endsWith('/snapshot.json') || file.name === 'snapshot.json')
	if (!entry) {
		throw new InvalidSnapshotError('Archive contains no snapshot.json')
	}
	return parseSnapshot(entry.data.toString('utf-8'))
}

function assertIdentifier(name: string, what: string): void {
	if (!SAFE_IDENTIFIER.test(name)) {
		// Identifiers can't be bound as parameters, so they are interpolated -
		// which is only safe because nothing but a plain identifier gets through.
		throw new InvalidSnapshotError(`Unsafe ${what} in snapshot: ${JSON.stringify(name)}`)
	}
}

/**
 * Column types for one table, so values can be bound the way each column
 * expects. This is not bookkeeping for its own sake: node-pg renders a JS array
 * parameter as a Postgres *array literal*, which is right for a text[] column
 * like changed_fields and rejected outright by a jsonb one like phones. The
 * snapshot carries both, so the shape alone cannot tell them apart.
 */
async function columnTypes(client: PoolClient, table: string): Promise<Map<string, string>> {
	const result = await client.query(
		`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
		[table]
	)
	return new Map(result.rows.map((row: { column_name: string; data_type: string }) => [row.column_name, row.data_type]))
}

function bindValue(value: unknown, dataType: string | undefined): unknown {
	if (dataType === 'json' || dataType === 'jsonb') {
		return value === null || value === undefined ? null : JSON.stringify(value)
	}
	return value
}

async function insertRows(client: PoolClient, table: string, rows: Array<Record<string, unknown>>): Promise<void> {
	if (rows.length === 0) return

	// One shape per table: the first row's columns. A row that disagrees is a
	// corrupt snapshot, not something to paper over with per-row statements.
	const columns = Object.keys(rows[0])
	if (columns.length === 0) throw new InvalidSnapshotError(`Table ${table} has rows with no columns`)
	for (const column of columns) assertIdentifier(column, `column name for ${table}`)

	const types = await columnTypes(client, table)
	const columnList = columns.join(', ')
	const chunkSize = Math.max(1, Math.min(MAX_ROWS_PER_INSERT, Math.floor(MAX_BIND_PARAMS / columns.length)))

	for (let start = 0; start < rows.length; start += chunkSize) {
		const chunk = rows.slice(start, start + chunkSize)
		const values: Array<unknown> = []
		const tuples = chunk.map((row, rowIndex) => {
			const rowKeys = Object.keys(row)
			if (rowKeys.length !== columns.length || !columns.every(column => column in row)) {
				throw new InvalidSnapshotError(`Table ${table} row ${start + rowIndex} has different columns to the first row`)
			}
			const placeholders = columns.map((column, columnIndex) => {
				values.push(bindValue(decodeSnapshotValue(row[column]), types.get(column)))
				return `$${rowIndex * columns.length + columnIndex + 1}`
			})
			return `(${placeholders.join(', ')})`
		})

		await client.query(`INSERT INTO ${table} (${columnList}) VALUES ${tuples.join(', ')}`, values)
	}
}

/**
 * Replace the contents of every snapshot table with the snapshot's.
 *
 * All of it runs in one transaction, so a failure part-way leaves the database
 * as it was rather than half-wiped. Deletes run back-to-front and inserts
 * front-to-back, which is the order SNAPSHOT_TABLES is written in for exactly
 * this reason.
 */
export async function restoreSnapshot(snapshot: Snapshot, pool: Pool = getPool()): Promise<RestoreResult> {
	const counts: Record<string, number> = {}
	const skippedTables: Array<string> = []

	const present: Array<string> = []
	for (const table of SNAPSHOT_TABLES) {
		assertIdentifier(table.name, 'table name')
		if (!(table.name in snapshot.tables)) continue
		if (!(await tableExists(table.name))) {
			skippedTables.push(table.name)
			continue
		}
		present.push(table.name)
	}

	const unknown = Object.keys(snapshot.tables).filter(name => !SNAPSHOT_TABLES.some(table => table.name === name))
	if (unknown.length > 0) {
		// A newer backup restored into an older app. Say so rather than dropping
		// the data on the floor quietly.
		logger.warn({ tables: unknown }, 'Snapshot holds tables this version does not know; leaving them out')
		skippedTables.push(...unknown)
	}

	const client = await pool.connect()
	try {
		await client.query('BEGIN')
		// Snapshot timestamps are UTC ISO strings, and some columns are still
		// `timestamp without time zone` (migration 22 only converted contacts).
		// Postgres reads a naive timestamp in the session zone, so a restore run
		// from a machine that isn't on UTC would shift those columns by its
		// offset. Pin the zone for the transaction rather than trusting the
		// caller's.
		await client.query("SET LOCAL TIME ZONE 'UTC'")

		for (const table of [...present].reverse()) {
			await client.query(`DELETE FROM ${table}`)
		}

		for (const table of present) {
			const rows = snapshot.tables[table]
			await insertRows(client, table, rows)
			counts[table] = rows.length
		}

		await client.query('COMMIT')
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined)
		throw error
	} finally {
		client.release()
	}

	logger.info({ counts, skippedTables }, 'Snapshot restored')
	return { counts, skippedTables }
}

/** Read an archive and restore the snapshot inside it. */
export async function restoreFromArchive(archive: Buffer, pool: Pool = getPool()): Promise<RestoreResult> {
	return restoreSnapshot(readSnapshotFromArchive(archive), pool)
}
