/**
 * Deleting a contact is a soft delete: the row keeps its data and gains a
 * `deleted_at`, and the Trash page restores it. Shared here because the delete
 * flows on the contact list and the detail page both offer an undo, and the
 * Trash page performs the same actions.
 */
export type TrashAction = 'restore' | 'permanent-delete' | 'empty'

export async function trashAction(action: TrashAction, id?: string): Promise<void> {
	const response = await fetch('/api/contacts/trash', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action, id }),
	})
	if (!response.ok) {
		throw new Error('Failed to perform trash action')
	}
}

/** Restore contacts, reporting how many came back rather than failing on the first. */
export async function restoreContacts(ids: Array<string>): Promise<{ restored: number; failed: number }> {
	const results = await Promise.allSettled(ids.map(id => trashAction('restore', id)))
	const failed = results.filter(result => result.status === 'rejected').length
	return { restored: results.length - failed, failed }
}
