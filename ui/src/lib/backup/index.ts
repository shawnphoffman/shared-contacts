import { mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { getAppVersion } from '../app-version'
import { contactsToVcf } from '../contact-export'
import { contactsToCsv } from '../csv'
import { getAllContacts } from '../db'
import { logger } from '../logger'
import { getBackupConfig } from './config'
import { buildSnapshot } from './snapshot'
import { backupState } from './state'
import { createTarGz } from './tar'
import type { BackupConfig } from './config'

export const BACKUP_FILE_PREFIX = 'shared-contacts-backup-'
export const BACKUP_FILE_SUFFIX = '.tar.gz'

/**
 * Only files this app produced are listed, downloaded, or deleted. The pattern
 * is also the path-traversal guard for the `:name` routes — it admits no
 * slashes, no `..`, and no leading dot.
 */
export const BACKUP_FILE_PATTERN = /^shared-contacts-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z(?:-\d+)?\.tar\.gz$/

export interface BackupFile {
	name: string
	/** Archive size in bytes. */
	size: number
	/** ISO timestamp, taken from the file's mtime. */
	createdAt: string
}

export interface BackupRun extends BackupFile {
	durationMs: number
	/** Row counts per snapshotted table. */
	counts: Record<string, number>
	/** Contacts written to `contacts.vcf` / `contacts.csv` (excludes trashed). */
	contactCount: number
	/** Tables in the snapshot list that this database doesn't have. */
	skippedTables: Array<string>
	/** Archives removed by retention during this run. */
	pruned: Array<string>
}

export type BackupLastRun =
	| { status: 'success'; finishedAt: string; run: BackupRun }
	| { status: 'error'; finishedAt: string; message: string }

export class InvalidBackupNameError extends Error {
	constructor(name: string) {
		super(`"${name}" is not a valid backup filename`)
		this.name = 'InvalidBackupNameError'
	}
}

export function getLastBackupRun(): BackupLastRun | null {
	return backupState().lastRun
}

export function isBackupFileName(name: string): boolean {
	return BACKUP_FILE_PATTERN.test(name)
}

/** `shared-contacts-backup-2026-08-10T12-34-56Z` — colons are filename-hostile. */
export function backupBaseName(date: Date): string {
	const stamp = date
		.toISOString()
		.replace(/\.\d+Z$/, 'Z')
		.replace(/:/g, '-')
	return `${BACKUP_FILE_PREFIX}${stamp}`
}

function isNotFound(error: unknown): boolean {
	return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

/**
 * Resolve a user-supplied archive name to an absolute path inside the backup
 * directory, or throw. Two independent checks: the strict filename pattern, and
 * a re-assertion that the resolved path's parent really is the backup dir.
 */
export function resolveBackupPath(name: string, config: BackupConfig = getBackupConfig()): string {
	if (!isBackupFileName(name)) throw new InvalidBackupNameError(name)
	const dir = resolve(config.dir)
	const target = resolve(dir, name)
	if (dirname(target) !== dir) throw new InvalidBackupNameError(name)
	return target
}

export async function listBackups(config: BackupConfig = getBackupConfig()): Promise<Array<BackupFile>> {
	let entries
	try {
		entries = await readdir(config.dir, { withFileTypes: true })
	} catch (error) {
		// A backup dir that doesn't exist yet is an empty list, not an error;
		// it gets created on the first run.
		if (isNotFound(error)) return []
		throw error
	}

	const files: Array<BackupFile> = []
	for (const entry of entries) {
		if (!entry.isFile() || !isBackupFileName(entry.name)) continue
		try {
			const info = await stat(join(config.dir, entry.name))
			files.push({ name: entry.name, size: info.size, createdAt: info.mtime.toISOString() })
		} catch (error) {
			if (!isNotFound(error)) throw error
		}
	}

	return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name))
}

/** Delete all but the newest `keep` archives. `keep: 0` retains everything. */
export async function pruneBackups(config: BackupConfig = getBackupConfig()): Promise<Array<string>> {
	if (config.keep <= 0) return []

	const backups = await listBackups(config)
	const removed: Array<string> = []
	for (const backup of backups.slice(config.keep)) {
		try {
			await unlink(join(config.dir, backup.name))
			removed.push(backup.name)
		} catch (error) {
			// A failed prune must not fail the backup that just succeeded.
			logger.error({ err: error, backup: backup.name }, 'Failed to prune old backup')
		}
	}
	return removed
}

export async function deleteBackup(name: string, config: BackupConfig = getBackupConfig()): Promise<boolean> {
	const target = resolveBackupPath(name, config)
	try {
		await unlink(target)
		return true
	} catch (error) {
		if (isNotFound(error)) return false
		throw error
	}
}

async function nextAvailableName(dir: string, base: string): Promise<string> {
	let candidate = `${base}${BACKUP_FILE_SUFFIX}`
	let counter = 2
	// Two runs inside the same second (a scheduled run racing a manual one that
	// slipped past the in-flight guard) would otherwise collide.
	for (;;) {
		try {
			await stat(join(dir, candidate))
		} catch (error) {
			if (isNotFound(error)) return candidate
			throw error
		}
		candidate = `${base}-${counter}${BACKUP_FILE_SUFFIX}`
		counter += 1
	}
}

function archiveReadme(snapshotVersion: number): string {
	return [
		'Shared Contacts backup',
		'======================',
		'',
		'snapshot.json  Full logical dump of every application table (address books,',
		'               book assignments, contacts including trashed ones, the',
		'               relationship graph, change history and app settings).',
		`               Format version ${snapshotVersion}. "bytea" columns such as contact`,
		'               photos are wrapped as {"$binary": "<base64>"}.',
		'contacts.vcf   Every non-deleted contact as vCard, with RELATED entries.',
		'               Importable into Contacts.app, Google Contacts, etc.',
		'contacts.csv   The same contacts in the CSV shape this app imports.',
		'',
		'Radicale user credentials live in /data/users on the server and are NOT',
		'part of this archive. Back that file up separately.',
		'',
		'Inspect with:  tar -xzf <archive> && jq . <dir>/snapshot.json',
		'',
	].join('\n')
}

async function performBackup(config: BackupConfig): Promise<BackupRun> {
	const startedAt = Date.now()
	await mkdir(config.dir, { recursive: true })

	const snapshot = await buildSnapshot(getAppVersion())
	const contacts = await getAllContacts()
	const vcf = await contactsToVcf(contacts)
	const csv = contactsToCsv(contacts)

	const fileName = await nextAvailableName(config.dir, backupBaseName(new Date()))
	// Entries live under one directory so extracting doesn't spray the cwd.
	const root = fileName.slice(0, -BACKUP_FILE_SUFFIX.length)
	const mtime = new Date()

	// Built in memory: these archives are single-digit MB for a personal
	// address book, and streaming would buy nothing but complexity here.
	const archive = createTarGz([
		{ name: root, directory: true, mtime },
		{ name: `${root}/README.txt`, data: archiveReadme(snapshot.version), mtime },
		{ name: `${root}/snapshot.json`, data: JSON.stringify(snapshot, null, '\t'), mtime },
		{ name: `${root}/contacts.vcf`, data: vcf, mtime },
		{ name: `${root}/contacts.csv`, data: csv, mtime },
	])

	const target = join(config.dir, fileName)
	const tmpTarget = `${target}.tmp`
	try {
		// Write-then-rename so a crash mid-write can't leave a truncated archive
		// that looks like a valid backup. `.tmp` doesn't match the listing
		// pattern, so a leftover is invisible rather than misleading.
		await writeFile(tmpTarget, archive)
		await rename(tmpTarget, target)
	} catch (error) {
		await unlink(tmpTarget).catch(() => undefined)
		throw error
	}

	const pruned = await pruneBackups(config)

	const run: BackupRun = {
		name: fileName,
		size: archive.length,
		createdAt: mtime.toISOString(),
		durationMs: Date.now() - startedAt,
		counts: snapshot.counts,
		contactCount: contacts.length,
		skippedTables: snapshot.skippedTables,
		pruned,
	}
	logger.info({ backup: run.name, size: run.size, durationMs: run.durationMs, pruned }, 'Backup written')
	return run
}

/**
 * Run a backup now. Concurrent callers (a manual "run now" landing on top of a
 * scheduled run) share the in-flight run rather than producing two archives.
 */
export function runBackup(config: BackupConfig = getBackupConfig()): Promise<BackupRun> {
	const state = backupState()
	if (state.inFlight) return state.inFlight

	state.inFlight = performBackup(config)
		.then(run => {
			state.lastRun = { status: 'success', finishedAt: new Date().toISOString(), run }
			return run
		})
		.catch(error => {
			const message = error instanceof Error ? error.message : String(error)
			state.lastRun = { status: 'error', finishedAt: new Date().toISOString(), message }
			logger.error({ err: error }, 'Backup failed')
			throw error
		})
		.finally(() => {
			state.inFlight = null
		})

	return state.inFlight
}
