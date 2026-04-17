import { logger } from './logger'

const DEFAULT_SYNC_SERVICE_URL = 'http://localhost:3001'
const SYNC_SERVICE_URL = process.env.SYNC_SERVICE_URL || DEFAULT_SYNC_SERVICE_URL
const DEFAULT_TIMEOUT_MS = 10_000

export interface ProxyRequestOptions extends RequestInit {
	/**
	 * Per-request timeout in ms. Without this the fetch can hang past the
	 * Docker healthcheck window and leave the container marked unhealthy.
	 */
	timeoutMs?: number
}

async function parseResponseBody(response: Response) {
	const text = await response.text()
	if (!text) return null
	try {
		return JSON.parse(text)
	} catch {
		return text
	}
}

export async function proxyRequest(path: string, options?: ProxyRequestOptions) {
	const url = `${SYNC_SERVICE_URL}${path}`
	const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...rest } = options ?? {}
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(new Error(`Request to ${url} timed out after ${timeoutMs}ms`)), timeoutMs)

	// If the caller also supplied an abort signal, chain it to ours so either
	// can cancel the fetch.
	if (callerSignal) {
		if (callerSignal.aborted) {
			controller.abort(callerSignal.reason)
		} else {
			callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason), { once: true })
		}
	}

	try {
		logger.info('fetching %s', url)
		const response = await fetch(url, { ...rest, signal: controller.signal })
		const data = await parseResponseBody(response)
		logger.info({ data }, 'response data')
		return { data, status: response.status }
	} catch (error) {
		logger.error({ err: error, url }, 'error fetching')
		throw error
	} finally {
		clearTimeout(timeoutId)
	}
}
