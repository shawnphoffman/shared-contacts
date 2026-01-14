import { getPool } from './db'
import { readFileSync } from 'fs'
import { join } from 'path'

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
			console.log(`⚠ Migration 06 columns missing. Found: ${foundColumns.join(', ')}, Required: ${requiredColumns.join(', ')}`)
		}

		return allExist
	} catch (error) {
		console.error('Error verifying migration 06 columns:', error)
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
		// Execute the migration SQL
		await pool.query(sql)
		console.log(`✓ Applied migration: ${filename}`)
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			// Migration file doesn't exist - this is okay for optional migrations
			console.log(`⚠ Migration file not found: ${filename} (skipping)`)
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
		console.log('Checking database migrations...')

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
				console.log('⚠ Migration 06 is marked as applied but columns are missing. Re-running...')
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
			console.log('✓ Database is up to date (all migrations applied)')
			return
		}

		console.log(`Found ${pendingMigrations.length} pending migration(s): ${pendingMigrations.join(', ')}`)

		// Run pending migrations in order
		for (const filename of pendingMigrations) {
			const migrationName = filename.replace('.sql', '')
			console.log(`Applying migration: ${filename}...`)

			try {
				await runMigration(filename)
				await markMigrationApplied(filename)
				console.log(`✓ Successfully applied: ${filename}`)
			} catch (error) {
				console.error(`✗ Failed to apply migration ${filename}:`, error)
				throw new Error(`Migration ${filename} failed: ${error instanceof Error ? error.message : String(error)}`)
			}
		}

		console.log('✓ All migrations completed successfully')
	} catch (error) {
		console.error('Migration error:', error)
		throw error
	}
}
