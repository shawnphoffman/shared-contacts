import type { BackupLastRun, BackupRun } from './index'

/**
 * Mutable backup state, parked on `globalThis` rather than in module scope.
 *
 * The bundler emits the backup modules into more than one server chunk — the
 * startup plugin lands in the server entry, the `/api/backups` handlers in a
 * lazily-loaded route chunk — so plain module-level `let`s would give the
 * scheduler and the API separate copies: the API would report the scheduler as
 * stopped, never see a scheduled run's result, and the "one run at a time"
 * guard would not span the two. A symbol on `globalThis` is shared by every
 * copy, and also survives the dev server re-evaluating modules.
 */

export interface BackupState {
	/** Outcome of the most recent run, scheduled or manual. */
	lastRun: BackupLastRun | null
	/** The run currently executing, so concurrent callers can share it. */
	inFlight: Promise<BackupRun> | null
	timer: NodeJS.Timeout | null
	started: boolean
	/** Epoch millis of the next scheduled run. */
	nextRunAt: number | null
}

const STATE_KEY = Symbol.for('shared-contacts.backup.state')

type StateHolder = typeof globalThis & { [STATE_KEY]?: BackupState }

export function backupState(): BackupState {
	const holder = globalThis as StateHolder
	holder[STATE_KEY] ??= {
		lastRun: null,
		inFlight: null,
		timer: null,
		started: false,
		nextRunAt: null,
	}
	return holder[STATE_KEY]
}
