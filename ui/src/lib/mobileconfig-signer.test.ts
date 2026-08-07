import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { getSigningStatus, signMobileconfig } from './mobileconfig-signer'

const XML = '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict/></plist>\n'

/** Generate a throwaway P-256 cert/key, matching Traefik's keyType: EC256. */
function makeCert(dir: string, cn: string, days: number): { certPath: string; keyPath: string } {
	const keyPath = join(dir, 'key.pem')
	const certPath = join(dir, 'cert.pem')
	execFileSync('openssl', ['ecparam', '-genkey', '-name', 'prime256v1', '-noout', '-out', keyPath])
	execFileSync('openssl', ['req', '-x509', '-new', '-key', keyPath, '-subj', `/CN=${cn}`, '-days', String(days), '-out', certPath])
	return { certPath, keyPath }
}

describe('mobileconfig signer', () => {
	let dir: string

	beforeEach(() => {
		vi.unstubAllEnvs()
		dir = mkdtempSync(join(tmpdir(), 'signer-test-'))
	})

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true })
		vi.unstubAllEnvs()
	})

	function enable(certPath: string, keyPath: string): void {
		vi.stubEnv('MOBILECONFIG_SIGNING_ENABLED', 'true')
		vi.stubEnv('MOBILECONFIG_SIGNING_CERT_PATH', certPath)
		vi.stubEnv('MOBILECONFIG_SIGNING_KEY_PATH', keyPath)
	}

	describe('getSigningStatus', () => {
		it('reports disabled when the flag is off', async () => {
			const status = await getSigningStatus()
			expect(status).toEqual({ enabled: false, ok: false })
		})

		it('reports not-ok when enabled without cert/key paths', async () => {
			vi.stubEnv('MOBILECONFIG_SIGNING_ENABLED', 'true')
			const status = await getSigningStatus()
			expect(status.enabled).toBe(true)
			expect(status.ok).toBe(false)
			expect(status.error).toMatch(/not set/)
		})

		it('reports not-ok when the certificate is missing', async () => {
			enable(join(dir, 'nope.pem'), join(dir, 'nope-key.pem'))
			const status = await getSigningStatus()
			expect(status.ok).toBe(false)
			expect(status.error).toMatch(/certificate is not readable/)
		})

		it('reports not-ok when the certificate is not PEM', async () => {
			const certPath = join(dir, 'garbage.pem')
			const keyPath = join(dir, 'garbage-key.pem')
			writeFileSync(certPath, 'not a certificate')
			writeFileSync(keyPath, 'not a key')
			enable(certPath, keyPath)
			const status = await getSigningStatus()
			expect(status.ok).toBe(false)
			expect(status.error).toMatch(/could not be parsed/)
		})

		it('reports ok with subject and expiry for a valid certificate', async () => {
			const { certPath, keyPath } = makeCert(dir, 'carddav.example.com', 30)
			enable(certPath, keyPath)
			const status = await getSigningStatus()
			expect(status.ok).toBe(true)
			expect(status.subject).toBe('carddav.example.com')
			expect(status.daysRemaining).toBeGreaterThan(25)
			expect(status.expiresAt).toBeTruthy()
		})

		it('reports not-ok for an expired certificate', async () => {
			// Backdating issuance needs openssl >= 3.2, so instead issue a
			// short-lived cert and advance the clock past it. Only Date is faked,
			// so the async fs calls below still resolve normally.
			const { certPath, keyPath } = makeCert(dir, 'expired.example.com', 1)
			enable(certPath, keyPath)
			vi.useFakeTimers({ toFake: ['Date'] })
			vi.setSystemTime(new Date('2035-01-01T00:00:00Z'))
			try {
				const status = await getSigningStatus()
				expect(status.ok).toBe(false)
				expect(status.error).toMatch(/expired/)
				expect(status.daysRemaining).toBeLessThan(0)
			} finally {
				vi.useRealTimers()
			}
		})
	})

	describe('signMobileconfig', () => {
		it('returns unsigned XML when signing is disabled', async () => {
			const result = await signMobileconfig(XML)
			expect(result.signed).toBe(false)
			expect(result.body.toString('utf-8')).toBe(XML)
			expect(result.contentType).toContain('charset=utf-8')
		})

		it('falls back to unsigned when the certificate is missing', async () => {
			enable(join(dir, 'nope.pem'), join(dir, 'nope-key.pem'))
			const result = await signMobileconfig(XML)
			expect(result.signed).toBe(false)
			expect(result.body.toString('utf-8')).toBe(XML)
		})

		it('signs with an EC256 certificate and round-trips the payload', async () => {
			const { certPath, keyPath } = makeCert(dir, 'carddav.example.com', 2)
			enable(certPath, keyPath)
			vi.stubEnv('MOBILECONFIG_SIGNING_CHAIN_PATH', certPath)

			const result = await signMobileconfig(XML)
			expect(result.signed).toBe(true)
			expect(result.contentType).toBe('application/x-apple-aspen-config')
			expect(result.body.subarray(0, 5).toString('utf-8')).not.toContain('<?xml')

			const signedPath = join(dir, 'signed.der')
			writeFileSync(signedPath, result.body)
			const verified = execFileSync('openssl', ['smime', '-verify', '-inform', 'DER', '-in', signedPath, '-noverify'])
			// S/MIME canonicalizes line endings to CRLF inside the envelope.
			expect(verified.toString('utf-8').replace(/\r\n/g, '\n')).toBe(XML)
		})
	})
})
