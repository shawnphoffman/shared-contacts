import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { getAllContacts } from '../../lib/db'
import type { Contact } from '../../lib/db'
import { generateVCard } from '../../lib/vcard'

const CSV_COLUMNS = [
	'first_name',
	'last_name',
	'full_name',
	'email',
	'phone',
	'organization',
	'job_title',
	'address',
	'notes',
	'birthday',
	'homepage',
	'nickname',
	'middle_name',
	'maiden_name',
] as const

function escapeCsvField(value: string | null | undefined): string {
	if (value == null || value === '') return ''
	const str = String(value)
	if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
		return `"${str.replace(/"/g, '""')}"`
	}
	return str
}

function contactsToCsv(contacts: Array<Contact>): string {
	const header = CSV_COLUMNS.join(',')
	const rows = contacts.map((contact) =>
		CSV_COLUMNS.map((col) => escapeCsvField(contact[col as keyof Contact] as string)).join(','),
	)
	return [header, ...rows].join('\r\n')
}

function contactsToVcf(contacts: Array<Contact>): string {
	return contacts.map((contact) => generateVCard(contact)).join('\r\n')
}

export const Route = createFileRoute('/api/contacts/export')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url)
					const format = url.searchParams.get('format')?.toLowerCase()

					if (!format || !['csv', 'vcf'].includes(format)) {
						return json(
							{ error: 'Missing or invalid format parameter. Use ?format=csv or ?format=vcf' },
							{ status: 400 },
						)
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
					const vcf = contactsToVcf(contacts)
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
