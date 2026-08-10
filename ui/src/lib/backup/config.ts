/**
 * Scheduled-backup configuration, read from the environment.
 *
 * Deliberately env-only (not `app_settings`): backup behaviour should live
 * with the deployment, not inside the database that is being backed up.
 */

export const DEFAULT_BACKUP_DIR = '/backups'
export const DEFAULT_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000
export const DEFAULT_BACKUP_KEEP = 7

/**
 * Floor for the scheduled interval. Anything shorter is almost always a unit
 * mix-up (`BACKUP_INTERVAL=60` meaning minutes, not milliseconds) and would
 * grind through the retention window in seconds.
 */
export const MIN_BACKUP_INTERVAL_MS = 5 * 60 * 1000

export interface BackupConfig {
	/** Whether the scheduler runs. Manual "run now" works regardless. */
	enabled: boolean
	/** Directory archives are written to. */
	dir: string
	/** Milliseconds between scheduled runs. */
	intervalMs: number
	/** How many archives to retain; 0 keeps every archive. */
	keep: number
	/** Human-readable notes about values that were rejected or clamped. */
	warnings: Array<string>
}

const DURATION_PATTERN = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i

const DURATION_UNITS: Record<string, number> = {
	ms: 1,
	s: 1000,
	m: 60 * 1000,
	h: 60 * 60 * 1000,
	d: 24 * 60 * 60 * 1000,
}

/**
 * Parse a duration written either as bare milliseconds (matching the existing
 * `SYNC_INTERVAL` style) or with a unit suffix: `30m`, `12h`, `7d`.
 * Returns null when the value can't be understood.
 */
export function parseDuration(raw: string | undefined | null): number | null {
	if (raw == null) return null
	const trimmed = raw.trim()
	if (trimmed === '') return null
	const match = DURATION_PATTERN.exec(trimmed)
	if (!match) return null
	// `.at()` rather than indexing: the unit group is optional, and only `at`
	// types the miss as undefined.
	const amount = Number(match.at(1))
	if (!Number.isFinite(amount)) return null
	const unit = (match.at(2) ?? 'ms').toLowerCase()
	return Math.round(amount * DURATION_UNITS[unit])
}

export function parseBooleanEnv(raw: string | undefined | null): boolean | null {
	if (raw == null) return null
	const value = raw.trim().toLowerCase()
	if (value === '') return null
	if (['1', 'true', 'yes', 'on'].includes(value)) return true
	if (['0', 'false', 'no', 'off'].includes(value)) return false
	return null
}

export function parseCount(raw: string | undefined | null): number | null {
	if (raw == null) return null
	const trimmed = raw.trim()
	if (trimmed === '') return null
	if (!/^\d+$/.test(trimmed)) return null
	return Number(trimmed)
}

export function getBackupConfig(env: NodeJS.ProcessEnv = process.env): BackupConfig {
	const warnings: Array<string> = []

	const enabled = parseBooleanEnv(env.BACKUP_ENABLED)
	if (env.BACKUP_ENABLED != null && env.BACKUP_ENABLED.trim() !== '' && enabled === null) {
		warnings.push(`BACKUP_ENABLED="${env.BACKUP_ENABLED}" is not a boolean; scheduled backups are off.`)
	}

	const rawDir = env.BACKUP_DIR?.trim()
	const dir = rawDir ? rawDir : DEFAULT_BACKUP_DIR

	let intervalMs = DEFAULT_BACKUP_INTERVAL_MS
	const parsedInterval = parseDuration(env.BACKUP_INTERVAL)
	if (env.BACKUP_INTERVAL != null && env.BACKUP_INTERVAL.trim() !== '' && parsedInterval === null) {
		warnings.push(`BACKUP_INTERVAL="${env.BACKUP_INTERVAL}" is not a duration; using the ${DEFAULT_BACKUP_INTERVAL_MS}ms default.`)
	} else if (parsedInterval !== null) {
		intervalMs = parsedInterval
	}
	if (intervalMs < MIN_BACKUP_INTERVAL_MS) {
		warnings.push(`BACKUP_INTERVAL of ${intervalMs}ms is below the ${MIN_BACKUP_INTERVAL_MS}ms minimum; using the minimum.`)
		intervalMs = MIN_BACKUP_INTERVAL_MS
	}

	let keep = DEFAULT_BACKUP_KEEP
	const parsedKeep = parseCount(env.BACKUP_KEEP)
	if (env.BACKUP_KEEP != null && env.BACKUP_KEEP.trim() !== '' && parsedKeep === null) {
		warnings.push(`BACKUP_KEEP="${env.BACKUP_KEEP}" is not a non-negative integer; keeping the newest ${DEFAULT_BACKUP_KEEP}.`)
	} else if (parsedKeep !== null) {
		keep = parsedKeep
	}

	return { enabled: enabled ?? false, dir, intervalMs, keep, warnings }
}
