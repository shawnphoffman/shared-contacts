import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { extractFromAcmeStore, signMobileconfig } from './mobileconfig-signer'

const CERT_PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n'
const KEY_PEM = '-----BEGIN EC PRIVATE KEY-----\nMHc\n-----END EC PRIVATE KEY-----\n'

function acmeStore(entries: Array<{ main: string; sans?: Array<string>; certificate?: string; key?: string }>): string {
	return JSON.stringify({
		cloudflare: {
			Account: { Email: 'admin@example.com' },
			Certificates: entries.map(e => ({
				domain: { main: e.main, ...(e.sans ? { sans: e.sans } : {}) },
				certificate: e.certificate ?? Buffer.from(CERT_PEM).toString('base64'),
				key: e.key ?? Buffer.from(KEY_PEM).toString('base64'),
				Store: 'default',
			})),
		},
	})
}

describe('extractFromAcmeStore', () => {
	it('extracts cert and key for an exact main match', () => {
		const result = extractFromAcmeStore(acmeStore([{ main: 'carddav.example.com' }]), 'carddav.example.com')
		expect(result).not.toBeNull()
		expect(result!.cert.toString('utf-8')).toBe(CERT_PEM)
		expect(result!.key.toString('utf-8')).toBe(KEY_PEM)
	})

	it('matches a domain listed in sans', () => {
		const store = acmeStore([{ main: '*.example.com', sans: ['example.com'] }])
		expect(extractFromAcmeStore(store, 'example.com')).not.toBeNull()
	})

	it('matches a wildcard cert by its literal name', () => {
		const store = acmeStore([{ main: '*.example.com' }])
		expect(extractFromAcmeStore(store, '*.example.com')).not.toBeNull()
	})

	it('returns null when no entry matches', () => {
		const store = acmeStore([{ main: 'other.example.com' }])
		expect(extractFromAcmeStore(store, 'carddav.example.com')).toBeNull()
	})

	it('does not treat a wildcard as covering subdomains implicitly', () => {
		const store = acmeStore([{ main: '*.example.com' }])
		expect(extractFromAcmeStore(store, 'carddav.example.com')).toBeNull()
	})

	it('returns null for invalid JSON', () => {
		expect(extractFromAcmeStore('not json', 'carddav.example.com')).toBeNull()
	})

	it('skips entries whose decoded payload is not PEM', () => {
		const store = acmeStore([
			{ main: 'carddav.example.com', certificate: Buffer.from('garbage').toString('base64') },
		])
		expect(extractFromAcmeStore(store, 'carddav.example.com')).toBeNull()
	})

	it('searches across multiple resolvers', () => {
		const store = JSON.stringify({
			unused: { Certificates: [] },
			...JSON.parse(acmeStore([{ main: 'carddav.example.com' }])),
		})
		expect(extractFromAcmeStore(store, 'carddav.example.com')).not.toBeNull()
	})
})

describe('signMobileconfig with ACME source', () => {
	const XML = '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict/></plist>\n'
	let dir: string

	beforeEach(() => {
		vi.unstubAllEnvs()
		dir = mkdtempSync(join(tmpdir(), 'signer-test-'))
	})

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	afterAll(() => {
		vi.unstubAllEnvs()
	})

	function enableAcmeSigning(acmePath: string, domain: string): void {
		vi.stubEnv('MOBILECONFIG_SIGNING_ENABLED', 'true')
		vi.stubEnv('MOBILECONFIG_SIGNING_CERT_PATH', '')
		vi.stubEnv('MOBILECONFIG_SIGNING_KEY_PATH', '')
		vi.stubEnv('MOBILECONFIG_SIGNING_ACME_PATH', acmePath)
		vi.stubEnv('MOBILECONFIG_SIGNING_ACME_DOMAIN', domain)
	}

	it('falls back to unsigned when the ACME file does not exist', async () => {
		enableAcmeSigning(join(dir, 'missing.json'), 'carddav.example.com')
		const result = await signMobileconfig(XML)
		expect(result.signed).toBe(false)
		expect(result.body.toString('utf-8')).toBe(XML)
	})

	it('falls back to unsigned when the domain is not in the store', async () => {
		const acmePath = join(dir, 'acme.json')
		writeFileSync(acmePath, acmeStore([{ main: 'other.example.com' }]))
		enableAcmeSigning(acmePath, 'carddav.example.com')
		const result = await signMobileconfig(XML)
		expect(result.signed).toBe(false)
	})

	it('signs with a real EC cert extracted from an ACME store', async () => {
		// Generate a throwaway P-256 self-signed cert, mirroring Traefik's
		// keyType: EC256, and wrap it in acme.json structure.
		const keyPath = join(dir, 'ephemeral-key.pem')
		const certPath = join(dir, 'ephemeral-cert.pem')
		execFileSync('openssl', ['ecparam', '-genkey', '-name', 'prime256v1', '-noout', '-out', keyPath])
		execFileSync('openssl', [
			'req', '-x509', '-new', '-key', keyPath, '-subj', '/CN=carddav.example.com', '-days', '2', '-out', certPath,
		])
		const acmePath = join(dir, 'acme.json')
		writeFileSync(
			acmePath,
			acmeStore([
				{
					main: 'carddav.example.com',
					certificate: readFileSync(certPath).toString('base64'),
					key: readFileSync(keyPath).toString('base64'),
				},
			])
		)
		enableAcmeSigning(acmePath, 'carddav.example.com')

		const result = await signMobileconfig(XML)
		expect(result.signed).toBe(true)
		expect(result.contentType).toBe('application/x-apple-aspen-config')
		// DER, not XML
		expect(result.body.subarray(0, 5).toString('utf-8')).not.toContain('<?xml')

		// Round-trip: the CMS envelope must verify and contain the original XML.
		const signedPath = join(dir, 'signed.der')
		writeFileSync(signedPath, result.body)
		const verified = execFileSync('openssl', ['smime', '-verify', '-inform', 'DER', '-in', signedPath, '-noverify'])
		// S/MIME canonicalizes line endings to CRLF inside the envelope.
		expect(verified.toString('utf-8').replace(/\r\n/g, '\n')).toBe(XML)
	})
})
