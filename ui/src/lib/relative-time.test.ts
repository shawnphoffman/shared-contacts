import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './relative-time'

const now = Date.parse('2026-08-31T12:00:00.000Z')
const ago = (ms: number) => new Date(now - ms).toISOString()

describe('formatRelativeTime', () => {
	it('collapses anything recent to "just now"', () => {
		expect(formatRelativeTime(ago(0), now)).toBe('just now')
		expect(formatRelativeTime(ago(44_000), now)).toBe('just now')
	})

	it('reads a timestamp ahead of now as just now rather than the future', () => {
		// The browser's clock and the server's need not agree.
		expect(formatRelativeTime(new Date(now + 60_000).toISOString(), now)).toBe('just now')
	})

	it('steps up through the units', () => {
		expect(formatRelativeTime(ago(5 * 60_000), now)).toBe('5m ago')
		expect(formatRelativeTime(ago(3 * 3_600_000), now)).toBe('3h ago')
		expect(formatRelativeTime(ago(4 * 86_400_000), now)).toBe('4d ago')
		expect(formatRelativeTime(ago(60 * 86_400_000), now)).toBe('2mo ago')
		expect(formatRelativeTime(ago(400 * 86_400_000), now)).toBe('1y ago')
	})

	it('returns null for nothing, and for something unparseable', () => {
		expect(formatRelativeTime(null, now)).toBeNull()
		expect(formatRelativeTime(undefined, now)).toBeNull()
		expect(formatRelativeTime('not a date', now)).toBeNull()
	})

	it('accepts a Date as readily as a string', () => {
		expect(formatRelativeTime(new Date(now - 120_000), now)).toBe('2m ago')
	})
})
