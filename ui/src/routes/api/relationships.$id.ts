import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { zodError } from '../../lib/contact-helpers'
import { UpdateRelationshipSchema } from '../../lib/schemas'
import { actorFromRequest, recordHistory } from '../../lib/history'
import {
	deleteRelationship,
	describeRelationship,
	endpointA,
	endpointB,
	getEndpointNames,
	getRelationship,
	refKey,
	refreshRelatedNamesVcards,
	relationshipsEnabled,
	updateRelationshipQualifier,
} from '../../lib/relationships'
import type { RelationshipRow } from '../../lib/relationships'
import type { HistoryOperation } from '../../lib/history'

// Best-effort vCard refresh after a committed mutation - failure only delays
// the CardDAV export, so it never fails the request.
async function refreshEdgeVcards(row: RelationshipRow): Promise<void> {
	try {
		const contactSeeds = [endpointA(row), endpointB(row)].filter(ref => ref.kind === 'contact').map(ref => ref.id)
		await refreshRelatedNamesVcards(contactSeeds)
	} catch (error) {
		logger.error({ err: error, relationshipId: row.id }, 'Failed to refresh related names in vCards')
	}
}

// One history row per edge, anchored on the first contact endpoint; the other
// contact rides in related_contact_ids so the entry shows on both history tabs.
async function recordEdgeHistory(request: Request, row: RelationshipRow, operation: HistoryOperation, summary: string): Promise<void> {
	const actor = actorFromRequest(request)
	const contactEndpoints = [endpointA(row), endpointB(row)].filter(ref => ref.kind === 'contact')
	if (contactEndpoints.length === 0) return
	await recordHistory({
		contactId: contactEndpoints[0].id,
		operation,
		source: actor.source,
		actor: actor.actor,
		actorType: actor.actorType,
		userAgent: actor.userAgent,
		clientIp: actor.clientIp,
		summary,
		relatedContactIds: contactEndpoints.slice(1).map(other => other.id),
		metadata: { relationship_id: row.id, type: row.type, qualifier: row.qualifier },
	})
}

async function edgeSummary(row: RelationshipRow, verb: string): Promise<string> {
	const a = endpointA(row)
	const b = endpointB(row)
	const names = await getEndpointNames([a, b])
	const aName = names.get(refKey(a)) ?? 'Unknown'
	const bName = names.get(refKey(b)) ?? 'Unknown'
	if (row.type === 'parent') {
		return `${verb} relationship: ${aName} is a ${describeRelationship('parent', row.qualifier, false)} of ${bName}`
	}
	return `${verb} relationship: ${aName} and ${bName} are ${describeRelationship(row.type, row.qualifier, false)}s`
}

export const Route = createFileRoute('/api/relationships/$id')({
	server: {
		handlers: {
			PATCH: async ({ request, params }) => {
				try {
					if (!(await relationshipsEnabled())) {
						return json({ error: 'Relationships are not available (migration pending)' }, { status: 503 })
					}
					const body = await request.json()
					const parsed = UpdateRelationshipSchema.safeParse(body)
					if (!parsed.success) return zodError(parsed.error)

					const updated = await updateRelationshipQualifier(params.id, parsed.data.qualifier)
					if (!updated) return json({ error: 'Relationship not found' }, { status: 404 })

					await recordEdgeHistory(request, updated, 'relationship_update', await edgeSummary(updated, 'Updated'))
					await refreshEdgeVcards(updated)
					return json({ relationship: updated })
				} catch (error) {
					logger.error({ err: error, relationshipId: params.id }, 'Error updating relationship')
					return json({ error: 'Failed to update relationship' }, { status: 500 })
				}
			},
			DELETE: async ({ request, params }) => {
				try {
					if (!(await relationshipsEnabled())) {
						return json({ error: 'Relationships are not available (migration pending)' }, { status: 503 })
					}
					const existing = await getRelationship(params.id)
					if (!existing) return json({ error: 'Relationship not found' }, { status: 404 })

					// Summarize before deleting - the placeholder GC in
					// deleteRelationship can remove the names we need.
					const summary = await edgeSummary(existing, 'Removed')
					const deleted = await deleteRelationship(params.id)
					if (!deleted) return json({ error: 'Relationship not found' }, { status: 404 })

					await recordEdgeHistory(request, deleted, 'relationship_remove', summary)
					await refreshEdgeVcards(deleted)
					return json({ message: 'Relationship removed' })
				} catch (error) {
					logger.error({ err: error, relationshipId: params.id }, 'Error deleting relationship')
					return json({ error: 'Failed to delete relationship' }, { status: 500 })
				}
			},
		},
	},
})
