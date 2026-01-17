import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { parsePhoneNumberWithError, type CountryCode } from 'libphonenumber-js'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

/**
 * Format a phone number for display
 * @param phone - The phone number string to format
 * @param defaultCountry - Default country code to use for parsing (default: 'US')
 * @returns Formatted phone number string, or original string if parsing fails
 */
export function formatPhoneNumber(phone: string | null | undefined, defaultCountry: CountryCode = 'US'): string {
	if (!phone) return ''

	const digitsOnly = phone.replace(/\D/g, '')
	if (digitsOnly.length === 7) {
		return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3)}`
	}

	try {
		const phoneNumber = parsePhoneNumberWithError(phone, defaultCountry)
		return phoneNumber.formatNational()
	} catch {
		// If parsing fails, return the original phone number
		return phone
	}
}

/**
 * Normalize a phone number for storage.
 * Preserves existing formats but formats 7-digit numbers as XXX-XXXX.
 */
export function normalizePhoneNumber(phone: string | null | undefined): string | null {
	if (phone == null) return null

	const trimmed = phone.trim()
	if (!trimmed) return ''

	const digitsOnly = trimmed.replace(/\D/g, '')
	if (digitsOnly.length === 7) {
		return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3)}`
	}

	return trimmed
}
