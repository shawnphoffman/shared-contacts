/**
 * Applies the SQL migrations to a test database.
 *
 * Integration tests run against a throwaway Postgres rather than the real
 * migration runner (which needs the service's own module graph), so each suite
 * brings the schema up itself. Tracking applied files in schema_migrations
 * makes this safe to call from more than one suite against the same database.
 */
import * as fs from 'fs'
import * as path from 'path'
import type { Pool } from 'pg'

export function getMigrationsDir(): string {
	const migrationsDir = path.join(__dirname, '..', '..', '..', 'migrations')
	if (!fs.existsSync(migrationsDir)) {
		throw new Error(`Migrations directory not found: ${migrationsDir}`)
	}
	return migrationsDir
}

export async function applyMigrations(pool: Pool): Promise<void> {
	const migrationsDir = getMigrationsDir()

	await pool.query(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name TEXT PRIMARY KEY,
			applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		)
	`)

	const applied = await pool.query('SELECT name FROM schema_migrations')
	const appliedSet = new Set(applied.rows.map((row: { name: string }) => row.name))

	const files = fs
		.readdirSync(migrationsDir)
		.filter(file => file.endsWith('.sql'))
		.sort()

	for (const file of files) {
		if (appliedSet.has(file)) continue
		const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
		const hasTransaction = /^\s*BEGIN\s*;/im.test(sql)
		if (hasTransaction) {
			await pool.query(sql)
		} else {
			await pool.query('BEGIN')
			await pool.query(sql)
			await pool.query('COMMIT')
		}
		await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
	}
}
