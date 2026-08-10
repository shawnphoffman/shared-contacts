import { logger } from './logger'
import { generateVCard } from './vcard'
import { getRelatedNamesByContact, injectRelatedNames, relationshipsEnabled } from './relationships'
import type { Contact } from './db'
import type { RelatedName } from './relationships'

/**
 * Render contacts as a single vCard stream, with RELATED entries injected from
 * the relationship graph. Shared by the manual `/api/contacts/export` download
 * and the scheduled backups so the two can't drift apart.
 */
export async function contactsToVcf(contacts: Array<Contact>): Promise<string> {
	// One batch computation for the whole export instead of per-contact walks.
	let relatedByContact = new Map<string, Array<RelatedName>>()
	try {
		if (await relationshipsEnabled()) relatedByContact = await getRelatedNamesByContact()
	} catch (error) {
		logger.error({ err: error }, 'Failed to compute related names for export')
	}
	return contacts.map(contact => injectRelatedNames(generateVCard(contact), relatedByContact.get(contact.id) ?? [])).join('\r\n')
}
