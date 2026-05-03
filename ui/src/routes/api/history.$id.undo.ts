import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { createContact, deleteContact, getContactById, restoreContact, updateContact } from '../../lib/db'
import { actorFromRequest, getHistoryById, markHistoryUndone, recordHistory } from '../../lib/history'
import { generateVCard } from '../../lib/vcard'
import type { Contact } from '../../lib/db'

/**
 * Fields to copy from a history snapshot back onto a Contact during undo.
 * Excludes id/created_at and sync metadata that should be re-derived.
 */
const RESTORABLE_FIELDS = [
	'vcard_id',
	'full_name',
	'first_name',
	'last_name',
	'middle_name',
	'name_prefix',
	'name_suffix',
	'nickname',
	'maiden_name',
	'email',
	'phone',
	'phones',
	'emails',
	'organization',
	'org_units',
	'job_title',
	'role',
	'address',
	'addresses',
	'address_street',
	'address_extended',
	'address_city',
	'address_state',
	'address_postal',
	'address_country',
	'birthday',
	'homepage',
	'urls',
	'categories',
	'labels',
	'logos',
	'sounds',
	'keys',
	'mailer',
	'time_zone',
	'geo',
	'agent',
	'prod_id',
	'revision',
	'sort_string',
	'class',
	'custom_fields',
	'notes',
	'photo_mime',
	'photo_width',
	'photo_height',
	'photo_updated_at',
	'photo_hash',
	'vcard_data',
] as const

function snapshotToContact(snapshot: Record<string, unknown>): Partial<Contact> {
	const out: Record<string, unknown> = {}
	for (const field of RESTORABLE_FIELDS) {
		if (field in snapshot) {
			const value = snapshot[field]
			if (field === 'birthday' || field === 'photo_updated_at') {
				out[field] = value ? new Date(value as string) : null
			} else {
				out[field] = value
			}
		}
	}
	return out as Partial<Contact>
}

export const Route = createFileRoute('/api/history/$id/undo')({
	server: {
		handlers: {
			POST: async ({ params, request }) => {
				try {
					const entry = await getHistoryById(params.id)
					if (!entry) return json({ error: 'History entry not found' }, { status: 404 })
					if (entry.undone_at) return json({ error: 'History entry has already been undone' }, { status: 409 })

					const meta = actorFromRequest(request)
					let summary = 'Undid change'
					let resultPayload: Record<string, unknown> = {}

					if (entry.operation === 'create') {
						// Undoing a create => soft delete the new contact.
						if (!entry.contact_id) return json({ error: 'No contact to delete' }, { status: 400 })
						const before = await getContactById(entry.contact_id)
						if (!before) return json({ error: 'Contact not found' }, { status: 404 })
						await deleteContact(entry.contact_id)
						summary = `Undid creation of ${before.full_name || before.email || 'contact'}`
						resultPayload = { contactId: entry.contact_id, action: 'soft-deleted' }
					} else if (entry.operation === 'update') {
						if (!entry.contact_id || !entry.previous_state) {
							return json({ error: 'Missing data to restore' }, { status: 400 })
						}
						const before = await getContactById(entry.contact_id)
						const restored = snapshotToContact(entry.previous_state)
						// Re-generate vcard_data from restored fields so CardDAV stays in sync.
						const vcardData = generateVCard({ ...(before || {}), ...restored } as never)
						await updateContact(entry.contact_id, { ...restored, vcard_data: vcardData, sync_source: 'api', last_synced_to_radicale_at: null })
						summary = `Reverted update on ${restored.full_name || 'contact'}`
						resultPayload = { contactId: entry.contact_id, action: 'reverted' }
					} else if (entry.operation === 'delete') {
						if (!entry.contact_id) return json({ error: 'No contact to restore' }, { status: 400 })
						await restoreContact(entry.contact_id)
						const after = await getContactById(entry.contact_id, true)
						summary = `Restored ${after?.full_name || after?.email || 'contact'}`
						resultPayload = { contactId: entry.contact_id, action: 'restored' }
					} else if (entry.operation === 'restore') {
						if (!entry.contact_id) return json({ error: 'No contact to delete' }, { status: 400 })
						await deleteContact(entry.contact_id)
						summary = `Re-trashed contact`
						resultPayload = { contactId: entry.contact_id, action: 'soft-deleted' }
					} else if (entry.operation === 'merge') {
						// Restore consumed contacts, then revert primary's data to its pre-merge snapshot.
						if (!entry.contact_id || !entry.previous_state) {
							return json({ error: 'Missing data to unmerge' }, { status: 400 })
						}
						const rawConsumed = entry.metadata && Array.isArray(entry.metadata.consumedContacts) ? entry.metadata.consumedContacts : []
						const consumed = (rawConsumed as Array<Record<string, unknown>>).map(snapshotToContact)
						const restoredIds: Array<string> = []

						// First, revert the primary contact to its pre-merge state.
						const restoredPrimary = snapshotToContact(entry.previous_state)
						const primaryVcardData = generateVCard(restoredPrimary as never)
						await updateContact(entry.contact_id, {
							...restoredPrimary,
							vcard_data: primaryVcardData,
							sync_source: 'api',
							last_synced_to_radicale_at: null,
						})

						// Restore consumed contacts (which were soft-deleted at merge time).
						const consumedIds = entry.related_contact_ids ?? []
						for (let i = 0; i < consumedIds.length; i++) {
							const consumedId = consumedIds[i]
							const consumedSnapshot = consumed[i] as Partial<Contact> | undefined
							const existing = await getContactById(consumedId, true)
							if (existing) {
								await restoreContact(consumedId)
								if (consumedSnapshot) {
									const vcardData = generateVCard({ ...existing, ...consumedSnapshot } as never)
									await updateContact(consumedId, {
										...consumedSnapshot,
										vcard_data: vcardData,
										sync_source: 'api',
										last_synced_to_radicale_at: null,
									})
								}
								restoredIds.push(consumedId)
							} else if (consumedSnapshot) {
								// Permanently gone — recreate from the snapshot.
								const created = await createContact({
									...consumedSnapshot,
									sync_source: 'api',
									last_synced_to_radicale_at: null,
								})
								restoredIds.push(created.id)
							}
						}

						summary = `Unmerged ${restoredIds.length} contact(s)`
						resultPayload = { contactId: entry.contact_id, action: 'unmerged', restoredIds }
					} else if (entry.operation === 'permanent_delete') {
						// Recreate from snapshot if available.
						if (!entry.previous_state) return json({ error: 'No snapshot to restore from' }, { status: 400 })
						const restored = snapshotToContact(entry.previous_state)
						const created = await createContact({
							...restored,
							sync_source: 'api',
							last_synced_to_radicale_at: null,
						})
						summary = `Recreated permanently-deleted ${created.full_name || created.email || 'contact'}`
						resultPayload = { contactId: created.id, action: 'recreated' }
					} else {
						return json({ error: `Cannot undo operation: ${entry.operation}` }, { status: 400 })
					}

					const undoId = await recordHistory({
						contactId: entry.contact_id,
						operation: 'undo',
						source: meta.source,
						actor: meta.actor,
						actorType: meta.actorType,
						userAgent: meta.userAgent,
						clientIp: meta.clientIp,
						summary,
						undoesHistoryId: entry.id,
						relatedContactIds: entry.related_contact_ids || undefined,
					})
					if (undoId) {
						await markHistoryUndone(entry.id, undoId)
					}
					return json({ message: summary, ...resultPayload, undoHistoryId: undoId })
				} catch (error) {
					logger.error({ err: error, historyId: params.id }, 'Failed to undo history entry')
					return json(
						{
							error: 'Failed to undo change',
							details: error instanceof Error ? error.message : 'Unknown error',
						},
						{ status: 500 }
					)
				}
			},
		},
	},
})
