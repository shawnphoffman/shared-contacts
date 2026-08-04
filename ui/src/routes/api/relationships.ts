import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { logger } from '../../lib/logger'
import { zodError } from '../../lib/contact-helpers'
import { CreateRelationshipSchema } from '../../lib/schemas'
import { actorFromRequest, recordHistory } from '../../lib/history'
import {
	DuplicateRelationshipError,
	UnknownEndpointError,
	createRelationship,
	describeRelationship,
	endpointA,
	endpointB,
	getEndpointNames,
	refKey,
	relationshipsEnabled,
} from '../../lib/relationships'
import type { NodeRef } from '../../lib/relationships'

export const Route = createFileRoute('/api/relationships')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					if (!(await relationshipsEnabled())) {
						return json({ error: 'Relationships are not available (migration pending)' }, { status: 503 })
					}
					const body = await request.json()
					const parsed = CreateRelationshipSchema.safeParse(body)
					if (!parsed.success) return zodError(parsed.error)

					const result = await createRelationship({
						a: parsed.data.a,
						b: parsed.data.b,
						type: parsed.data.type,
						qualifier: parsed.data.qualifier ?? null,
					})

					// One history row per edge: anchored on the first contact endpoint,
					// with the other contact in related_contact_ids so the entry shows
					// on both contacts' history tabs (the per-contact query matches
					// either column). Placeholder-only endpoints are named in the summary.
					const { relationship, a, b, autoAdded, autoRemoved } = result
					const nameRefs = [a, b]
					for (const row of [...autoAdded, ...autoRemoved]) nameRefs.push(endpointA(row), endpointB(row))
					const names = await getEndpointNames(nameRefs)
					const nameOf = (ref: NodeRef) => names.get(refKey(ref)) ?? 'Unknown'
					const edgeSentence = (row: typeof relationship) => {
						const rowA = endpointA(row)
						const rowB = endpointB(row)
						return row.type === 'parent'
							? `${nameOf(rowA)} is a ${describeRelationship('parent', row.qualifier, false)} of ${nameOf(rowB)}`
							: `${nameOf(rowA)} and ${nameOf(rowB)} are ${describeRelationship(row.type, row.qualifier, false)}s`
					}
					const actor = actorFromRequest(request)
					const record = (row: typeof relationship, operation: 'relationship_add' | 'relationship_remove', summary: string) => {
						const contactEndpoints = [endpointA(row), endpointB(row)].filter(ref => ref.kind === 'contact')
						if (contactEndpoints.length === 0) return Promise.resolve(null)
						return recordHistory({
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

					await record(relationship, 'relationship_add', `Added relationship: ${edgeSentence(relationship)}`)
					const autoSummaries: Array<string> = []
					for (const row of autoAdded) {
						const sentence = edgeSentence(row)
						autoSummaries.push(sentence)
						await record(row, 'relationship_add', `Auto-linked: ${sentence}`)
					}
					// The manual edge itself being absorbed into derived form isn't a
					// user-meaningful removal, so it gets no history row.
					for (const row of autoRemoved) {
						if (row.id === relationship.id) continue
						await record(row, 'relationship_remove', `Auto-removed (now derived from shared parents): ${edgeSentence(row)}`)
					}

					return json(
						{
							relationship,
							created_placeholders: result.createdPlaceholders,
							auto_added: autoAdded,
							auto_added_summaries: autoSummaries,
							auto_removed: autoRemoved.length,
						},
						{ status: 201 }
					)
				} catch (error) {
					if (error instanceof DuplicateRelationshipError) {
						return json({ error: error.message }, { status: 409 })
					}
					if (error instanceof UnknownEndpointError) {
						return json({ error: error.message }, { status: 400 })
					}
					logger.error({ err: error }, 'Error creating relationship')
					return json({ error: 'Failed to create relationship' }, { status: 500 })
				}
			},
		},
	},
})
