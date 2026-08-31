/**
 * Origin checking for state-changing requests.
 *
 * The UI and its admin API have no login: the security model is a trusted
 * network. That leaves the operator's browser as the way in — a page on any
 * other origin they happen to visit can issue requests to this app with no
 * interaction. JSON writes are shielded by the preflight a non-safelisted
 * content type forces, but `POST /api/contacts/import` takes
 * `multipart/form-data`, which is CORS-safelisted and so never preflighted.
 *
 * The wiring lives in `ui/server/middleware/csrf.ts`; the decision is here so
 * it can be tested on its own.
 */

/** Requests that do not change state, and so need no check. */
export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function originOf(value: string): string | null {
	try {
		const url = new URL(value)
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
		return url.origin
	} catch {
		return null
	}
}

export interface OriginCheckInput {
	method: string
	/** Value of the Origin header, if any. */
	origin: string | null
	/** Value of the Referer header, used only when Origin is absent. */
	referer: string | null
	/** Host this request arrived on, as the server sees it. */
	host: string
	/** Extra origins to accept, for a proxy that rewrites the Host header. */
	allowedOrigins?: Array<string>
}

/**
 * A request with neither Origin nor Referer is allowed: curl, container
 * healthchecks and CardDAV clients send neither, while every current browser
 * sends Origin on a cross-origin request, form submissions included. An
 * opaque `Origin: null` (sandboxed iframe, `data:` URL) is not allowed —
 * that is a browser telling us it cannot vouch for the caller.
 */
export function isAllowedOrigin({ method, origin, referer, host, allowedOrigins = [] }: OriginCheckInput): boolean {
	if (SAFE_METHODS.has(method.toUpperCase())) return true

	const claimed = origin ?? referer
	if (claimed === null || claimed === '') return true
	if (claimed === 'null') return false

	const claimedOrigin = originOf(claimed)
	if (!claimedOrigin) return false
	if (allowedOrigins.includes(claimedOrigin)) return true

	return host !== '' && new URL(claimedOrigin).host === host
}

/** Parse a comma-separated allowlist into normalized origins. */
export function parseAllowedOrigins(value: string | undefined): Array<string> {
	return (value || '')
		.split(',')
		.map(entry => entry.trim())
		.map(entry => originOf(entry))
		.filter((entry): entry is string => entry !== null)
}
