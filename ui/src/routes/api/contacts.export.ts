import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { getAllContacts } from '../../lib/db'
import { generateVCard } from '../../lib/vcard'
import { contactsToCsv } from '../../lib/csv'
import { getRelatedNamesByContact, injectRelatedNames, relationshipsEnabled } from '../../lib/relationships'
import type { Contact } from '../../lib/db'
import type { RelatedName } from '../../lib/relationships'

async function contactsToVcf(contacts: Array<Contact>): Promise<string> {
	// One batch computation for the whole export instead of per-contact walks.
	let relatedByContact = new Map<string, Array<RelatedName>>()
	try {
		if (await relationshipsEnabled()) relatedByContact = await getRelatedNamesByContact()
	} catch (error) {
		logger.error({ err: error }, 'Failed to compute related names for export')
	}
	return contacts.map(contact => injectRelatedNames(generateVCard(contact), relatedByContact.get(contact.id) ?? [])).join('\r\n')
}

export const Route = createFileRoute('/api/contacts/export')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url)
					const format = url.searchParams.get('format')?.toLowerCase()

					if (!format || !['csv', 'vcf'].includes(format)) {
						return json({ error: 'Missing or invalid format parameter. Use ?format=csv or ?format=vcf' }, { status: 400 })
					}

					const contacts = await getAllContacts()

					if (format === 'csv') {
						const csv = contactsToCsv(contacts)
						return new Response(csv, {
							status: 200,
							headers: {
								'Content-Type': 'text/csv; charset=utf-8',
								'Content-Disposition': 'attachment; filename=contacts.csv',
							},
						})
					}

					// vcf format
					const vcf = await contactsToVcf(contacts)
					return new Response(vcf, {
						status: 200,
						headers: {
							'Content-Type': 'text/vcard; charset=utf-8',
							'Content-Disposition': 'attachment; filename=contacts.vcf',
						},
					})
				} catch (error) {
					logger.error({ error }, 'Failed to export contacts')
					return json({ error: 'Failed to export contacts' }, { status: 500 })
				}
			},
		},
	},
})
