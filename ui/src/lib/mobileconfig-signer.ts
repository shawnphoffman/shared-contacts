import { spawn } from 'node:child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logger } from './logger'

export interface SigningResult {
	body: Buffer
	signed: boolean
	contentType: string
}

interface SigningConfig {
	enabled: boolean
	certPath?: string
	keyPath?: string
	chainPath?: string
	keyPassphrase?: string
	acmePath?: string
	acmeDomain?: string
}

function readConfig(): SigningConfig {
	const flag = (process.env.MOBILECONFIG_SIGNING_ENABLED || '').toLowerCase()
	const enabled = flag === '1' || flag === 'true' || flag === 'yes'
	return {
		enabled,
		certPath: process.env.MOBILECONFIG_SIGNING_CERT_PATH || undefined,
		keyPath: process.env.MOBILECONFIG_SIGNING_KEY_PATH || undefined,
		chainPath: process.env.MOBILECONFIG_SIGNING_CHAIN_PATH || undefined,
		keyPassphrase: process.env.MOBILECONFIG_SIGNING_KEY_PASSPHRASE || undefined,
		acmePath: process.env.MOBILECONFIG_SIGNING_ACME_PATH || undefined,
		acmeDomain: process.env.MOBILECONFIG_SIGNING_ACME_DOMAIN || undefined,
	}
}

async function fileReadable(path: string): Promise<boolean> {
	try {
		await access(path, fsConstants.R_OK)
		return true
	} catch {
		return false
	}
}

export function isSigningEnabled(): boolean {
	return readConfig().enabled
}

export interface AcmeMaterial {
	cert: Buffer
	key: Buffer
}

/**
 * Pull the PEM certificate (fullchain) and private key for `domain` out of a
 * Traefik ACME storage file (acme.json). The file maps resolver names to
 * { Certificates: [{ domain: { main, sans? }, certificate, key }] } with the
 * PEMs base64-encoded. Matches `main` or any SAN exactly (a wildcard cert is
 * matched by its literal "*.example.com" name).
 */
export function extractFromAcmeStore(acmeJson: string, domain: string): AcmeMaterial | null {
	let parsed: unknown
	try {
		parsed = JSON.parse(acmeJson)
	} catch {
		return null
	}
	if (!parsed || typeof parsed !== 'object') return null

	for (const resolver of Object.values(parsed as Record<string, unknown>)) {
		const certificates = (resolver as { Certificates?: unknown } | null)?.Certificates
		if (!Array.isArray(certificates)) continue
		for (const entry of certificates as Array<{
			domain?: { main?: unknown; sans?: unknown }
			certificate?: unknown
			key?: unknown
		}>) {
			const main = entry.domain?.main
			const sans = Array.isArray(entry.domain?.sans) ? entry.domain.sans : []
			if (main !== domain && !sans.includes(domain)) continue
			if (typeof entry.certificate !== 'string' || typeof entry.key !== 'string') continue
			const cert = Buffer.from(entry.certificate, 'base64')
			const key = Buffer.from(entry.key, 'base64')
			if (!cert.toString('utf-8').includes('BEGIN CERTIFICATE')) continue
			if (!key.toString('utf-8').includes('PRIVATE KEY')) continue
			return { cert, key }
		}
	}
	return null
}

interface SigningMaterial {
	certPath: string
	keyPath: string
	chainPath?: string
	usePassphrase: boolean
	cleanup?: () => Promise<void>
}

async function resolveMaterialFromFiles(config: SigningConfig): Promise<SigningMaterial | null> {
	const certReadable = await fileReadable(config.certPath!)
	const keyReadable = await fileReadable(config.keyPath!)
	if (!certReadable || !keyReadable) {
		logger.warn(
			{ certPath: config.certPath, keyPath: config.keyPath, certReadable, keyReadable },
			'mobileconfig signing cert or key is not readable; returning unsigned profile'
		)
		return null
	}
	let chainPath = config.chainPath
	if (chainPath && !(await fileReadable(chainPath))) {
		logger.warn({ chainPath }, 'mobileconfig chain file is not readable; continuing without -certfile')
		chainPath = undefined
	}
	return {
		certPath: config.certPath!,
		keyPath: config.keyPath!,
		chainPath,
		usePassphrase: Boolean(config.keyPassphrase),
	}
}

async function resolveMaterialFromAcme(config: SigningConfig): Promise<SigningMaterial | null> {
	let raw: string
	try {
		raw = await readFile(config.acmePath!, 'utf-8')
	} catch (err) {
		logger.warn({ err, acmePath: config.acmePath }, 'mobileconfig ACME store is not readable; returning unsigned profile')
		return null
	}
	const material = extractFromAcmeStore(raw, config.acmeDomain!)
	if (!material) {
		logger.warn(
			{ acmePath: config.acmePath, acmeDomain: config.acmeDomain },
			'no certificate for MOBILECONFIG_SIGNING_ACME_DOMAIN in ACME store (main/sans must match exactly); returning unsigned profile'
		)
		return null
	}
	// openssl needs file paths, so stage the PEMs in a private temp dir for the
	// duration of the sign and remove it afterwards.
	const dir = await mkdtemp(join(tmpdir(), 'mobileconfig-sign-'))
	const certPath = join(dir, 'cert.pem')
	const keyPath = join(dir, 'key.pem')
	await writeFile(certPath, material.cert, { mode: 0o600 })
	await writeFile(keyPath, material.key, { mode: 0o600 })
	return {
		certPath,
		keyPath,
		// The acme.json certificate field is the fullchain; reusing it as
		// -certfile embeds the intermediate(s) in the CMS envelope.
		chainPath: certPath,
		usePassphrase: false,
		cleanup: () => rm(dir, { recursive: true, force: true }),
	}
}

/**
 * Sign an unsigned .mobileconfig plist using `openssl smime -sign -outform DER`.
 *
 * Signing material comes from MOBILECONFIG_SIGNING_CERT_PATH/_KEY_PATH, or —
 * when those are unset — directly from a Traefik ACME storage file (acme.json)
 * via MOBILECONFIG_SIGNING_ACME_PATH/_ACME_DOMAIN, read fresh on every call so
 * certificate renewals are picked up automatically.
 *
 * Returns the original XML unchanged if signing is disabled or the material
 * cannot be read — the caller is responsible for picking the right
 * Content-Type based on `result.signed`.
 */
export async function signMobileconfig(xml: string): Promise<SigningResult> {
	const xmlBuffer = Buffer.from(xml, 'utf-8')
	const xmlResult: SigningResult = {
		body: xmlBuffer,
		signed: false,
		contentType: 'application/x-apple-aspen-config; charset=utf-8',
	}

	const config = readConfig()
	if (!config.enabled) return xmlResult

	let material: SigningMaterial | null
	if (config.certPath && config.keyPath) {
		material = await resolveMaterialFromFiles(config)
	} else if (config.acmePath && config.acmeDomain) {
		material = await resolveMaterialFromAcme(config)
	} else {
		logger.warn(
			'MOBILECONFIG_SIGNING_ENABLED is true but neither cert/key paths nor ACME path+domain are set; returning unsigned profile'
		)
		return xmlResult
	}
	if (!material) return xmlResult

	const args = ['smime', '-sign', '-signer', material.certPath, '-inkey', material.keyPath, '-nodetach', '-outform', 'DER']
	if (material.chainPath) {
		args.push('-certfile', material.chainPath)
	}
	if (material.usePassphrase) {
		args.push('-passin', 'env:MOBILECONFIG_SIGNING_KEY_PASSPHRASE')
	}

	try {
		const signed = await new Promise<Buffer | null>(resolve => {
			const child = spawn('openssl', args, { stdio: ['pipe', 'pipe', 'pipe'] })
			const stdout: Array<Buffer> = []
			const stderr: Array<Buffer> = []
			child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)))
			child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)))
			child.on('error', err => {
				logger.error({ err }, 'openssl spawn failed; returning unsigned profile')
				resolve(null)
			})
			child.on('close', code => {
				if (code !== 0) {
					logger.error(
						{ code, stderr: Buffer.concat(stderr).toString('utf-8').slice(0, 2000) },
						'openssl smime -sign exited non-zero; returning unsigned profile'
					)
					resolve(null)
					return
				}
				resolve(Buffer.concat(stdout))
			})
			child.stdin.end(xmlBuffer)
		})

		if (!signed) return xmlResult
		return {
			body: signed,
			signed: true,
			contentType: 'application/x-apple-aspen-config',
		}
	} finally {
		if (material.cleanup) {
			await material.cleanup().catch(err => logger.warn({ err }, 'failed to clean up temporary signing material'))
		}
	}
}
