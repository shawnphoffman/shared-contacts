import { describe, expect, it } from 'vitest'
import { describeSyncStatus } from './sync-status-format'

const now = Date.parse('2026-08-31T12:00:00.000Z')
const minutesAgo = (n: number) => new Date(now - n * 60_000).toISOString()

const activity = {
	lastSyncedToRadicaleAt: minutesAgo(2),
	lastSyncedFromRadicaleAt: minutesAgo(3),
	pendingOutbound: 0,
	recentConflicts: 0,
}

describe('describeSyncStatus', () => {
	it('says when the sync service did not answer', () => {
		// The case worth surfacing: edits made here are going nowhere, and
		// nothing in the UI used to say so.
		const status = describeSyncStatus({ syncService: 'unreachable', activity: null }, now)
		expect(status.label).toBe('Sync offline')
		expect(status.dotClass).toContain('destructive')
	})

	it('distinguishes still-starting from unreachable', () => {
		expect(describeSyncStatus({ syncService: 'not ready', activity: null }, now).label).toBe('Sync starting…')
	})

	it('reports how long ago the last write out was', () => {
		expect(describeSyncStatus({ syncService: 'ready', activity }, now).label).toBe('Synced 2m ago')
	})

	it('counts what is still waiting rather than claiming everything is synced', () => {
		const status = describeSyncStatus({ syncService: 'ready', activity: { ...activity, pendingOutbound: 3 } }, now)
		expect(status.label).toBe('3 waiting to sync')
	})

	it('handles a database that has never synced', () => {
		const status = describeSyncStatus(
			{ syncService: 'ready', activity: { ...activity, lastSyncedToRadicaleAt: null, lastSyncedFromRadicaleAt: null } },
			now
		)
		expect(status.label).toBe('Nothing to sync yet')
	})

	it('shows a neutral state before the first response arrives', () => {
		expect(describeSyncStatus(undefined, now).label).toBe('Checking sync…')
	})
})
