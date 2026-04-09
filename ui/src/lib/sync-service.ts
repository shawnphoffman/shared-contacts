import { logger } from './logger'

const DEFAULT_SYNC_SERVICE_URL = 'http://localhost:3001'
const SYNC_SERVICE_URL = process.env.SYNC_SERVICE_URL || DEFAULT_SYNC_SERVICE_URL

async function parseResponseBody(response: Response) {
	const text = await response.text()
	if (!text) return null
	try {
		return JSON.parse(text)
	} catch {
		return text
	}
}

export async function proxyRequest(path: string, options?: RequestInit) {
	const url = `${SYNC_SERVICE_URL}${path}`
	try {
		logger.info('fetching %s', url)
		const response = await fetch(url, options)
		const data = await parseResponseBody(response)
		logger.info({ data }, 'response data')
		return { data, status: response.status }
	} catch (error) {
		logger.error({ err: error, url }, 'error fetching')
		// if (!process.env.SYNC_SERVICE_URL && SYNC_SERVICE_URL !== FALLBACK_SYNC_SERVICE_URL) {
		//   const fallbackUrl = `${FALLBACK_SYNC_SERVICE_URL}${path}`
		//   const response = await fetch(fallbackUrl, options)
		//   const data = await parseResponseBody(response)
		//   return { data, status: response.status }
		// }
		throw error
	}
}
