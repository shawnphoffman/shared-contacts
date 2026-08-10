import { describe, expect, it } from 'vitest'
import { listsForContact, normalizeMemberUid } from './contact-groups'
import type { Contact } from './db'

function groupCard(id: string, name: string, members: Array<string>): Contact {
	return { id, full_name: name, kind: 'group', group_members: members } as unknown as Contact
}

describe('normalizeMemberUid', () => {
	it('strips the urn:uuid prefix Apple writes', () => {
		expect(normalizeMemberUid('urn:uuid:ABC-123')).toBe('abc-123')
	})

	it('accepts a bare UID from clients that omit the prefix', () => {
		expect(normalizeMemberUid('ABC-123')).toBe('abc-123')
	})

	it('ignores surrounding whitespace and UID casing', () => {
		expect(normalizeMemberUid('  urn:UUID:AbC-123 ')).toBe('abc-123')
	})
})

describe('listsForContact', () => {
	const groups = [
		groupCard('g1', 'CA Alpine Club', ['urn:uuid:shawn-1', 'urn:uuid:madison-2']),
		groupCard('g2', 'Neighbors', ['madison-2']),
		groupCard('g3', 'Empty List', []),
	]

	it('finds every list naming the contact, across both member spellings', () => {
		expect(listsForContact('madison-2', groups)).toEqual([
			{ id: 'g1', name: 'CA Alpine Club' },
			{ id: 'g2', name: 'Neighbors' },
		])
	})

	it('returns nothing for a contact in no list', () => {
		expect(listsForContact('nobody-9', groups)).toEqual([])
	})

	it('returns nothing when the contact has never synced and has no UID', () => {
		expect(listsForContact(null, groups)).toEqual([])
	})

	it('does not match a group whose member list is null', () => {
		const withNullMembers = [{ id: 'g4', full_name: 'Unsynced', kind: 'group', group_members: null } as unknown as Contact]
		expect(listsForContact('shawn-1', withNullMembers)).toEqual([])
	})
})
