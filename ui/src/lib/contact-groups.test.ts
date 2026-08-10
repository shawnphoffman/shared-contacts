import { describe, expect, it } from 'vitest'
import { listsForContact, normalizeMemberUid, renameGroupVCard } from './contact-groups'
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

describe('renameGroupVCard', () => {
	const card = [
		'BEGIN:VCARD',
		'VERSION:3.0',
		'N:CA Alpine Club;;;;',
		'FN:CA Alpine Club',
		'X-ADDRESSBOOKSERVER-KIND:group',
		'X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:person-1',
		'X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:person-2',
		'UID:group-1',
		'END:VCARD',
	].join('\r\n')

	it('replaces both name properties and leaves the rest of the card untouched', () => {
		const renamed = renameGroupVCard(card, 'Alpine Crew')

		expect(renamed.split('\r\n')).toEqual([
			'BEGIN:VCARD',
			'VERSION:3.0',
			'N:Alpine Crew;;;;',
			'FN:Alpine Crew',
			'X-ADDRESSBOOKSERVER-KIND:group',
			'X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:person-1',
			'X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:person-2',
			'UID:group-1',
			'END:VCARD',
		])
	})

	it('keeps the line ending the client used', () => {
		expect(renameGroupVCard(card.replace(/\r\n/g, '\n'), 'Alpine Crew')).not.toContain('\r')
	})

	it('escapes characters that would otherwise split the property value', () => {
		const renamed = renameGroupVCard(card, 'Ski, Climb; Hike\\Ride')
		expect(renamed).toContain('FN:Ski\\, Climb\\; Hike\\\\Ride')
		expect(renamed).toContain('N:Ski\\, Climb\\; Hike\\\\Ride;;;;')
	})

	it('drops the folded continuation of a long old name instead of stranding it', () => {
		const folded = [
			'BEGIN:VCARD',
			'FN:A very long list name that Apple wrapped across two physical lines beca',
			' use it exceeded seventy five characters',
			'X-ADDRESSBOOKSERVER-KIND:group',
			'END:VCARD',
		].join('\r\n')

		const renamed = renameGroupVCard(folded, 'Short')
		expect(renamed).not.toContain('use it exceeded')
		expect(renamed).toContain('FN:Short')
	})

	it('adds the name properties to a card that is missing them, before END:VCARD', () => {
		const nameless = ['BEGIN:VCARD', 'X-ADDRESSBOOKSERVER-KIND:group', 'UID:group-1', 'END:VCARD'].join('\r\n')

		expect(renameGroupVCard(nameless, 'Rescued').split('\r\n')).toEqual([
			'BEGIN:VCARD',
			'X-ADDRESSBOOKSERVER-KIND:group',
			'UID:group-1',
			'FN:Rescued',
			'N:Rescued;;;;',
			'END:VCARD',
		])
	})

	it('rewrites a parameterised FN rather than leaving a second one behind', () => {
		const parameterised = ['BEGIN:VCARD', 'FN;CHARSET=UTF-8:CA Alpine Club', 'N;CHARSET=UTF-8:CA Alpine Club;;;;', 'END:VCARD'].join('\r\n')

		const renamed = renameGroupVCard(parameterised, 'Alpine Crew')
		expect(renamed).not.toContain('CA Alpine Club')
		expect(renamed.match(/^FN[;:]/gm)).toHaveLength(1)
	})
})
