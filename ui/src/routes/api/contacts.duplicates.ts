import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getAllContacts } from '../../lib/db'
import { detectDuplicates, type DuplicateGroup } from '../../lib/merge'

export const Route = createFileRoute('/api/contacts/duplicates')({
	server: {
		handlers: {
			GET: async () => {
				try {
					const contacts = await getAllContacts()
					const duplicateGroups = detectDuplicates(contacts)

					return json({
						groups: duplicateGroups,
						totalGroups: duplicateGroups.length,
						totalDuplicates: duplicateGroups.reduce((sum, group) => sum + group.contacts.length, 0),
					})
				} catch (error) {
					console.error('Error detecting duplicates:', error)
					return json(
						{
							error: 'Failed to detect duplicates',
							details: error instanceof Error ? error.message : 'Unknown error',
						},
						{ status: 500 }
					)
				}
			},
		},
	},
})
