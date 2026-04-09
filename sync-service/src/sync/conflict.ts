import * as crypto from 'crypto'
import { Contact } from '../db'

export interface ConflictInfo {
	hasConflict: boolean
	dbNewer: boolean
	radicaleNewer: boolean
	dbTimestamp: Date
	radicaleTimestamp: Date
}

/**
 * Calculate SHA256 hash of vCard content for change detection
 */
export function calculateVCardHash(vcardContent: string): string {
	return crypto.createHash('sha256').update(vcardContent, 'utf8').digest('hex')
}

/**
 * Detect if there's a conflict between DB and Radicale versions
 * A conflict exists when both sides have been modified since the last sync
 * @param syncDirection 'db-to-radicale' or 'radicale-to-db' - determines which timestamps to use
 */
export function detectConflict(
	contact: Contact,
	radicaleFileMtime: Date | null,
	radicaleHash: string,
	syncDirection: 'db-to-radicale' | 'radicale-to-db'
): ConflictInfo {
	const dbTimestamp = contact.updated_at
	const radicaleTimestamp = radicaleFileMtime || new Date(0)

	let dbModifiedAfterSync: boolean
	let radicaleModifiedAfterSync: boolean

	if (syncDirection === 'db-to-radicale') {
		// When syncing DB → Radicale:
		// - Check if DB was modified after we last sent TO Radicale
		// - Check if Radicale was modified after we last received FROM Radicale
		dbModifiedAfterSync = contact.last_synced_to_radicale_at ? dbTimestamp > contact.last_synced_to_radicale_at : true // If never synced, assume modified
		radicaleModifiedAfterSync = contact.last_synced_from_radicale_at ? radicaleTimestamp > contact.last_synced_from_radicale_at : true // If never synced, assume modified
	} else {
		// When syncing Radicale → DB:
		// - Check if DB was modified after we last received FROM Radicale
		// - Check if Radicale was modified after we last received FROM Radicale
		dbModifiedAfterSync = contact.last_synced_from_radicale_at ? dbTimestamp > contact.last_synced_from_radicale_at : true // If never synced, assume modified
		radicaleModifiedAfterSync = contact.last_synced_from_radicale_at ? radicaleTimestamp > contact.last_synced_from_radicale_at : true // If never synced, assume modified
	}

	// Conflict exists if both sides modified AND hashes differ
	const hasConflict = dbModifiedAfterSync && radicaleModifiedAfterSync && contact.vcard_hash !== null && contact.vcard_hash !== radicaleHash

	return {
		hasConflict,
		dbNewer: dbTimestamp > radicaleTimestamp,
		radicaleNewer: radicaleTimestamp > dbTimestamp,
		dbTimestamp,
		radicaleTimestamp,
	}
}

/**
 * Resolve conflict using last-write-wins strategy
 * Returns 'db' if DB version should be used, 'radicale' if Radicale version should be used
 */
export function resolveConflict(conflict: ConflictInfo): 'db' | 'radicale' {
	// Last-write-wins: use the most recent timestamp
	return conflict.dbNewer ? 'db' : 'radicale'
}
