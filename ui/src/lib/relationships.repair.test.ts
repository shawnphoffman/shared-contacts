import { describe, expect, it, vi } from 'vitest'

vi.mock('./db', () => ({
	getAppSetting: vi.fn(),
	setAppSetting: vi.fn(),
	tableExists: vi.fn(),
	getPool: vi.fn(),
}))

vi.mock('./logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

/**
 * ensureMergeEdgeRepair caches its promise at module level, so every test
 * resets the module registry and re-imports both the fresh relationships
 * module and the fresh db mock instance it is bound to. Relationships are
 * left disabled (tableExists false) so repairDanglingMergeEdges is a
 * guaranteed no-op and only the sentinel/caching shell is exercised.
 */
const fresh = async () => {
	vi.resetModules()
	vi.clearAllMocks()
	const db = vi.mocked(await import('./db'))
	db.tableExists.mockResolvedValue(false)
	db.getAppSetting.mockResolvedValue(null)
	db.setAppSetting.mockResolvedValue(undefined)
	const { ensureMergeEdgeRepair } = await import('./relationships')
	return { ensure: ensureMergeEdgeRepair, db }
}

describe('ensureMergeEdgeRepair', () => {
	it('runs the repair once and records the sentinel', async () => {
		const { ensure, db } = await fresh()
		await ensure()
		expect(db.getAppSetting).toHaveBeenCalledWith('relationship_merge_edge_repair_done')
		expect(db.setAppSetting).toHaveBeenCalledTimes(1)
		expect(db.setAppSetting).toHaveBeenCalledWith('relationship_merge_edge_repair_done', expect.any(String))
	})

	it('skips the repair entirely when the sentinel is already set', async () => {
		const { ensure, db } = await fresh()
		db.getAppSetting.mockResolvedValue('2026-08-04T00:00:00.000Z')
		await ensure()
		expect(db.tableExists).not.toHaveBeenCalled()
		expect(db.setAppSetting).not.toHaveBeenCalled()
	})

	it('caches the outcome in-process so later calls cost nothing', async () => {
		const { ensure, db } = await fresh()
		await ensure()
		await ensure()
		expect(db.getAppSetting).toHaveBeenCalledTimes(1)
		expect(db.setAppSetting).toHaveBeenCalledTimes(1)
	})

	it('never throws on failure and retries on the next call', async () => {
		const { ensure, db } = await fresh()
		db.getAppSetting.mockRejectedValueOnce(new Error('db down'))
		await expect(ensure()).resolves.toBeUndefined()
		expect(db.setAppSetting).not.toHaveBeenCalled()

		await ensure()
		expect(db.getAppSetting).toHaveBeenCalledTimes(2)
		expect(db.setAppSetting).toHaveBeenCalledTimes(1)
	})
})
