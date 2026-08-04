import { getPool, tableExists } from './db'

// One canonical relationship graph; every tree view is a projection of it.
// Edges live between two endpoints (contact or placeholder person) and are
// stored exactly once - see migrations/20_relationships.sql for the rules.
// Relationships never touch vcard_data, so the CardDAV sync pipeline is
// unaffected by anything in this module.

export type RelationshipType = 'parent' | 'spouse' | 'partner' | 'sibling'

export const RELATIONSHIP_TYPES: Array<RelationshipType> = ['parent', 'spouse', 'partner', 'sibling']

const SYMMETRIC_TYPES = new Set<RelationshipType>(['spouse', 'partner', 'sibling'])

export interface PlaceholderPerson {
	id: string
	name: string
	birth_year: number | null
	death_year: number | null
	notes: string | null
	created_at: Date
	updated_at: Date
}

export interface RelationshipRow {
	id: string
	a_contact_id: string | null
	a_placeholder_id: string | null
	b_contact_id: string | null
	b_placeholder_id: string | null
	type: RelationshipType
	qualifier: string | null
	created_at: Date
	updated_at: Date
}

export interface NodeRef {
	kind: 'contact' | 'placeholder'
	id: string
}

// Node keys ("c:<uuid>" / "p:<uuid>") are how the graph API and the UI refer
// to endpoints without two parallel id fields everywhere.
export function refKey(ref: NodeRef): string {
	return `${ref.kind === 'contact' ? 'c' : 'p'}:${ref.id}`
}

export function parseKey(key: string): NodeRef | null {
	const match = /^([cp]):([0-9a-f-]{36})$/i.exec(key)
	if (!match) return null
	return { kind: match[1] === 'c' ? 'contact' : 'placeholder', id: match[2] }
}

export function endpointA(row: RelationshipRow): NodeRef {
	return row.a_contact_id ? { kind: 'contact', id: row.a_contact_id } : { kind: 'placeholder', id: row.a_placeholder_id! }
}

export function endpointB(row: RelationshipRow): NodeRef {
	return row.b_contact_id ? { kind: 'contact', id: row.b_contact_id } : { kind: 'placeholder', id: row.b_placeholder_id! }
}

/**
 * Canonical endpoint order. Directional types (parent: A is the parent of B)
 * keep the caller's order. Symmetric types are stored once in a stable order
 * (contacts before placeholders, then ascending id) so a duplicate edge in
 * either direction collides on the unique index.
 */
export function canonicalizeEndpoints(a: NodeRef, b: NodeRef, type: RelationshipType): [NodeRef, NodeRef] {
	if (!SYMMETRIC_TYPES.has(type)) return [a, b]
	const sortKey = (ref: NodeRef) => `${ref.kind === 'contact' ? '0' : '1'}:${ref.id}`
	return sortKey(a) <= sortKey(b) ? [a, b] : [b, a]
}

// ---------------------------------------------------------------------------
// Graph shape returned to the UI
// ---------------------------------------------------------------------------

export interface GraphNode {
	key: string
	kind: 'contact' | 'placeholder'
	id: string
	name: string
	/** Contacts only - "YYYY-MM-DD" birthday string */
	birthday: string | null
	/** Placeholders only */
	birth_year: number | null
	death_year: number | null
	photo_hash: string | null
	photo_updated_at: Date | string | null
}

export interface GraphEdge {
	id: string
	type: RelationshipType
	qualifier: string | null
	/** Node key; for `parent` edges, `a` is the parent of `b` */
	a: string
	b: string
}

export interface DerivedSibling {
	a: string
	b: string
	sharedParents: number
}

export interface EgoGraph {
	focus: string
	nodes: Array<GraphNode>
	edges: Array<GraphEdge>
	derivedSiblings: Array<DerivedSibling>
}

/**
 * Siblings are primarily a derived fact: two nodes sharing at least one
 * parent edge. Explicit sibling edges exist only for people whose parents
 * aren't in the graph, so pairs already covered by an explicit edge are
 * excluded here and the UI unions the two sources.
 */
export function deriveSiblings(edges: Array<GraphEdge>): Array<DerivedSibling> {
	const childrenOf = new Map<string, Array<string>>()
	const explicit = new Set<string>()
	const pairKey = (x: string, y: string) => (x <= y ? `${x}|${y}` : `${y}|${x}`)

	for (const edge of edges) {
		if (edge.type === 'parent') {
			const children = childrenOf.get(edge.a) ?? []
			children.push(edge.b)
			childrenOf.set(edge.a, children)
		} else if (edge.type === 'sibling') {
			explicit.add(pairKey(edge.a, edge.b))
		}
	}

	const shared = new Map<string, number>()
	for (const children of childrenOf.values()) {
		for (let i = 0; i < children.length; i++) {
			for (let j = i + 1; j < children.length; j++) {
				if (children[i] === children[j]) continue
				const key = pairKey(children[i], children[j])
				shared.set(key, (shared.get(key) ?? 0) + 1)
			}
		}
	}

	const derived: Array<DerivedSibling> = []
	for (const [key, count] of shared) {
		if (explicit.has(key)) continue
		const [a, b] = key.split('|')
		derived.push({ a, b, sharedParents: count })
	}
	return derived
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export class DuplicateRelationshipError extends Error {
	constructor() {
		super('This relationship already exists')
		this.name = 'DuplicateRelationshipError'
	}
}

export class UnknownEndpointError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'UnknownEndpointError'
	}
}

export async function relationshipsEnabled(): Promise<boolean> {
	return (await tableExists('contact_relationships')) && (await tableExists('relationship_placeholders'))
}

export async function getRelationship(id: string): Promise<RelationshipRow | null> {
	const pool = getPool()
	const result = await pool.query('SELECT * FROM contact_relationships WHERE id = $1', [id])
	return result.rows[0] ?? null
}

export async function getPlaceholdersByIds(ids: Array<string>): Promise<Array<PlaceholderPerson>> {
	if (ids.length === 0) return []
	const pool = getPool()
	const result = await pool.query('SELECT * FROM relationship_placeholders WHERE id = ANY($1)', [ids])
	return result.rows
}

export interface EndpointInput {
	contact_id?: string
	placeholder_id?: string
	new_placeholder?: { name: string; birth_year?: number | null; death_year?: number | null }
}

export interface CreateRelationshipInput {
	a: EndpointInput
	b: EndpointInput
	type: RelationshipType
	qualifier?: string | null
}

export interface CreateRelationshipResult {
	relationship: RelationshipRow
	a: NodeRef
	b: NodeRef
	createdPlaceholders: Array<PlaceholderPerson>
}

/**
 * Create an edge, creating placeholder people inline when asked. Atomic: a
 * failed insert never leaves an orphan placeholder behind.
 */
export async function createRelationship(input: CreateRelationshipInput): Promise<CreateRelationshipResult> {
	const pool = getPool()
	const client = await pool.connect()
	try {
		await client.query('BEGIN')

		const createdPlaceholders: Array<PlaceholderPerson> = []
		const resolve = async (endpoint: EndpointInput, side: 'a' | 'b'): Promise<NodeRef> => {
			if (endpoint.contact_id) {
				const found = await client.query('SELECT id FROM contacts WHERE id = $1 AND deleted_at IS NULL', [endpoint.contact_id])
				if (found.rowCount === 0) throw new UnknownEndpointError(`Contact for side "${side}" not found`)
				return { kind: 'contact', id: endpoint.contact_id }
			}
			if (endpoint.placeholder_id) {
				const found = await client.query('SELECT id FROM relationship_placeholders WHERE id = $1', [endpoint.placeholder_id])
				if (found.rowCount === 0) throw new UnknownEndpointError(`Placeholder for side "${side}" not found`)
				return { kind: 'placeholder', id: endpoint.placeholder_id }
			}
			const created = await client.query(
				'INSERT INTO relationship_placeholders (name, birth_year, death_year) VALUES ($1, $2, $3) RETURNING *',
				[endpoint.new_placeholder!.name, endpoint.new_placeholder!.birth_year ?? null, endpoint.new_placeholder!.death_year ?? null]
			)
			createdPlaceholders.push(created.rows[0])
			return { kind: 'placeholder', id: created.rows[0].id }
		}

		const rawA = await resolve(input.a, 'a')
		const rawB = await resolve(input.b, 'b')
		const [a, b] = canonicalizeEndpoints(rawA, rawB, input.type)

		const inserted = await client.query(
			`INSERT INTO contact_relationships (a_contact_id, a_placeholder_id, b_contact_id, b_placeholder_id, type, qualifier)
			 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
			[
				a.kind === 'contact' ? a.id : null,
				a.kind === 'placeholder' ? a.id : null,
				b.kind === 'contact' ? b.id : null,
				b.kind === 'placeholder' ? b.id : null,
				input.type,
				input.qualifier ?? null,
			]
		)

		await client.query('COMMIT')
		return { relationship: inserted.rows[0], a, b, createdPlaceholders }
	} catch (error) {
		await client.query('ROLLBACK')
		if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505') {
			throw new DuplicateRelationshipError()
		}
		throw error
	} finally {
		client.release()
	}
}

export async function updateRelationshipQualifier(id: string, qualifier: string | null): Promise<RelationshipRow | null> {
	const pool = getPool()
	const result = await pool.query('UPDATE contact_relationships SET qualifier = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [
		qualifier,
		id,
	])
	return result.rows[0] ?? null
}

/**
 * Delete an edge, then garbage-collect any placeholder person the edge was
 * the last reference to - placeholders only exist to hold the tree together.
 */
export async function deleteRelationship(id: string): Promise<RelationshipRow | null> {
	const pool = getPool()
	const result = await pool.query('DELETE FROM contact_relationships WHERE id = $1 RETURNING *', [id])
	const row: RelationshipRow | undefined = result.rows[0]
	if (!row) return null

	const placeholderIds = [row.a_placeholder_id, row.b_placeholder_id].filter((v): v is string => Boolean(v))
	if (placeholderIds.length > 0) {
		await pool.query(
			`DELETE FROM relationship_placeholders p
			 WHERE p.id = ANY($1)
			 AND NOT EXISTS (
			   SELECT 1 FROM contact_relationships r
			   WHERE r.a_placeholder_id = p.id OR r.b_placeholder_id = p.id
			 )`,
			[placeholderIds]
		)
	}
	return row
}

// Safety caps for the ego-graph walk. Family components are tiny in practice;
// these only guard against pathological data.
const MAX_GRAPH_NODES = 400
const MAX_GRAPH_HOPS = 12

/**
 * The full family component reachable from a contact: BFS across edges in
 * both directions, hopping through contacts and placeholders alike. Deleted
 * contacts (and edges touching them) are dropped from the result.
 */
export async function getEgoGraph(contactId: string): Promise<EgoGraph | null> {
	const pool = getPool()

	const focusResult = await pool.query(
		'SELECT id, full_name, first_name, last_name, birthday, photo_hash, photo_updated_at FROM contacts WHERE id = $1 AND deleted_at IS NULL',
		[contactId]
	)
	if (focusResult.rowCount === 0) return null

	const seenContacts = new Set<string>([contactId])
	const seenPlaceholders = new Set<string>()
	const edgeRows = new Map<string, RelationshipRow>()

	let frontierContacts: Array<string> = [contactId]
	let frontierPlaceholders: Array<string> = []
	let hops = 0

	while ((frontierContacts.length > 0 || frontierPlaceholders.length > 0) && hops < MAX_GRAPH_HOPS) {
		if (seenContacts.size + seenPlaceholders.size >= MAX_GRAPH_NODES) break
		const result = await pool.query(
			`SELECT * FROM contact_relationships
			 WHERE a_contact_id = ANY($1) OR b_contact_id = ANY($1)
			    OR a_placeholder_id = ANY($2) OR b_placeholder_id = ANY($2)`,
			[frontierContacts, frontierPlaceholders]
		)
		const nextContacts = new Set<string>()
		const nextPlaceholders = new Set<string>()
		for (const row of result.rows as Array<RelationshipRow>) {
			edgeRows.set(row.id, row)
			for (const ref of [endpointA(row), endpointB(row)]) {
				if (ref.kind === 'contact' && !seenContacts.has(ref.id)) {
					seenContacts.add(ref.id)
					nextContacts.add(ref.id)
				} else if (ref.kind === 'placeholder' && !seenPlaceholders.has(ref.id)) {
					seenPlaceholders.add(ref.id)
					nextPlaceholders.add(ref.id)
				}
			}
		}
		frontierContacts = [...nextContacts]
		frontierPlaceholders = [...nextPlaceholders]
		hops++
	}

	const [contactRows, placeholderRows] = await Promise.all([
		pool.query(
			'SELECT id, full_name, first_name, last_name, birthday, photo_hash, photo_updated_at FROM contacts WHERE id = ANY($1) AND deleted_at IS NULL',
			[[...seenContacts]]
		),
		getPlaceholdersByIds([...seenPlaceholders]),
	])

	const nodes = new Map<string, GraphNode>()
	for (const row of contactRows.rows) {
		const name = row.full_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unnamed contact'
		nodes.set(`c:${row.id}`, {
			key: `c:${row.id}`,
			kind: 'contact',
			id: row.id,
			name,
			birthday: row.birthday ?? null,
			birth_year: null,
			death_year: null,
			photo_hash: row.photo_hash ?? null,
			photo_updated_at: row.photo_updated_at ?? null,
		})
	}
	for (const row of placeholderRows) {
		nodes.set(`p:${row.id}`, {
			key: `p:${row.id}`,
			kind: 'placeholder',
			id: row.id,
			name: row.name,
			birthday: null,
			birth_year: row.birth_year,
			death_year: row.death_year,
			photo_hash: null,
			photo_updated_at: null,
		})
	}

	// Drop edges touching nodes that didn't survive (deleted contacts).
	const edges: Array<GraphEdge> = []
	for (const row of edgeRows.values()) {
		const a = refKey(endpointA(row))
		const b = refKey(endpointB(row))
		if (!nodes.has(a) || !nodes.has(b)) continue
		edges.push({ id: row.id, type: row.type, qualifier: row.qualifier, a, b })
	}

	return {
		focus: `c:${contactId}`,
		nodes: [...nodes.values()],
		edges,
		derivedSiblings: deriveSiblings(edges),
	}
}

/** Display names for a set of endpoints (history summaries, API responses). */
export async function getEndpointNames(refs: Array<NodeRef>): Promise<Map<string, string>> {
	const pool = getPool()
	const contactIds = refs.filter(r => r.kind === 'contact').map(r => r.id)
	const placeholderIds = refs.filter(r => r.kind === 'placeholder').map(r => r.id)
	const names = new Map<string, string>()
	if (contactIds.length > 0) {
		const result = await pool.query('SELECT id, full_name, first_name, last_name FROM contacts WHERE id = ANY($1)', [contactIds])
		for (const row of result.rows) {
			names.set(`c:${row.id}`, row.full_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unnamed contact')
		}
	}
	if (placeholderIds.length > 0) {
		for (const row of await getPlaceholdersByIds(placeholderIds)) {
			names.set(`p:${row.id}`, row.name)
		}
	}
	return names
}

/**
 * Human labels for a node's edge set relative to a focal node, used in
 * history summaries and the tree's relation captions. Gender-neutral by
 * design - the schema has no gender field to infer from.
 */
export function describeRelationship(type: RelationshipType, qualifier: string | null, fromParentSide: boolean): string {
	const qualifierPrefix = qualifier && qualifier !== 'biological' ? `${qualifier}-` : ''
	switch (type) {
		case 'parent':
			return fromParentSide ? `${qualifierPrefix}child` : `${qualifierPrefix}parent`
		case 'spouse':
			return qualifier === 'ex' ? 'ex-spouse' : 'spouse'
		case 'partner':
			return 'partner'
		case 'sibling':
			return `${qualifierPrefix}sibling`
	}
}
