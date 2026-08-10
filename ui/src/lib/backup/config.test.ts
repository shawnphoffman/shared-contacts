import { describe, expect, it } from 'vitest'
import {
	DEFAULT_BACKUP_DIR,
	DEFAULT_BACKUP_INTERVAL_MS,
	DEFAULT_BACKUP_KEEP,
	MIN_BACKUP_INTERVAL_MS,
	getBackupConfig,
	parseBooleanEnv,
	parseCount,
	parseDuration,
} from './config'

describe('parseDuration', () => {
	it('reads bare milliseconds', () => {
		expect(parseDuration('30000')).toBe(30000)
	})

	it('reads suffixed durations', () => {
		expect(parseDuration('500ms')).toBe(500)
		expect(parseDuration('90s')).toBe(90_000)
		expect(parseDuration('30m')).toBe(1_800_000)
		expect(parseDuration('12h')).toBe(43_200_000)
		expect(parseDuration('7d')).toBe(604_800_000)
	})

	it('tolerates whitespace, case, and fractions', () => {
		expect(parseDuration('  1.5H ')).toBe(5_400_000)
	})

	it('returns null for values it cannot understand', () => {
		for (const value of ['', '   ', 'soon', '12 weeks', '-5m', 'h', null, undefined]) {
			expect(parseDuration(value)).toBeNull()
		}
	})
})

describe('parseBooleanEnv', () => {
	it('accepts the usual spellings', () => {
		for (const value of ['1', 'true', 'TRUE', 'yes', 'on']) expect(parseBooleanEnv(value)).toBe(true)
		for (const value of ['0', 'false', 'No', 'off']) expect(parseBooleanEnv(value)).toBe(false)
	})

	it('returns null for anything else', () => {
		expect(parseBooleanEnv('maybe')).toBeNull()
		expect(parseBooleanEnv('')).toBeNull()
		expect(parseBooleanEnv(undefined)).toBeNull()
	})
})

describe('parseCount', () => {
	it('accepts non-negative integers only', () => {
		expect(parseCount('0')).toBe(0)
		expect(parseCount('14')).toBe(14)
		expect(parseCount('-1')).toBeNull()
		expect(parseCount('3.5')).toBeNull()
		expect(parseCount('lots')).toBeNull()
	})
})

describe('getBackupConfig', () => {
	it('defaults to disabled with sane values', () => {
		const config = getBackupConfig({})
		expect(config).toMatchObject({
			enabled: false,
			dir: DEFAULT_BACKUP_DIR,
			intervalMs: DEFAULT_BACKUP_INTERVAL_MS,
			keep: DEFAULT_BACKUP_KEEP,
			warnings: [],
		})
	})

	it('reads a full configuration', () => {
		const config = getBackupConfig({
			BACKUP_ENABLED: 'true',
			BACKUP_DIR: '/var/backups/contacts',
			BACKUP_INTERVAL: '6h',
			BACKUP_KEEP: '30',
		})
		expect(config).toMatchObject({
			enabled: true,
			dir: '/var/backups/contacts',
			intervalMs: 21_600_000,
			keep: 30,
			warnings: [],
		})
	})

	it('clamps an interval below the minimum and says so', () => {
		const config = getBackupConfig({ BACKUP_INTERVAL: '10s' })
		expect(config.intervalMs).toBe(MIN_BACKUP_INTERVAL_MS)
		expect(config.warnings).toHaveLength(1)
		expect(config.warnings[0]).toMatch(/minimum/)
	})

	it('falls back and warns on unparseable values', () => {
		const config = getBackupConfig({
			BACKUP_ENABLED: 'sometimes',
			BACKUP_INTERVAL: 'nightly',
			BACKUP_KEEP: 'a few',
		})
		expect(config.enabled).toBe(false)
		expect(config.intervalMs).toBe(DEFAULT_BACKUP_INTERVAL_MS)
		expect(config.keep).toBe(DEFAULT_BACKUP_KEEP)
		expect(config.warnings).toHaveLength(3)
	})

	it('treats keep=0 as unlimited retention without warning', () => {
		const config = getBackupConfig({ BACKUP_KEEP: '0' })
		expect(config.keep).toBe(0)
		expect(config.warnings).toEqual([])
	})

	it('ignores empty strings rather than treating them as configuration', () => {
		const config = getBackupConfig({ BACKUP_ENABLED: '', BACKUP_DIR: '  ', BACKUP_INTERVAL: '', BACKUP_KEEP: '' })
		expect(config).toMatchObject({
			enabled: false,
			dir: DEFAULT_BACKUP_DIR,
			intervalMs: DEFAULT_BACKUP_INTERVAL_MS,
			keep: DEFAULT_BACKUP_KEEP,
			warnings: [],
		})
	})
})
