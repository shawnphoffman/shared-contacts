import { createError, defineEventHandler, getHeader } from 'h3'

/** Maximum request body size in bytes (5 MB — covers base64-encoded photos in JSON). */
const MAX_BODY_BYTES = 5 * 1024 * 1024

export default defineEventHandler(event => {
	const contentLength = getHeader(event, 'content-length')
	if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
		throw createError({
			statusCode: 413,
			statusMessage: 'Payload Too Large',
			message: `Request body exceeds the ${MAX_BODY_BYTES / 1024 / 1024}MB limit`,
		})
	}
})
