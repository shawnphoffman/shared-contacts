import { describe, expect, it } from 'vitest'
import { generateVCard } from './vcard'

describe('generateVCard line folding (large content regression)', () => {
	// Regression for an O(n^2) line-folding bug that OOM-crashed the UI process
	// when generating a vCard for a contact with a large embedded photo (a
	// multi-MB base64 PHOTO line). A big NOTE exercises the same foldVCardLine
	// path. The old implementation rebuilt the whole remaining string each
	// iteration and could not complete this; it must now be fast and correct.
	it('folds a multi-megabyte line without exhausting memory', () => {
		const big = 'x'.repeat(3_000_000)
		const result = generateVCard({ full_name: 'Big Note', notes: big })

		expect(result).toContain('END:VCARD')
		// Every physical line stays within the folded width (75 + optional leading space).
		for (const line of result.split('\r\n')) {
			expect(line.length).toBeLessThanOrEqual(76)
		}
		// Unfolding (drop CRLF + the single leading space on continuation lines)
		// must reconstruct the original note content.
		const unfolded = result.replace(/\r\n /g, '')
		expect(unfolded).toContain(`NOTE:${big}`)
	})
})
