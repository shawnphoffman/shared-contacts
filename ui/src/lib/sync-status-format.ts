import { formatRelativeTime } from './relative-time'

/**
 * How the sync status reads in the sidebar. Kept apart from the component so
 * the wording and the thresholds can be tested directly.
 */

export interface SyncStatusResponse {
	syncService: 'ready' | 'not ready' | 'unreachable'
	activity: {
		lastSyncedToRadicaleAt: string | null
		lastSyncedFromRadicaleAt: string | null
		pendingOutbound: number
		recentConflicts: number
	} | null
}

interface Presentation {
	label: string
	detail: string
	dotClass: string
}

export function describeSyncStatus(status: SyncStatusResponse | undefined, now: number = Date.now()): Presentation {
	if (!status) {
		return { label: 'Checking sync…', detail: 'Asking the sync service how it is doing', dotClass: 'bg-muted-foreground/40' }
	}

	if (status.syncService !== 'ready') {
		return {
			label: status.syncService === 'unreachable' ? 'Sync offline' : 'Sync starting…',
			detail:
				status.syncService === 'unreachable'
					? 'The sync service did not answer. Contacts edited here are not reaching devices.'
					: 'The sync service is up but not ready yet.',
			dotClass: status.syncService === 'unreachable' ? 'bg-destructive' : 'bg-amber-500',
		}
	}

	const activity = status.activity
	const lastSynced = formatRelativeTime(activity?.lastSyncedToRadicaleAt, now)

	if (activity && activity.pendingOutbound > 0) {
		return {
			label: `${activity.pendingOutbound} waiting to sync`,
			detail: lastSynced ? `Last write out ${lastSynced}` : 'Nothing has been written out yet',
			dotClass: 'bg-amber-500',
		}
	}

	return {
		label: lastSynced ? `Synced ${lastSynced}` : 'Nothing to sync yet',
		detail: activity?.lastSyncedFromRadicaleAt
			? `Last read back in ${formatRelativeTime(activity.lastSyncedFromRadicaleAt, now)}`
			: 'No changes have come in from a device yet',
		dotClass: 'bg-emerald-500',
	}
}
