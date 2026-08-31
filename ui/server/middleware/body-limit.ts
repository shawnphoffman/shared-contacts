import { assertBodySize, createError, defineEventHandler, isError } from 'h3'

/** Maximum request body size in bytes (10 MB — covers base64-encoded photos and CSV imports). */
const MAX_BODY_BYTES = 10 * 1024 * 1024

export default defineEventHandler(async event => {
	try {
		// Counts bytes off the stream rather than trusting Content-Length. A
		// chunked upload declares no length at all and so skipped the old
		// header-only guard outright, leaving the CSV import free to buffer the
		// whole thing. assertBodySize reads a clone, stops at the limit, and
		// rejects a request that declares both a length and chunked encoding.
		await assertBodySize(event, MAX_BODY_BYTES)
	} catch (error) {
		if (isError(error) && error.status === 413) {
			throw createError({
				statusCode: 413,
				statusMessage: 'Payload Too Large',
				message: `Request body exceeds the ${MAX_BODY_BYTES / 1024 / 1024}MB limit`,
			})
		}
		throw error
	}
})
