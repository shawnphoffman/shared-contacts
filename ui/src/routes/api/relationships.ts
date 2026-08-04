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
	getEndpointNames,
	refKey,
	relationshipsEnabled,
} from '../../lib/relationships'

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
					const { relationship, a, b } = result
					const names = await getEndpointNames([a, b])
					const aName = names.get(refKey(a)) ?? 'Unknown'
					const bName = names.get(refKey(b)) ?? 'Unknown'
					const actor = actorFromRequest(request)
					const summary =
						relationship.type === 'parent'
							? `Added relationship: ${aName} is a ${describeRelationship('parent', relationship.qualifier, false)} of ${bName}`
							: `Added relationship: ${aName} and ${bName} are ${describeRelationship(relationship.type, relationship.qualifier, false)}s`
					const contactEndpoints = [a, b].filter(ref => ref.kind === 'contact')
					if (contactEndpoints.length > 0) {
						await recordHistory({
							contactId: contactEndpoints[0].id,
							operation: 'relationship_add',
							source: actor.source,
							actor: actor.actor,
							actorType: actor.actorType,
							userAgent: actor.userAgent,
							clientIp: actor.clientIp,
							summary,
							relatedContactIds: contactEndpoints.slice(1).map(other => other.id),
							metadata: { relationship_id: relationship.id, type: relationship.type, qualifier: relationship.qualifier },
						})
					}

					return json({ relationship, created_placeholders: result.createdPlaceholders }, { status: 201 })
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
