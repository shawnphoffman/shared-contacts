import { describe, it, expect } from 'vitest'
import { parseContactRow } from './db'

describe('parseContactRow', () => {
	it('parses string-encoded JSONB fields into arrays', () => {
		const row = {
			id: '1',
			full_name: 'John Doe',
			phones: '[{"value":"+1-555-0100","type":"CELL"}]',
			emails: '[{"value":"john@example.com","type":"INTERNET"}]',
			addresses: '[]',
			urls: '[]',
			org_units: '[]',
			categories: '[]',
			labels: '[]',
			logos: '[]',
			sounds: '[]',
			keys: '[]',
			custom_fields: '[]',
		}

		const result = parseContactRow(row)
		expect(result.phones).toEqual([{ value: '+1-555-0100', type: 'CELL' }])
		expect(result.emails).toEqual([{ value: 'john@example.com', type: 'INTERNET' }])
		expect(result.addresses).toEqual([])
	})

	it('passes through already-parsed arrays unchanged', () => {
		const phones = [{ value: '+1-555-0100', type: 'CELL' }]
		const row = {
			id: '1',
			phones,
			emails: [],
		}

		const result = parseContactRow(row)
		expect(result.phones).toBe(phones) // same reference
		expect(result.emails).toEqual([])
	})

	it('handles null/undefined fields without crashing', () => {
		const row = {
			id: '1',
			phones: null,
			emails: undefined,
			full_name: 'Test',
		}

		const result = parseContactRow(row)
		expect(result.phones).toBeNull()
		expect(result.emails).toBeUndefined()
		expect(result.full_name).toBe('Test')
	})

	it('handles rows with no JSONB fields', () => {
		const row = { id: '1', full_name: 'Test' }
		const result = parseContactRow(row)
		expect(result).toEqual({ id: '1', full_name: 'Test' })
	})

	it('handles malformed JSON gracefully', () => {
		const row = { id: '1', phones: 'not valid json' }
		expect(() => parseContactRow(row)).toThrow() // JSON.parse will throw
	})
})
