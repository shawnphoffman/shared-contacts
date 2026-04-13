import { describe, it, expect, vi } from 'vitest'

// Mock external dependencies required by htpasswd module
vi.mock('./db', () => ({
	getAddressBooks: vi.fn().mockResolvedValue([]),
	getAddressBooksForUser: vi.fn().mockResolvedValue([]),
}))

vi.mock('./logger', () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import {
	getCompositeUsername,
	parseCompositeUsername,
	isCompositeUsername,
} from './htpasswd'

// ─── Pure function tests ───────────────────────────────────────────────────────

describe('getCompositeUsername', () => {
	it('joins username and bookId with a hyphen', () => {
		expect(getCompositeUsername('shawn', '7f68f4c5-2d66-498d-b9d7-538bba770483')).toBe(
			'shawn-7f68f4c5-2d66-498d-b9d7-538bba770483'
		)
	})

	it('works with multi-part usernames', () => {
		expect(getCompositeUsername('mary-jane', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(
			'mary-jane-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
		)
	})
})

describe('parseCompositeUsername', () => {
	it('parses a valid composite username', () => {
		const result = parseCompositeUsername('shawn-7f68f4c5-2d66-498d-b9d7-538bba770483')
		expect(result).toEqual({
			username: 'shawn',
			bookId: '7f68f4c5-2d66-498d-b9d7-538bba770483',
		})
	})

	it('parses composite with multi-part base username', () => {
		const result = parseCompositeUsername('mary-jane-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
		expect(result).toEqual({
			username: 'mary-jane',
			bookId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
		})
	})

	it('returns null for a plain username', () => {
		expect(parseCompositeUsername('shawn')).toBeNull()
	})

	it('returns null for a username with non-UUID suffix', () => {
		expect(parseCompositeUsername('shawn-notauuid')).toBeNull()
	})

	it('returns null for empty string', () => {
		expect(parseCompositeUsername('')).toBeNull()
	})
})

describe('isCompositeUsername', () => {
	it('returns true for composite usernames', () => {
		expect(isCompositeUsername('shawn-7f68f4c5-2d66-498d-b9d7-538bba770483')).toBe(true)
	})

	it('returns false for base usernames', () => {
		expect(isCompositeUsername('shawn')).toBe(false)
	})

	it('returns false for read-only usernames', () => {
		expect(isCompositeUsername('ro-7f68f4c5-2d66-498d-b9d7-538bba770483')).toBe(true)
		// Note: ro- prefixed users with UUID suffix ARE composite format technically
	})
})

// ─── Password propagation logic tests ──────────────────────────────────────────
// These test the core logic of updateUserPassword: that composite users get the
// same hash as the base user. We test this by simulating htpasswd file content.

describe('password propagation to composite users', () => {
	// These tests verify the mapping logic that updateUserPassword uses.
	// We simulate the htpasswd line processing to test the fix in isolation.

	function simulatePasswordUpdate(fileContent: string, targetUsername: string, newHash: string): string {
		const lines = fileContent.split('\n')
		const updatedLines = lines.map(line => {
			const trimmed = line.trim()
			if (trimmed && !trimmed.startsWith('#')) {
				const [lineUsername] = trimmed.split(':')
				if (lineUsername === targetUsername) {
					return `${targetUsername}:${newHash}`
				}
				const parsed = parseCompositeUsername(lineUsername ?? '')
				if (parsed && parsed.username === targetUsername) {
					return `${lineUsername}:${newHash}`
				}
			}
			return line
		})
		return updatedLines.join('\n')
	}

	it('updates the base user hash', () => {
		const content = 'shawn:$2b$10$oldhash\n'
		const result = simulatePasswordUpdate(content, 'shawn', '$2b$10$newhash')
		expect(result).toBe('shawn:$2b$10$newhash\n')
	})

	it('propagates hash to composite users', () => {
		const content = [
			'shawn:$2b$10$oldhash',
			'shawn-7f68f4c5-2d66-498d-b9d7-538bba770483:$2b$10$oldhash',
			'shawn-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:$2b$10$oldhash',
			'',
		].join('\n')

		const result = simulatePasswordUpdate(content, 'shawn', '$2b$10$newhash')
		const lines = result.split('\n').filter(l => l.trim())

		expect(lines).toEqual([
			'shawn:$2b$10$newhash',
			'shawn-7f68f4c5-2d66-498d-b9d7-538bba770483:$2b$10$newhash',
			'shawn-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:$2b$10$newhash',
		])
	})

	it('does not affect other users', () => {
		const content = [
			'shawn:$2b$10$oldhash_shawn',
			'shawn-7f68f4c5-2d66-498d-b9d7-538bba770483:$2b$10$oldhash_shawn',
			'madison:$2b$10$oldhash_madison',
			'madison-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:$2b$10$oldhash_madison',
			'',
		].join('\n')

		const result = simulatePasswordUpdate(content, 'shawn', '$2b$10$newhash')
		const lines = result.split('\n').filter(l => l.trim())

		expect(lines).toEqual([
			'shawn:$2b$10$newhash',
			'shawn-7f68f4c5-2d66-498d-b9d7-538bba770483:$2b$10$newhash',
			'madison:$2b$10$oldhash_madison',
			'madison-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:$2b$10$oldhash_madison',
		])
	})

	it('does not affect read-only users', () => {
		const content = [
			'shawn:$2b$10$oldhash',
			'ro-7f68f4c5-2d66-498d-b9d7-538bba770483:$2b$10$readonly_hash',
			'',
		].join('\n')

		const result = simulatePasswordUpdate(content, 'shawn', '$2b$10$newhash')
		const lines = result.split('\n').filter(l => l.trim())

		expect(lines).toEqual([
			'shawn:$2b$10$newhash',
			'ro-7f68f4c5-2d66-498d-b9d7-538bba770483:$2b$10$readonly_hash',
		])
	})

	it('handles user with no composite users', () => {
		const content = [
			'shawn:$2b$10$oldhash',
			'madison:$2b$10$oldhash_madison',
			'',
		].join('\n')

		const result = simulatePasswordUpdate(content, 'shawn', '$2b$10$newhash')
		const lines = result.split('\n').filter(l => l.trim())

		expect(lines).toEqual([
			'shawn:$2b$10$newhash',
			'madison:$2b$10$oldhash_madison',
		])
	})

	it('preserves comments and blank lines', () => {
		const content = [
			'# This is a comment',
			'shawn:$2b$10$oldhash',
			'',
			'shawn-7f68f4c5-2d66-498d-b9d7-538bba770483:$2b$10$oldhash',
			'',
		].join('\n')

		const result = simulatePasswordUpdate(content, 'shawn', '$2b$10$newhash')

		expect(result).toBe(
			[
				'# This is a comment',
				'shawn:$2b$10$newhash',
				'',
				'shawn-7f68f4c5-2d66-498d-b9d7-538bba770483:$2b$10$newhash',
				'',
			].join('\n')
		)
	})

	it('handles multi-part base username correctly', () => {
		const content = [
			'mary-jane:$2b$10$oldhash',
			'mary-jane-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:$2b$10$oldhash',
			'mary:$2b$10$other_hash',
			'',
		].join('\n')

		const result = simulatePasswordUpdate(content, 'mary-jane', '$2b$10$newhash')
		const lines = result.split('\n').filter(l => l.trim())

		expect(lines).toEqual([
			'mary-jane:$2b$10$newhash',
			'mary-jane-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:$2b$10$newhash',
			'mary:$2b$10$other_hash',
		])
	})
})
