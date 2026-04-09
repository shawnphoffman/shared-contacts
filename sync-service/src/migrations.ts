import { getPool } from './db'
import { readFileSync } from 'fs'
import { join } from 'path'
import { logger } from './logger'

// Get migrations directory - handle both dev and production paths
function getMigrationsDir(): string {
	// In development, migrations are at project root (one level up from sync-service/)
	// In production (Docker), migrations are copied to /app/migrations
	const possiblePaths = [
		join(process.cwd(), 'migrations'), // Docker production: /app/migrations
		join(process.cwd(), '..', 'migrations'), // Development: ../migrations from sync-service/
	]

	for (const path of possiblePaths) {
		try {
			readFileSync(join(path, '01_init_schema.sql'), 'utf-8')
			return path
		} catch {
			// Path doesn't exist, try next
		}
	}

	// Default to project root migrations (development)
	return join(process.cwd(), '..', 'migrations')
}

/**
 * Get all migration files in order
 */
function getMigrationFiles(): string[] {
	return [
		'01_init_schema.sql',
		'02_auth_schema.sql',
		'03_sample_contacts.sql',
		'04_add_nickname.sql',
		'05_add_csv_fields.sql',
		'06_add_multiple_fields.sql',
		'07_add_sync_tracking.sql',
		'08_add_structured_address_fields.sql',
		'09_add_contact_photo.sql',
		'10_add_vcard_v3_fields.sql',
		'11_address_books.sql',
		'12_address_book_path_migration_sentinel.sql',
		'13_address_book_readonly.sql',
		'14_composite_users_migration_sentinel.sql',
		'15_soft_delete.sql',
	]
}

/**
 * Create migrations tracking table if it doesn't exist
 */
async function ensureMigrationsTable(): Promise<void> {
	const pool = getPool()
	await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `)
}

/**
 * Get list of already applied migrations
 */
async function getAppliedMigrations(): Promise<string[]> {
	const pool = getPool()
	const result = await pool.query('SELECT name FROM schema_migrations ORDER BY name')
	return result.rows.map(row => row.name)
}

/**
 * Mark a migration as applied
 */
async function markMigrationApplied(name: string): Promise<void> {
	const pool = getPool()
	await pool.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name])
}

/**
 * Verify that required columns from migration 06 exist
 */
async function verifyMigration06Columns(): Promise<boolean> {
	const pool = getPool()
	try {
		const result = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'contacts'
      AND column_name IN ('phones', 'emails', 'addresses', 'urls')
    `)
		const foundColumns = result.rows.map(row => row.column_name)
		const requiredColumns = ['phones', 'emails', 'addresses', 'urls']
		const allExist = requiredColumns.every(col => foundColumns.includes(col))

		if (!allExist) {
			logger.info({ foundColumns, requiredColumns }, 'Migration 06 columns missing')
		}

		return allExist
	} catch (error) {
		logger.error({ err: error }, 'Error verifying migration 06 columns')
		return false
	}
}

/**
 * Read and execute a migration file
 */
async function runMigration(filename: string): Promise<void> {
	const pool = getPool()
	const migrationsDir = getMigrationsDir()
	const filePath = join(migrationsDir, filename)

	try {
		const sql = readFileSync(filePath, 'utf-8')

		// If the SQL already contains its own transaction management, run it directly.
		// Match BEGIN as a standalone statement (not inside strings like 'BEGIN:VCARD').
		const hasTransaction = /^\s*BEGIN\s*;/im.test(sql)

		if (hasTransaction) {
			await pool.query(sql)
		} else {
			// Wrap in a transaction for atomicity — prevents partial migration
			// application from leaving the schema in an inconsistent state.
			const client = await pool.connect()
			try {
				await client.query('BEGIN')
				await client.query(sql)
				await client.query('COMMIT')
			} catch (error) {
				await client.query('ROLLBACK')
				throw error
			} finally {
				client.release()
			}
		}

		logger.info({ filename }, 'Applied migration')
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			// Migration file doesn't exist - this is okay for optional migrations
			logger.info({ filename }, 'Migration file not found (skipping)')
			return
		}
		throw error
	}
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
	try {
		logger.info('Checking database migrations...')

		// Ensure migrations table exists
		await ensureMigrationsTable()

		// Get list of migrations
		const migrationFiles = getMigrationFiles()
		const appliedMigrations = await getAppliedMigrations()

		// Find pending migrations
		let pendingMigrations = migrationFiles.filter(file => !appliedMigrations.includes(file))

		// Verify migration 06 columns exist even if migration is marked as applied
		// This handles cases where migration was marked but didn't actually run
		if (appliedMigrations.includes('06_add_multiple_fields.sql')) {
			const columnsExist = await verifyMigration06Columns()
			if (!columnsExist) {
				logger.info('Migration 06 is marked as applied but columns are missing. Re-running...')
				// Remove from applied list so it runs again
				const pool = getPool()
				await pool.query('DELETE FROM schema_migrations WHERE name = $1', ['06_add_multiple_fields.sql'])
				pendingMigrations.push('06_add_multiple_fields.sql')
				// Re-sort to maintain order
				pendingMigrations = migrationFiles.filter(file => {
					if (file === '06_add_multiple_fields.sql') return true
					return !appliedMigrations.includes(file)
				})
			}
		}

		if (pendingMigrations.length === 0) {
			logger.info('Database is up to date (all migrations applied)')
			return
		}

		logger.info({ count: pendingMigrations.length, migrations: pendingMigrations }, 'Found pending migrations')

		// Run pending migrations in order
		for (const filename of pendingMigrations) {
			logger.info({ filename }, 'Applying migration...')

			try {
				await runMigration(filename)
				await markMigrationApplied(filename)
				logger.info({ filename }, 'Successfully applied migration')
			} catch (error) {
				logger.error({ err: error, filename }, 'Failed to apply migration')
				throw new Error(`Migration ${filename} failed: ${error instanceof Error ? error.message : String(error)}`)
			}
		}

		logger.info('All migrations completed successfully')
	} catch (error) {
		logger.error({ err: error }, 'Migration error')
		throw error
	}
}
