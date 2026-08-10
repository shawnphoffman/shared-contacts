/**
 * CardDAV group cards, which Apple Contacts presents as "lists" nested under an
 * address book.
 *
 * A list is not a server-side object: it is an ordinary vCard marked
 * X-ADDRESSBOOKSERVER-KIND:group whose members are named by UID. This app does
 * not author them, and membership is still edited in the CardDAV client; it
 * classifies them on sync (contacts.kind), reads membership back out for
 * display, and can rename or delete a whole list when the client cannot.
 */
import { getAllContacts, getGroupCards } from './db'
import type { Contact } from './db'

export interface ContactList {
	id: string
	name: string
}

export interface ContactListDetail extends ContactList {
	vcard_id: string | null
	/** Every UID named on the card, including any that no longer resolve here. */
	member_count: number
	members: Array<{ id: string; name: string }>
	address_books: Array<{ id: string; name: string }>
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

/**
 * Every list, with its members resolved against the contacts in this app.
 *
 * member_count counts the UIDs on the card while members holds only the ones
 * that still resolve, so a card naming someone who has since been deleted
 * reports the real size of what you are about to rename or remove instead of
 * quietly under-counting it.
 */
export async function getContactLists(): Promise<Array<ContactListDetail>> {
	const groups = await getGroupCards()
	if (groups.length === 0) return []

	const contactByUid = new Map<string, Contact>()
	for (const contact of await getAllContacts()) {
		if (contact.vcard_id) {
			contactByUid.set(normalizeMemberUid(contact.vcard_id), contact)
		}
	}

	return groups.map(group => {
		const memberUids = group.group_members || []
		return {
			id: group.id,
			name: group.full_name || 'Untitled list',
			vcard_id: group.vcard_id,
			member_count: memberUids.length,
			members: memberUids
				.map(member => contactByUid.get(normalizeMemberUid(member)))
				.filter((contact): contact is Contact => Boolean(contact))
				.map(contact => ({ id: contact.id, name: contact.full_name || 'Unnamed contact' })),
			address_books: (group.address_books || []).map(book => ({ id: book.id, name: book.name })),
		}
	})
}

/** Continuation of a folded vCard line, per RFC 6350 §3.2. */
const FOLDED_LINE = /^[ \t]/

function escapeVCardValue(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/\r\n|\r|\n/g, '\\n')
		.replace(/([;,])/g, '\\$1')
}

/**
 * Rewrite the display name of a stored group card.
 *
 * The card is patched rather than regenerated from the contact columns.
 * Apple writes properties this app does not model, and folds its MEMBER lines;
 * regenerating would silently drop the former and is a needless risk to the
 * latter, and losing a MEMBER line empties the list on every device. Only FN
 * and N carry the name, so only those two are touched and the rest of the card
 * round-trips byte for byte.
 */
export function renameGroupVCard(vcardData: string, name: string): string {
	const eol = vcardData.includes('\r\n') ? '\r\n' : '\n'
	const escaped = escapeVCardValue(name.trim())
	const lines = vcardData.split(/\r\n|\r|\n/)
	const rewritten: Array<string> = []
	let sawFn = false
	let sawN = false

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]
		const isFn = /^FN[;:]/i.test(line)
		const isN = /^N[;:]/i.test(line)
		if (!isFn && !isN) {
			rewritten.push(line)
			continue
		}
		// Drop the property's continuation lines along with its first line, or the
		// tail of the old name would survive as a stray fragment.
		while (index + 1 < lines.length && FOLDED_LINE.test(lines[index + 1])) index++
		if (isFn) {
			rewritten.push(`FN:${escaped}`)
			sawFn = true
		} else {
			// Apple stores a list name as "N:<name>;;;;", which the inbound parser
			// reads back as a last name. Keep that shape.
			rewritten.push(`N:${escaped};;;;`)
			sawN = true
		}
	}

	// A card missing either property is malformed, but a rename should still
	// leave something Apple can read rather than an unnamed list.
	const missing: Array<string> = []
	if (!sawFn) missing.push(`FN:${escaped}`)
	if (!sawN) missing.push(`N:${escaped};;;;`)
	if (missing.length > 0) {
		const endIndex = rewritten.findIndex(line => /^END:VCARD/i.test(line))
		rewritten.splice(endIndex === -1 ? rewritten.length : endIndex, 0, ...missing)
	}

	return rewritten.join(eol)
}
