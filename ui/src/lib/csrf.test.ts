import { describe, expect, it } from 'vitest'
import { H3, toWebHandler } from 'h3'
import csrfMiddleware from '../../server/middleware/csrf'
import { isAllowedOrigin, parseAllowedOrigins } from './csrf'

const base = { method: 'POST', origin: null, referer: null, host: 'contacts.example.com' }

describe('isAllowedOrigin', () => {
	it('allows reads regardless of origin', () => {
		for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
			expect(isAllowedOrigin({ ...base, method, origin: 'https://evil.example' })).toBe(true)
		}
	})

	it('allows a same-origin write', () => {
		expect(isAllowedOrigin({ ...base, origin: 'https://contacts.example.com' })).toBe(true)
	})

	it('allows a same-origin write on a non-default port', () => {
		expect(isAllowedOrigin({ ...base, host: 'localhost:3030', origin: 'http://localhost:3030' })).toBe(true)
	})

	it('rejects a cross-origin write', () => {
		expect(isAllowedOrigin({ ...base, origin: 'https://evil.example' })).toBe(false)
	})

	it('rejects a cross-origin write from a different port on the same hostname', () => {
		expect(isAllowedOrigin({ ...base, host: 'localhost:3030', origin: 'http://localhost:4000' })).toBe(false)
	})

	it('rejects an opaque origin', () => {
		// A sandboxed iframe or a data: URL — the browser saying it cannot vouch
		// for the caller.
		expect(isAllowedOrigin({ ...base, origin: 'null' })).toBe(false)
	})

	it('rejects a multipart post from a hostile page, the import route’s vector', () => {
		expect(isAllowedOrigin({ ...base, origin: 'https://evil.example', referer: 'https://evil.example/csrf.html' })).toBe(false)
	})

	it('falls back to the referer when there is no origin', () => {
		expect(isAllowedOrigin({ ...base, referer: 'https://contacts.example.com/contacts' })).toBe(true)
		expect(isAllowedOrigin({ ...base, referer: 'https://evil.example/csrf.html' })).toBe(false)
	})

	it('allows a request with no browser context at all', () => {
		// curl, the container healthcheck, a CardDAV client.
		expect(isAllowedOrigin(base)).toBe(true)
	})

	it('honours a configured allowlist for a proxy that rewrites Host', () => {
		expect(
			isAllowedOrigin({
				...base,
				host: 'ui:3030',
				origin: 'https://carddav.example.com',
				allowedOrigins: ['https://carddav.example.com'],
			})
		).toBe(true)
	})

	it('rejects a garbled origin rather than reading it as same-origin', () => {
		expect(isAllowedOrigin({ ...base, origin: 'not a url' })).toBe(false)
		expect(isAllowedOrigin({ ...base, origin: 'javascript:alert(1)' })).toBe(false)
	})
})

describe('parseAllowedOrigins', () => {
	it('normalizes and drops what it cannot parse', () => {
		expect(parseAllowedOrigins('https://a.example, http://b.example:8080/path ,,nonsense')).toEqual([
			'https://a.example',
			'http://b.example:8080',
		])
	})

	it('is empty when unset', () => {
		expect(parseAllowedOrigins(undefined)).toEqual([])
	})
})

// The middleware itself, not just the predicate: this is what pins the header
// names and the method lookup to h3's actual event shape.
describe('the csrf middleware', () => {
	const app = new H3()
	app.use(csrfMiddleware)
	app.post('/api/contacts/import', () => ({ ok: true }))
	app.get('/api/contacts', () => ({ ok: true }))
	const handler = toWebHandler(app)

	const call = (method: string, path: string, headers: Record<string, string>) =>
		handler(new Request(`http://localhost:3030${path}`, { method, headers, body: method === 'POST' ? 'x=1' : undefined }))

	it('lets a same-origin write through', async () => {
		const response = await call('POST', '/api/contacts/import', { origin: 'http://localhost:3030' })
		expect(response.status).toBe(200)
	})

	it('rejects a cross-origin write with 403', async () => {
		const response = await call('POST', '/api/contacts/import', { origin: 'https://evil.example' })
		expect(response.status).toBe(403)
	})

	it('leaves reads alone', async () => {
		const response = await call('GET', '/api/contacts', { origin: 'https://evil.example' })
		expect(response.status).toBe(200)
	})
})
