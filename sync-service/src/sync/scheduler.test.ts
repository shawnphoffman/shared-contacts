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

vi.mock('./db-to-radicale', () => ({ syncDbToRadicale: (...args: Array<unknown>) => syncDbToRadicale(...args) }))
vi.mock('./radicale-to-db', () => ({ syncRadicaleToDb: (...args: Array<unknown>) => syncRadicaleToDb(...args) }))

import { startPeriodicSync } from './scheduler'

/** Let the tick's awaited promises settle between timer advances. */
async function tick() {
	await vi.advanceTimersByTimeAsync(1000)
}

beforeEach(() => {
	vi.useFakeTimers()
	syncDbToRadicale.mockClear().mockResolvedValue(undefined)
	syncRadicaleToDb.mockClear().mockResolvedValue(undefined)
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
		expect(syncRadicaleToDb.mock.invocationCallOrder[0]).toBeLessThan(syncDbToRadicale.mock.invocationCallOrder[0])
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
