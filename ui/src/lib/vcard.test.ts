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

describe('group cards (Apple "lists")', () => {
	// Group cards are authored in the CardDAV client, but any UI write path that
	// regenerates vcard_data from columns must rebuild them intact rather than
	// emitting a card with no members.
	it('emits the Apple group markers when the row is a group', () => {
		const result = generateVCard({
			vcard_id: 'group-1',
			full_name: 'CA Alpine Club',
			kind: 'group',
			group_members: ['urn:uuid:AAAA-1111', 'urn:uuid:BBBB-2222'],
		})

		expect(result).toContain('UID:group-1')
		expect(result).toContain('X-ADDRESSBOOKSERVER-KIND:group')
		expect(result).toContain('X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:AAAA-1111')
		expect(result).toContain('X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:BBBB-2222')
	})

	it('leaves ordinary contacts unmarked', () => {
		const result = generateVCard({ vcard_id: 'person-1', full_name: 'Shawn Hoffman', last_name: 'Hoffman', first_name: 'Shawn' })

		expect(result).not.toContain('ADDRESSBOOKSERVER')
	})

	it('emits the kind marker even when a group has no members yet', () => {
		const result = generateVCard({ vcard_id: 'group-2', full_name: 'New List', kind: 'group', group_members: [] })

		expect(result).toContain('X-ADDRESSBOOKSERVER-KIND:group')
		expect(result).not.toContain('X-ADDRESSBOOKSERVER-MEMBER')
	})
})
