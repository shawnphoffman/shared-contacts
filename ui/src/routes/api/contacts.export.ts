import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { getAllContacts, getContactById } from '../../lib/db'
import { contactsToCsv } from '../../lib/csv'
import { contactsToVcf } from '../../lib/contact-export'

/** Contacts for an explicit id list, in the order asked for, skipping any that are gone. */
async function getContactsByIds(ids: Array<string>) {
	const contacts = await Promise.all(ids.map(id => getContactById(id)))
	return contacts.filter((contact): contact is NonNullable<typeof contact> => contact !== null)
}

/**
 * Build the download.
 *
 * `ids` exports exactly what the person was looking at; without it the export
 * is everything, which is what it always used to be regardless of the filter
 * or selection on screen.
 */
async function buildExport(format: string | undefined, ids: Array<string>): Promise<Response> {
	if (!format || !['csv', 'vcf'].includes(format)) {
		return json({ error: 'Missing or invalid format parameter. Use ?format=csv or ?format=vcf' }, { status: 400 })
	}

	const contacts = ids.length > 0 ? await getContactsByIds(ids) : await getAllContacts()

	if (format === 'csv') {
		return new Response(contactsToCsv(contacts), {
			status: 200,
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': 'attachment; filename=contacts.csv',
			},
		})
	}

	return new Response(await contactsToVcf(contacts), {
		status: 200,
		headers: {
			'Content-Type': 'text/vcard; charset=utf-8',
			'Content-Disposition': 'attachment; filename=contacts.vcf',
		},
	})
}

export const Route = createFileRoute('/api/contacts/export')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url)
					return await buildExport(url.searchParams.get('format')?.toLowerCase(), url.searchParams.getAll('id'))
				} catch (error) {
					logger.error({ error }, 'Failed to export contacts')
					return json({ error: 'Failed to export contacts' }, { status: 500 })
				}
			},
			// A filtered export can name thousands of contacts, which is more than
			// a query string can carry, so the id list travels in a body.
			POST: async ({ request }) => {
				try {
					const body = (await request.json()) as { format?: string; ids?: Array<string> }
					const ids = Array.isArray(body.ids) ? body.ids.filter(id => typeof id === 'string') : []
					return await buildExport(body.format?.toLowerCase(), ids)
				} catch (error) {
					logger.error({ error }, 'Failed to export contacts')
					return json({ error: 'Failed to export contacts' }, { status: 500 })
				}
			},
		},
	},
})
