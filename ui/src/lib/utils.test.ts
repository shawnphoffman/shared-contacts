import { describe, expect, it } from 'vitest'
import {
	formatPhoneAsYouType,
	formatPhoneNumber,
	formatSevenDigitPhone,
	formatValidPhoneNumber,
	isInternationalPhone,
	normalizePhoneNumber,
	toE164Phone,
} from './utils'
import type { CountryCode } from 'libphonenumber-js'

/**
 * Replay a number one keystroke at a time, feeding each formatted result back
 * in as the input's value - exactly what the PhoneInput does.
 */
function typeNumber(number: string, defaultCountry: CountryCode = 'US'): string {
	let displayValue = ''
	for (const char of number) {
		displayValue = formatPhoneAsYouType(displayValue + char, defaultCountry)
	}
	return displayValue
}

describe('isInternationalPhone', () => {
	it('detects a leading country code', () => {
		expect(isInternationalPhone('+44 7783 672703')).toBe(true)
		expect(isInternationalPhone('  +1 555 123 4567')).toBe(true)
		expect(isInternationalPhone('(555) 123-4567')).toBe(false)
	})
})

describe('formatSevenDigitPhone', () => {
	it('formats a 7-digit local number', () => {
		expect(formatSevenDigitPhone('5551234')).toBe('555-1234')
		expect(formatSevenDigitPhone('555 1234')).toBe('555-1234')
	})

	it('leaves international input alone even at 7 digits', () => {
		expect(formatSevenDigitPhone('+44 7783 6')).toBeNull()
		expect(formatSevenDigitPhone('+1 555 12')).toBeNull()
	})

	it('ignores anything that is not exactly 7 digits', () => {
		expect(formatSevenDigitPhone('555123')).toBeNull()
		expect(formatSevenDigitPhone('5551234567')).toBeNull()
	})
})

describe('formatPhoneAsYouType', () => {
	it('preserves the country code while an international number is typed', () => {
		expect(typeNumber('+44 7783 672703')).toBe('+44 7783 672703')
	})

	it('does not collapse an international number at the 7th digit', () => {
		// Regression: "+44 7783 6" used to become "447-7836", losing the country code
		expect(formatPhoneAsYouType('+44 7783 6')).toBe('+44 7783 6')
	})

	it('still formats local numbers as you type', () => {
		expect(typeNumber('5551234')).toBe('555-1234')
		expect(typeNumber('2125551234')).toBe('(212) 555-1234')
	})

	it('formats an international number typed without spaces', () => {
		expect(typeNumber('+447783672703')).toBe('+44 7783 672703')
	})
})

describe('formatPhoneNumber', () => {
	it('formats numbers from the default country nationally', () => {
		expect(formatPhoneNumber('+12125551234')).toBe('(212) 555-1234')
		expect(formatPhoneNumber('2125551234')).toBe('(212) 555-1234')
	})

	it('keeps the country code on numbers outside the default country', () => {
		expect(formatPhoneNumber('+447783672703')).toBe('+44 7783 672703')
		expect(formatPhoneNumber('+33612345678')).toBe('+33 6 12 34 56 78')
	})

	it('formats nationally when the number is in the given default country', () => {
		expect(formatPhoneNumber('+447783672703', 'GB')).toBe('07783 672703')
	})

	it('formats 7-digit local numbers', () => {
		expect(formatPhoneNumber('5551234')).toBe('555-1234')
	})

	it('returns the original string when parsing fails', () => {
		expect(formatPhoneNumber('not a number')).toBe('not a number')
		expect(formatPhoneNumber('')).toBe('')
		expect(formatPhoneNumber(null)).toBe('')
	})
})

describe('formatValidPhoneNumber', () => {
	it('formats complete numbers', () => {
		expect(formatValidPhoneNumber('+44 7783 672703')).toBe('+44 7783 672703')
		expect(formatValidPhoneNumber('2125551234')).toBe('(212) 555-1234')
	})

	it('returns null for incomplete input', () => {
		expect(formatValidPhoneNumber('+44 7783 6')).toBeNull()
		expect(formatValidPhoneNumber('212555')).toBeNull()
	})
})

describe('toE164Phone', () => {
	it('converts valid numbers to E.164', () => {
		expect(toE164Phone('+44 7783 672703')).toBe('+447783672703')
		expect(toE164Phone('(212) 555-1234')).toBe('+12125551234')
		expect(toE164Phone('07783 672703', 'GB')).toBe('+447783672703')
	})

	it('returns null for incomplete input', () => {
		expect(toE164Phone('+44 7783 6')).toBeNull()
		expect(toE164Phone('5551234')).toBeNull()
	})
})

describe('normalizePhoneNumber', () => {
	it('formats 7-digit local numbers', () => {
		expect(normalizePhoneNumber('5551234')).toBe('555-1234')
	})

	it('preserves international numbers', () => {
		expect(normalizePhoneNumber('+44 7783 672703')).toBe('+44 7783 672703')
		expect(normalizePhoneNumber('+2412345')).toBe('+2412345')
	})

	it('preserves other formats and handles empty input', () => {
		expect(normalizePhoneNumber('(212) 555-1234')).toBe('(212) 555-1234')
		expect(normalizePhoneNumber('  ')).toBe('')
		expect(normalizePhoneNumber(null)).toBeNull()
	})
})
