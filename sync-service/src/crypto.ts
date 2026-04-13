import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { logger } from './logger'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16

/**
 * Derive a 32-byte key from the PASSWORD_ENCRYPTION_KEY env var.
 * Returns null when no key is configured (feature disabled).
 */
function getKey(): Buffer | null {
	const raw = process.env.PASSWORD_ENCRYPTION_KEY
	if (!raw) return null

	// Accept either a 64-char hex string (32 bytes) or raw >=32 char passphrase
	if (/^[0-9a-f]{64}$/i.test(raw)) {
		return Buffer.from(raw, 'hex')
	}

	// Hash the passphrase to get exactly 32 bytes
	const { createHash } = require('node:crypto')
	return createHash('sha256').update(raw).digest()
}

/** Returns true when an encryption key is configured. */
export function isEncryptionEnabled(): boolean {
	return getKey() !== null
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns a base64-encoded blob: iv (12B) + ciphertext + authTag (16B).
 * Returns null if encryption is not enabled.
 */
export function encrypt(plaintext: string): string | null {
	const key = getKey()
	if (!key) return null

	const iv = randomBytes(IV_LENGTH)
	const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
	const authTag = cipher.getAuthTag()

	// Pack: iv + ciphertext + authTag
	return Buffer.concat([iv, encrypted, authTag]).toString('base64')
}

/**
 * Decrypt a base64-encoded blob produced by encrypt().
 * Returns null if decryption fails or encryption is not enabled.
 */
export function decrypt(encoded: string): string | null {
	const key = getKey()
	if (!key) return null

	try {
		const data = Buffer.from(encoded, 'base64')
		if (data.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
			logger.warn('Encrypted password blob is too short')
			return null
		}

		const iv = data.subarray(0, IV_LENGTH)
		const authTag = data.subarray(data.length - AUTH_TAG_LENGTH)
		const ciphertext = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH)

		const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
		decipher.setAuthTag(authTag)

		return decipher.update(ciphertext) + decipher.final('utf8')
	} catch (error) {
		logger.error({ err: error }, 'Failed to decrypt password')
		return null
	}
}
