import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { AsYouType, parsePhoneNumberWithError } from 'libphonenumber-js'
import type { ClassValue } from 'clsx'
import type { CountryCode, PhoneNumber } from 'libphonenumber-js'

export function cn(...inputs: Array<ClassValue>) {
	return twMerge(clsx(inputs))
}

/**
 * Whether the input carries an explicit country code, e.g. "+44 7783 672703".
 * International input must never be reinterpreted as a local number.
 */
export function isInternationalPhone(phone: string): boolean {
	return phone.trim().startsWith('+')
}

/**
 * Format a 7-digit local number as XXX-XXXX.
 * Returns null when the input is international or is not exactly 7 digits, so
 * a half-typed international number is never collapsed into a local one.
 */
export function formatSevenDigitPhone(phone: string): string | null {
	if (isInternationalPhone(phone)) return null

	const digitsOnly = phone.replace(/\D/g, '')
	if (digitsOnly.length !== 7) return null

	return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3)}`
}

/**
 * National format for numbers in defaultCountry, international format (keeping
 * the leading + and country code) for everything else.
 */
function formatParsedPhone(parsed: PhoneNumber, defaultCountry: CountryCode): string {
	return parsed.country && parsed.country !== defaultCountry ? parsed.formatInternational() : parsed.formatNational()
}

/**
 * Format a phone number for display
 * @param phone - The phone number string to format
 * @param defaultCountry - Default country code to use for parsing (default: 'US')
 * @returns Formatted phone number string, or original string if parsing fails
 */
export function formatPhoneNumber(phone: string | null | undefined, defaultCountry: CountryCode = 'US'): string {
	if (!phone) return ''

	const sevenDigit = formatSevenDigitPhone(phone)
	if (sevenDigit) return sevenDigit

	try {
		return formatParsedPhone(parsePhoneNumberWithError(phone, defaultCountry), defaultCountry)
	} catch {
		// If parsing fails, return the original phone number
		return phone
	}
}

/**
 * Like formatPhoneNumber, but returns null unless the number is complete and
 * valid. Use when a partially typed number should be left alone.
 */
export function formatValidPhoneNumber(phone: string, defaultCountry: CountryCode = 'US'): string | null {
	try {
		const parsed = parsePhoneNumberWithError(phone, defaultCountry)
		return parsed.isValid() ? formatParsedPhone(parsed, defaultCountry) : null
	} catch {
		return null
	}
}

/**
 * E.164 representation for storage, or null when the input is not a valid number.
 */
export function toE164Phone(phone: string, defaultCountry: CountryCode = 'US'): string | null {
	try {
		const parsed = parsePhoneNumberWithError(phone, defaultCountry)
		return parsed.isValid() ? parsed.number : null
	} catch {
		return null
	}
}

/**
 * Format partial input while the user is still typing.
 * Input starting with + is formatted against the country code it carries, not
 * defaultCountry, so international numbers survive keystroke by keystroke.
 */
export function formatPhoneAsYouType(phone: string, defaultCountry: CountryCode = 'US'): string {
	return formatSevenDigitPhone(phone) ?? new AsYouType(defaultCountry).input(phone)
}

/**
 * Normalize a phone number for storage.
 * Preserves existing formats but formats 7-digit local numbers as XXX-XXXX.
 */
export function normalizePhoneNumber(phone: string | null | undefined): string | null {
	if (phone == null) return null

	const trimmed = phone.trim()
	if (!trimmed) return ''

	return formatSevenDigitPhone(trimmed) ?? trimmed
}
