import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/db', () => ({
	getAddressBook: vi.fn(),
	getAddressBookReadonly: vi.fn(),
	getAddressBooks: vi.fn(),
	getAppSetting: vi.fn(),
	getUserAddressBookIds: vi.fn(),
}))

vi.mock('../../lib/logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../lib/mobileconfig-signer', () => ({
	signMobileconfig: vi.fn(async (xml: string) => ({
		body: Buffer.from(xml, 'utf-8'),
		signed: false,
		contentType: 'application/x-apple-aspen-config; charset=utf-8',
	})),
}))

import { getAddressBook, getAddressBookReadonly, getAddressBooks, getAppSetting, getUserAddressBookIds } from '../../lib/db'

const getHandler = async () => {
	const mod = await import('./mobileconfig')
	const route = mod.Route as Record<string, unknown>
	const options = route.options as Record<string, unknown>
	const server = options.server as Record<string, unknown>
	const handlers = server.handlers as Record<string, (...args: Array<unknown>) => unknown>
	return handlers.GET as (ctx: { request: Request }) => Promise<Response>
}

function makeRequest(url: string): Request {
	return new Request(url)
}

const BOOK_ID = 'a1bc7deb-afe8-48a4-8501-e4ea6413e6ba'
const BOOK_ID_2 = 'b2cd8efc-bfe9-59b5-9612-f5fb7524f7cb'
const USERNAME = 'shawn'

describe('mobileconfig handler', () => {
	beforeEach(() => {
		vi.resetAllMocks()
		vi.unstubAllEnvs()
		vi.mocked(getAddressBook).mockResolvedValue({ id: BOOK_ID, name: 'Family' } as never)
		vi.mocked(getAppSetting).mockResolvedValue(null)
		vi.mocked(getAddressBooks).mockResolvedValue([] as never)
		vi.mocked(getUserAddressBookIds).mockResolvedValue([] as never)
	})

	it('returns 400 when username is missing', async () => {
		const handler = await getHandler()
		const res = await handler({ request: makeRequest(`http://localhost:3030/api/mobileconfig?bookId=${BOOK_ID}`) })
		expect(res.status).toBe(400)
	})

	it('returns 400 when bookId is missing', async () => {
		const handler = await getHandler()
		const res = await handler({ request: makeRequest(`http://localhost:3030/api/mobileconfig?username=${USERNAME}`) })
		expect(res.status).toBe(400)
	})

	it('returns 404 when address book not found', async () => {
		vi.mocked(getAddressBook).mockResolvedValue(null as never)
		const handler = await getHandler()
		const res = await handler({
			request: makeRequest(`http://localhost:3030/api/mobileconfig?username=${USERNAME}&bookId=${BOOK_ID}`),
		})
		expect(res.status).toBe(404)
	})

	describe('plist output', () => {
		async function getPlist(requestUrl: string, env?: Record<string, string>): Promise<string> {
			if (env) {
				for (const [k, v] of Object.entries(env)) {
					vi.stubEnv(k, v)
				}
			}
			const handler = await getHandler()
			const res = await handler({ request: makeRequest(requestUrl) })
			expect(res.status).toBe(200)
			return res.text()
		}

		it('does not include CardDAVPrincipalURL', async () => {
			const plist = await getPlist(`http://localhost:3030/api/mobileconfig?username=${USERNAME}&bookId=${BOOK_ID}`)
			expect(plist).not.toContain('CardDAVPrincipalURL')
		})

		it('includes composite username in CardDAVUsername', async () => {
			const plist = await getPlist(`http://localhost:3030/api/mobileconfig?username=${USERNAME}&bookId=${BOOK_ID}`)
			expect(plist).toContain(`<string>${USERNAME}-${BOOK_ID}</string>`)
		})

		it('uses request origin when PUBLIC_CARDDAV_URL is not set', async () => {
			const plist = await getPlist(`http://myhost:3030/api/mobileconfig?username=${USERNAME}&bookId=${BOOK_ID}`)
			expect(plist).toContain('<string>myhost</string>')
			expect(plist).toContain('<integer>3030</integer>')
		})

		it('uses PUBLIC_CARDDAV_URL when set', async () => {
			const plist = await getPlist(`http://localhost:3030/api/mobileconfig?username=${USERNAME}&bookId=${BOOK_ID}`, {
				PUBLIC_CARDDAV_URL: 'https://carddav.example.com',
			})
			expect(plist).toContain('<string>carddav.example.com</string>')
			expect(plist).toContain('<integer>443</integer>')
			expect(plist).toContain('<true/>')
		})

		it('uses port 443 for standard HTTPS URL', async () => {
			const plist = await getPlist(`https://contacts.example.com/api/mobileconfig?username=${USERNAME}&bookId=${BOOK_ID}`)
			expect(plist).toContain('<integer>443</integer>')
			expect(plist).toContain('<true/>')
		})

		it('uses port 80 for standard HTTP URL', async () => {
			const plist = await getPlist(`http://contacts.example.com/api/mobileconfig?username=${USERNAME}&bookId=${BOOK_ID}`)
			expect(plist).toContain('<integer>80</integer>')
			expect(plist).toContain('<false/>')
		})

		it('uses explicit port from PUBLIC_CARDDAV_URL', async () => {
			const plist = await getPlist(`http://localhost:3030/api/mobileconfig?username=${USERNAME}&bookId=${BOOK_ID}`, {
				PUBLIC_CARDDAV_URL: 'https://carddav.example.com:8443',
			})
			expect(plist).toContain('<integer>8443</integer>')
		})

		it('sets correct Content-Type and Content-Disposition headers', async () => {
			const handler = await getHandler()
			const res = await handler({
				request: makeRequest(`http://localhost:3030/api/mobileconfig?username=${USERNAME}&bookId=${BOOK_ID}`),
			})
			expect(res.headers.get('Content-Type')).toBe('application/x-apple-aspen-config; charset=utf-8')
			expect(res.headers.get('Content-Disposition')).toContain('.mobileconfig')
		})
	})

	describe('readonly users', () => {
		it('returns 400 for ro- user when readonly not enabled', async () => {
			vi.mocked(getAddressBookReadonly).mockResolvedValue(null as never)
			const handler = await getHandler()
			const res = await handler({
				request: makeRequest(`http://localhost:3030/api/mobileconfig?username=ro-${BOOK_ID}&bookId=${BOOK_ID}`),
			})
			expect(res.status).toBe(400)
		})

		it('succeeds for ro- user when readonly is enabled', async () => {
			vi.mocked(getAddressBookReadonly).mockResolvedValue({ enabled: true } as never)
			const handler = await getHandler()
			const res = await handler({
				request: makeRequest(`http://localhost:3030/api/mobileconfig?username=ro-${BOOK_ID}&bookId=${BOOK_ID}`),
			})
			expect(res.status).toBe(200)
		})
	})

	describe('organization resolution', () => {
		async function getPlist(requestUrl: string): Promise<string> {
			const handler = await getHandler()
			const res = await handler({ request: makeRequest(requestUrl) })
			expect(res.status).toBe(200)
			return res.text()
		}

		it('app_settings row wins over env vars', async () => {
			vi.mocked(getAppSetting).mockResolvedValue('Hoffman Shared Contacts')
			vi.stubEnv('MOBILECONFIG_ORG', 'EnvBrand')
			const plist = await getPlist(`http://localhost:3030/api/mobileconfig?username=${USERNAME}&bookId=${BOOK_ID}`)
			expect(plist).toContain('<string>Hoffman Shared Contacts</string>')
			expect(plist).not.toContain('<string>EnvBrand</string>')
		})

		it('MOBILECONFIG_ORG env var is used when DB row is unset', async () => {
			vi.stubEnv('MOBILECONFIG_ORG', 'EnvBrand')
			const plist = await getPlist(`http://localhost:3030/api/mobileconfig?username=${USERNAME}&bookId=${BOOK_ID}`)
			expect(plist).toContain('<string>EnvBrand</string>')
			expect(plist).toContain('<string>EnvBrand: Family</string>')
		})

		it('uses org as a space-separated prefix on the per-account display name', async () => {
			vi.mocked(getAppSetting).mockResolvedValue('👥')
			const plist = await getPlist(`http://localhost:3030/api/mobileconfig?username=${USERNAME}&bookId=${BOOK_ID}`)
			expect(plist).toContain('<string>👥 Family</string>')
			expect(plist).not.toContain('<string>👥 (Family)</string>')
		})

		it('falls back to "Shared Contacts" default', async () => {
			const plist = await getPlist(`http://localhost:3030/api/mobileconfig?username=${USERNAME}&bookId=${BOOK_ID}`)
			expect(plist).toContain('<string>Shared Contacts</string>')
		})
	})

	describe('combined mode', () => {
		async function getHandlerResponse(requestUrl: string): Promise<Response> {
			const handler = await getHandler()
			return handler({ request: makeRequest(requestUrl) })
		}

		it('returns 400 for combined request with no accessible books', async () => {
			vi.mocked(getAddressBooks).mockResolvedValue([] as never)
			vi.mocked(getUserAddressBookIds).mockResolvedValue([] as never)
			const res = await getHandlerResponse(`http://localhost:3030/api/mobileconfig?username=${USERNAME}&combined=1`)
			expect(res.status).toBe(404)
		})

		it('rejects combined mode for ro- users', async () => {
			const res = await getHandlerResponse(`http://localhost:3030/api/mobileconfig?username=ro-${BOOK_ID}&combined=1`)
			expect(res.status).toBe(400)
		})

		it('includes every assigned book + public books in a single plist', async () => {
			vi.mocked(getAddressBooks).mockResolvedValue([
				{ id: BOOK_ID, name: 'Family', is_public: false },
				{ id: BOOK_ID_2, name: 'Friends', is_public: true },
				{ id: 'c3de9fcd-cffa-6ac6-a723-06fc8635g8dc', name: 'Hidden', is_public: false },
			] as never)
			vi.mocked(getUserAddressBookIds).mockResolvedValue([BOOK_ID] as never)

			const res = await getHandlerResponse(`http://localhost:3030/api/mobileconfig?username=${USERNAME}&combined=1`)
			expect(res.status).toBe(200)
			const plist = await res.text()

			expect(plist).toContain(`<string>${USERNAME}-${BOOK_ID}</string>`)
			expect(plist).toContain(`<string>${USERNAME}-${BOOK_ID_2}</string>`)
			expect(plist).not.toContain('c3de9fcd-cffa-6ac6-a723-06fc8635g8dc')
		})

		it('uses a stable top-level PayloadIdentifier across calls', async () => {
			vi.mocked(getAddressBooks).mockResolvedValue([{ id: BOOK_ID, name: 'Family', is_public: true }] as never)
			vi.mocked(getUserAddressBookIds).mockResolvedValue([] as never)

			const url = `http://localhost:3030/api/mobileconfig?username=${USERNAME}&combined=1`
			const first = await (await getHandlerResponse(url)).text()
			const second = await (await getHandlerResponse(url)).text()

			const extractTopLevelId = (plist: string): string => {
				const match = plist.match(/<key>PayloadIdentifier<\/key>\s*<string>([^<]*bundle[^<]*)<\/string>/)
				return match?.[1] ?? ''
			}
			const idFirst = extractTopLevelId(first)
			const idSecond = extractTopLevelId(second)
			expect(idFirst).toBeTruthy()
			expect(idFirst).toBe(idSecond)
			expect(idFirst).toContain('bundle')
		})
	})
})
