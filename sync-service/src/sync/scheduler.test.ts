import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('./constants', async importOriginal => ({
	...(await importOriginal<typeof import('./constants')>()),
	SYNC_INTERVAL: 1000,
}))

const syncDbToRadicale = vi.fn().mockResolvedValue(undefined)
const syncRadicaleToDb = vi.fn().mockResolvedValue(undefined)

const refreshRadicaleWatchers = vi.fn().mockResolvedValue(0)

vi.mock('./db-to-radicale', () => ({ syncDbToRadicale: (...args: Array<unknown>) => syncDbToRadicale(...args) }))
vi.mock('./radicale-to-db', () => ({ syncRadicaleToDb: (...args: Array<unknown>) => syncRadicaleToDb(...args) }))
vi.mock('./watcher', () => ({ refreshRadicaleWatchers: () => refreshRadicaleWatchers() }))

import { startPeriodicSync } from './scheduler'

/** Let the tick's awaited promises settle between timer advances. */
async function tick() {
	await vi.advanceTimersByTimeAsync(1000)
}

beforeEach(() => {
	vi.useFakeTimers()
	syncDbToRadicale.mockClear().mockResolvedValue(undefined)
	syncRadicaleToDb.mockClear().mockResolvedValue(undefined)
	refreshRadicaleWatchers.mockClear().mockResolvedValue(0)
})

afterEach(() => {
	vi.clearAllTimers()
	vi.useRealTimers()
})

describe('the periodic sync tick', () => {
	it('reconciles inbound as well as outbound', async () => {
		// The tick used to be outbound-only, so an edit made on a device whose
		// watcher event went missing sat in Radicale until the next restart.
		startPeriodicSync()
		await tick()

		expect(syncRadicaleToDb).toHaveBeenCalledTimes(1)
		expect(syncDbToRadicale).toHaveBeenCalledTimes(1)
	})

	it('reads in before writing back out', async () => {
		// Not cosmetic. The outbound pass decides conflicts against the master
		// mirror, which is stale for a card a client edited but nothing has
		// ingested yet - the case this tick exists to cover - so going outbound
		// first would overwrite that edit before inbound ever read it.
		startPeriodicSync()
		await tick()

		expect(syncRadicaleToDb.mock.invocationCallOrder[0]).toBeLessThan(syncDbToRadicale.mock.invocationCallOrder[0])
	})

	it('picks up collections created since the last tick', async () => {
		// Watching was a one-shot at boot, so a book or account created later was
		// never watched at all.
		startPeriodicSync()
		await tick()

		expect(refreshRadicaleWatchers).toHaveBeenCalledTimes(1)
		expect(refreshRadicaleWatchers.mock.invocationCallOrder[0]).toBeLessThan(syncRadicaleToDb.mock.invocationCallOrder[0])
	})

	it('still syncs when the watcher refresh fails', async () => {
		refreshRadicaleWatchers.mockRejectedValueOnce(new Error('cannot read collection root'))
		startPeriodicSync()
		await tick()

		expect(syncRadicaleToDb).toHaveBeenCalledTimes(1)
		expect(syncDbToRadicale).toHaveBeenCalledTimes(1)
	})

	it('keeps writing cards out when the inbound pass fails', async () => {
		syncRadicaleToDb.mockRejectedValueOnce(new Error('db went away mid-sweep'))
		startPeriodicSync()
		await tick()

		expect(syncDbToRadicale).toHaveBeenCalledTimes(1)
	})

	it('recovers on the next tick after a failure', async () => {
		syncRadicaleToDb.mockRejectedValueOnce(new Error('transient'))
		startPeriodicSync()
		await tick()
		await tick()

		expect(syncRadicaleToDb).toHaveBeenCalledTimes(2)
		expect(syncDbToRadicale).toHaveBeenCalledTimes(2)
	})

	it('does not start a second pass while one is still running', async () => {
		let release: (() => void) | undefined
		syncDbToRadicale.mockImplementationOnce(() => new Promise<void>(resolve => (release = resolve)))
		startPeriodicSync()

		await tick()
		await tick()
		expect(syncRadicaleToDb).toHaveBeenCalledTimes(1)

		release?.()
		await vi.advanceTimersByTimeAsync(0)
		await tick()
		expect(syncRadicaleToDb).toHaveBeenCalledTimes(2)
	})
})
