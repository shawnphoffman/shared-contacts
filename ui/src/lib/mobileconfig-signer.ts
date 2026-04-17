import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
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

/**
 * Sign an unsigned .mobileconfig plist using `openssl smime -sign -outform DER`.
 * Returns the original XML unchanged if signing is disabled or if the cert/key
 * cannot be read — the caller is responsible for picking the right Content-Type
 * based on `result.signed`.
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
	if (!config.certPath || !config.keyPath) {
		logger.warn('MOBILECONFIG_SIGNING_ENABLED is true but cert/key path is not set; returning unsigned profile')
		return xmlResult
	}

	const certReadable = await fileReadable(config.certPath)
	const keyReadable = await fileReadable(config.keyPath)
	if (!certReadable || !keyReadable) {
		logger.warn(
			{ certPath: config.certPath, keyPath: config.keyPath, certReadable, keyReadable },
			'mobileconfig signing cert or key is not readable; returning unsigned profile'
		)
		return xmlResult
	}
	if (config.chainPath && !(await fileReadable(config.chainPath))) {
		logger.warn({ chainPath: config.chainPath }, 'mobileconfig chain file is not readable; continuing without -certfile')
		config.chainPath = undefined
	}

	const args = ['smime', '-sign', '-signer', config.certPath, '-inkey', config.keyPath, '-nodetach', '-outform', 'DER']
	if (config.chainPath) {
		args.push('-certfile', config.chainPath)
	}
	if (config.keyPassphrase) {
		args.push('-passin', 'env:MOBILECONFIG_SIGNING_KEY_PASSPHRASE')
	}

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
}
