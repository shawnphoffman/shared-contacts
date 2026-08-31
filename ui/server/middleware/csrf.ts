import { createError, defineEventHandler, getHeader, getRequestURL } from 'h3'
import { isAllowedOrigin, parseAllowedOrigins } from '../../src/lib/csrf'

/**
 * Reject cross-origin state-changing requests. See src/lib/csrf.ts for why
 * this exists and what it deliberately lets through.
 *
 * Set UI_ALLOWED_ORIGINS (comma-separated) when the UI is served on an origin
 * the request's own Host header does not report.
 */
const allowedOrigins = parseAllowedOrigins(process.env.UI_ALLOWED_ORIGINS)

export default defineEventHandler(event => {
	const allowed = isAllowedOrigin({
		method: event.req.method || 'GET',
		origin: getHeader(event, 'origin') ?? null,
		referer: getHeader(event, 'referer') ?? null,
		// getRequestURL rather than getRequestHost: it falls back to the request
		// URL's host instead of an empty string when no Host header reaches us,
		// which would otherwise fail every write closed. X-Forwarded-Host is not
		// a safelisted header, so a hostile page cannot set it on a request the
		// browser makes without a preflight.
		host: getRequestURL(event, { xForwardedHost: true }).host,
		allowedOrigins,
	})

	if (!allowed) {
		throw createError({
			statusCode: 403,
			statusMessage: 'Forbidden',
			message: 'Cross-origin request rejected',
		})
	}
})
