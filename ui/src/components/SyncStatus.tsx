import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { describeSyncStatus } from '../lib/sync-status-format'
import type { SyncStatusResponse } from '../lib/sync-status-format'

/**
 * Whether contacts are actually reaching devices.
 *
 * There was no sign of this anywhere in the UI: a stalled sync service looked
 * exactly like a quiet one, and a conflict that discarded someone's edit was
 * visible only in the container logs.
 */

async function fetchSyncStatus(): Promise<SyncStatusResponse> {
	const response = await fetch('/api/sync-status')
	if (!response.ok) throw new Error('Failed to fetch sync status')
	return response.json()
}

export function SyncStatus() {
	const { data } = useQuery({
		queryKey: ['sync-status'],
		queryFn: fetchSyncStatus,
		// Often enough to notice a stall, rarely enough to stay out of the way.
		refetchInterval: 30_000,
		staleTime: 15_000,
	})

	const { label, detail, dotClass } = describeSyncStatus(data)
	const conflicts = data?.activity?.recentConflicts ?? 0

	return (
		<div className="px-2 py-1.5 text-xs text-sidebar-foreground/70">
			<div className="flex items-center gap-2" title={detail}>
				<span className={`size-2 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
				<span className="truncate">{label}</span>
			</div>
			{conflicts > 0 && (
				<Link
					to="/history"
					search={{ contactId: undefined }}
					className="mt-1 flex items-center gap-2 rounded-md px-0.5 py-0.5 text-amber-600 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50 dark:text-amber-500"
					title="Last-write-wins discarded an edit. Open the history to see which."
				>
					{conflicts} conflict{conflicts === 1 ? '' : 's'} today
				</Link>
			)}
		</div>
	)
}
