import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readdir, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
	BACKUP_FILE_PATTERN,
	InvalidBackupNameError,
	backupBaseName,
	deleteBackup,
	isBackupFileName,
	listBackups,
	pruneBackups,
	resolveBackupPath,
} from './index'
import type { BackupConfig } from './config'

let dir: string

function config(overrides: Partial<BackupConfig> = {}): BackupConfig {
	return { enabled: false, dir, intervalMs: 86_400_000, keep: 7, warnings: [], ...overrides }
}

/** Write an archive-shaped file with a controlled mtime so ordering is deterministic. */
async function seedBackup(name: string, minutesAgo: number, contents = 'x'): Promise<void> {
	const path = join(dir, name)
	writeFileSync(path, contents)
	const when = new Date(Date.UTC(2026, 0, 1, 12, 0, 0) - minutesAgo * 60_000)
	await utimes(path, when, when)
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'backups-test-'))
})

afterEach(() => {
	rmSync(dir, { recursive: true, force: true })
})

describe('backupBaseName', () => {
	it('drops sub-second precision and replaces colons', () => {
		expect(backupBaseName(new Date('2026-08-10T12:34:56.789Z'))).toBe('shared-contacts-backup-2026-08-10T12-34-56Z')
	})

	it('produces a name the listing pattern accepts', () => {
		expect(BACKUP_FILE_PATTERN.test(`${backupBaseName(new Date())}.tar.gz`)).toBe(true)
	})
})

describe('isBackupFileName', () => {
	it('accepts archives this app writes, including collision suffixes', () => {
		expect(isBackupFileName('shared-contacts-backup-2026-08-10T12-34-56Z.tar.gz')).toBe(true)
		expect(isBackupFileName('shared-contacts-backup-2026-08-10T12-34-56Z-2.tar.gz')).toBe(true)
	})

	it('rejects anything else', () => {
		const rejected = [
			'shared-contacts-backup-2026-08-10T12-34-56Z.tar.gz.tmp',
			'shared-contacts-backup-2026-08-10T12-34-56Z.tar',
			'shared-contacts-backup-nope.tar.gz',
			'backup.tar.gz',
			'',
			'.',
			'..',
			'../../etc/passwd',
			'/etc/passwd',
			'sub/shared-contacts-backup-2026-08-10T12-34-56Z.tar.gz',
			'shared-contacts-backup-2026-08-10T12-34-56Z.tar.gz\n',
		]
		for (const name of rejected) {
			expect(isBackupFileName(name), name).toBe(false)
		}
	})
})

describe('resolveBackupPath', () => {
	it('resolves a valid name inside the backup directory', () => {
		const name = 'shared-contacts-backup-2026-08-10T12-34-56Z.tar.gz'
		expect(resolveBackupPath(name, config())).toBe(join(dir, name))
	})

	it('refuses traversal attempts', () => {
		for (const name of ['../../etc/passwd', '..%2Fescape.tar.gz', 'nested/shared-contacts-backup-2026-08-10T12-34-56Z.tar.gz']) {
			expect(() => resolveBackupPath(name, config())).toThrow(InvalidBackupNameError)
		}
	})
})

describe('listBackups', () => {
	it('returns an empty list when the directory does not exist yet', async () => {
		await expect(listBackups(config({ dir: join(dir, 'not-created-yet') }))).resolves.toEqual([])
	})

	it('lists only recognised archives, newest first', async () => {
		await seedBackup('shared-contacts-backup-2026-01-01T09-00-00Z.tar.gz', 180)
		await seedBackup('shared-contacts-backup-2026-01-01T11-00-00Z.tar.gz', 60)
		await seedBackup('shared-contacts-backup-2026-01-01T10-00-00Z.tar.gz', 120)
		// Neither of these is ours.
		await seedBackup('shared-contacts-backup-2026-01-01T12-00-00Z.tar.gz.tmp', 0)
		await seedBackup('notes.txt', 0)

		const backups = await listBackups(config())
		expect(backups.map(backup => backup.name)).toEqual([
			'shared-contacts-backup-2026-01-01T11-00-00Z.tar.gz',
			'shared-contacts-backup-2026-01-01T10-00-00Z.tar.gz',
			'shared-contacts-backup-2026-01-01T09-00-00Z.tar.gz',
		])
		expect(backups[0].size).toBe(1)
	})
})

describe('pruneBackups', () => {
	beforeEach(async () => {
		for (let hour = 1; hour <= 5; hour += 1) {
			await seedBackup(`shared-contacts-backup-2026-01-01T0${hour}-00-00Z.tar.gz`, (6 - hour) * 60)
		}
	})

	it('keeps the newest N and removes the rest', async () => {
		const removed = await pruneBackups(config({ keep: 2 }))
		expect(removed.sort()).toEqual([
			'shared-contacts-backup-2026-01-01T01-00-00Z.tar.gz',
			'shared-contacts-backup-2026-01-01T02-00-00Z.tar.gz',
			'shared-contacts-backup-2026-01-01T03-00-00Z.tar.gz',
		])
		const remaining = await listBackups(config())
		expect(remaining.map(backup => backup.name)).toEqual([
			'shared-contacts-backup-2026-01-01T05-00-00Z.tar.gz',
			'shared-contacts-backup-2026-01-01T04-00-00Z.tar.gz',
		])
	})

	it('removes nothing when there are fewer archives than the limit', async () => {
		await expect(pruneBackups(config({ keep: 10 }))).resolves.toEqual([])
	})

	it('keeps everything when keep is 0', async () => {
		await expect(pruneBackups(config({ keep: 0 }))).resolves.toEqual([])
		expect(await listBackups(config())).toHaveLength(5)
	})

	it('leaves unrelated files alone', async () => {
		await seedBackup('notes.txt', 0)
		await pruneBackups(config({ keep: 1 }))
		expect(await readdir(dir)).toContain('notes.txt')
	})
})

describe('deleteBackup', () => {
	it('deletes a known archive and reports missing ones', async () => {
		const name = 'shared-contacts-backup-2026-01-01T01-00-00Z.tar.gz'
		await seedBackup(name, 0)
		await expect(deleteBackup(name, config())).resolves.toBe(true)
		await expect(deleteBackup(name, config())).resolves.toBe(false)
	})

	it('refuses invalid names before touching the filesystem', async () => {
		await expect(deleteBackup('../../etc/passwd', config())).rejects.toThrow(InvalidBackupNameError)
	})
})
