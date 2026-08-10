/**
 * CardDAV group cards, which Apple Contacts presents as "lists" nested under an
 * address book.
 *
 * A list is not a server-side object: it is an ordinary vCard marked
 * X-ADDRESSBOOKSERVER-KIND:group whose members are named by UID. This app does
 * not author or edit them; it classifies them on sync (contacts.kind) and reads
 * membership back out for display. Editing happens in the CardDAV client.
 */
import { getGroupCards } from './db'
import type { Contact } from './db'

export interface ContactList {
	id: string
	name: string
}

/**
 * Member references are written as "urn:uuid:<uid>" by Apple and as a bare UID
 * by some other clients, and UID case is not guaranteed stable across clients.
 * Normalize both ends before comparing.
 */
export function normalizeMemberUid(raw: string): string {
	return raw
		.trim()
		.replace(/^urn:uuid:/i, '')
		.toLowerCase()
}

/**
 * Which of the supplied group cards list this contact as a member.
 */
export function listsForContact(vcardId: string | null | undefined, groups: Array<Contact>): Array<ContactList> {
	if (!vcardId) return []
	const target = normalizeMemberUid(vcardId)
	if (!target) return []

	return groups
		.filter(group => (group.group_members || []).some(member => normalizeMemberUid(member) === target))
		.map(group => ({ id: group.id, name: group.full_name || 'Untitled list' }))
}

/**
 * Membership for many contacts in one pass, keyed by contact id. Reads every
 * group card once rather than once per contact.
 */
export async function listsByContactId(contacts: Array<Pick<Contact, 'id' | 'vcard_id'>>): Promise<Map<string, Array<ContactList>>> {
	const byContactId = new Map<string, Array<ContactList>>()
	if (contacts.length === 0) return byContactId

	const groups = await getGroupCards()
	if (groups.length === 0) return byContactId

	for (const contact of contacts) {
		const lists = listsForContact(contact.vcard_id, groups)
		if (lists.length > 0) {
			byContactId.set(contact.id, lists)
		}
	}
	return byContactId
}

export async function getListsForContact(vcardId: string | null | undefined): Promise<Array<ContactList>> {
	if (!vcardId) return []
	return listsForContact(vcardId, await getGroupCards())
}
