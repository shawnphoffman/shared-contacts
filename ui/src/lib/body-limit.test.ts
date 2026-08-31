import { describe, expect, it } from 'vitest'
import { H3, toWebHandler } from 'h3'
import bodyLimitMiddleware from '../../server/middleware/body-limit'

const MAX_BODY_BYTES = 10 * 1024 * 1024

const app = new H3()
app.use(bodyLimitMiddleware)
app.post('/api/contacts/import', async event => ({ received: (await event.req.text()).length }))
const handler = toWebHandler(app)

/** A chunked upload: a stream body carries no Content-Length. */
function streamed(totalBytes: number): ReadableStream<Uint8Array> {
	const chunkSize = 64 * 1024
	let sent = 0
	return new ReadableStream({
		pull(controller) {
			if (sent >= totalBytes) return controller.close()
			const size = Math.min(chunkSize, totalBytes - sent)
			sent += size
			controller.enqueue(new Uint8Array(size))
		},
	})
}

const post = (body: BodyInit, init: RequestInit = {}) =>
	handler(new Request('http://localhost:3030/api/contacts/import', { method: 'POST', body, duplex: 'half', ...init } as RequestInit))

describe('the body-limit middleware', () => {
	it('passes a normal body through intact', async () => {
		const response = await post('name,email\r\nShawn,shawn@example.com')
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({ received: 35 })
	})

	it('rejects an oversized body that declares its length', async () => {
		const response = await post('x'.repeat(MAX_BODY_BYTES + 1))
		expect(response.status).toBe(413)
	})

	it('rejects an oversized body that declares no length', async () => {
		// The bypass: Content-Length is absent on a chunked upload, so a
		// header-only check waved it through.
		const response = await post(streamed(MAX_BODY_BYTES + 64 * 1024))
		expect(response.status).toBe(413)
	})

	it('still accepts a streamed body under the limit', async () => {
		const response = await post(streamed(128 * 1024))
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({ received: 131072 })
	})
})
