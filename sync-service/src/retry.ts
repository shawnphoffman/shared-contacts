import { logger } from './logger'

export interface RetryOptions {
	/** Maximum number of attempts. Default: Infinity (retry forever). */
	maxAttempts?: number
	/** Delay before the second attempt, in ms. Default: 500. */
	initialDelayMs?: number
	/** Upper bound for the delay between attempts, in ms. Default: 30_000. */
	maxDelayMs?: number
	/** Multiplier applied to the delay after each failure. Default: 2. */
	factor?: number
	/** Whether to randomise the delay to avoid thundering herd. Default: true. */
	jitter?: boolean
	/** Label used in log messages. Default: 'operation'. */
	label?: string
	/**
	 * Predicate that decides whether an error is worth retrying. Non-retryable
	 * errors are re-thrown immediately. Default: always retry.
	 */
	isRetryable?: (err: unknown) => boolean
}

/**
 * Run `fn` with exponential backoff. Retries forever by default; callers that
 * want a hard cap must pass `maxAttempts`. A predicate (`isRetryable`) lets
 * callers distinguish transient failures (network blips, Postgres restarting)
 * from programming errors that should surface immediately.
 */
export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
	const maxAttempts = opts.maxAttempts ?? Infinity
	const initial = opts.initialDelayMs ?? 500
	const max = opts.maxDelayMs ?? 30_000
	const factor = opts.factor ?? 2
	const jitter = opts.jitter ?? true
	const label = opts.label ?? 'operation'
	const isRetryable = opts.isRetryable ?? (() => true)

	let attempt = 0
	let delay = initial
	for (;;) {
		attempt++
		try {
			return await fn()
		} catch (err) {
			if (attempt >= maxAttempts || !isRetryable(err)) throw err
			const sleepMs = jitter ? Math.floor(delay * (0.5 + Math.random())) : delay
			logger.warn({ err, attempt, delayMs: sleepMs, label }, `${label} failed, retrying`)
			await new Promise(resolve => setTimeout(resolve, sleepMs))
			delay = Math.min(delay * factor, max)
		}
	}
}

// Postgres error classes that indicate transient, retryable conditions.
// Reference: https://www.postgresql.org/docs/current/errcodes-appendix.html
// Class 08 — connection exceptions, Class 57 — operator intervention, Class 53 — insufficient resources
const TRANSIENT_PG_CODES = new Set([
	'08000', // connection_exception
	'08001', // sqlclient_unable_to_establish_sqlconnection
	'08003', // connection_does_not_exist
	'08004', // sqlserver_rejected_establishment_of_sqlconnection
	'08006', // connection_failure
	'08007', // transaction_resolution_unknown
	'08P01', // protocol_violation
	'57P01', // admin_shutdown — the error from the crash we're fixing
	'57P02', // crash_shutdown
	'57P03', // cannot_connect_now
	'53300', // too_many_connections
	'53400', // configuration_limit_exceeded
])

const TRANSIENT_SYSTEM_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND'])

/**
 * Heuristic: is this error the kind we can recover from by waiting and trying
 * again? Used by pg-dependent retry loops so programming errors (bad SQL,
 * missing columns) bubble up instead of spinning forever.
 */
export function isTransientDbError(err: unknown): boolean {
	if (!err || typeof err !== 'object') return false
	const code = (err as { code?: unknown }).code
	if (typeof code === 'string') {
		if (TRANSIENT_PG_CODES.has(code)) return true
		if (TRANSIENT_SYSTEM_CODES.has(code)) return true
	}
	const message = String((err as { message?: unknown }).message ?? '')
	if (/terminating connection|Connection terminated|server closed the connection|the database system is (starting up|shutting down)/i.test(message)) {
		return true
	}
	return false
}
