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

// ---------------------------------------------------------------------------
// Auto-link propagation
//
// "Link parents and siblings when it makes sense": adding a sibling copies
// parents across when exactly one side has them (the edge then becomes
// derived and is dropped); with no parents anywhere, sibling links spread
// transitively. Adding a parent propagates to siblings whose parent set was
// identical to the child's (full siblings), never to half/step siblings.
// Removal is always per-edge - a wrong auto-link is corrected on that one
// person without cascading.
// ---------------------------------------------------------------------------

export interface PropagationPlan {
	addParentEdges: Array<{ parent: NodeRef; child: NodeRef }>
	addSiblingEdges: Array<[NodeRef, NodeRef]>
	removeEdgeIds: Array<string>
}

const EMPTY_PLAN: PropagationPlan = { addParentEdges: [], addSiblingEdges: [], removeEdgeIds: [] }

function sameRefSet(a: Array<NodeRef>, b: Array<NodeRef>): boolean {
	if (a.length !== b.length) return false
	const keys = new Set(a.map(refKey))
	return b.every(ref => keys.has(refKey(ref)))
}

export function planSiblingPropagation(input: {
	a: NodeRef
	b: NodeRef
	newEdgeId: string
	parentsOfA: Array<NodeRef>
	parentsOfB: Array<NodeRef>
	explicitSiblingsOfA: Array<NodeRef>
	explicitSiblingsOfB: Array<NodeRef>
}): PropagationPlan {
	const { a, b, parentsOfA, parentsOfB } = input
	if (parentsOfA.length > 0 && parentsOfB.length === 0) {
		return { addParentEdges: parentsOfA.map(parent => ({ parent, child: b })), addSiblingEdges: [], removeEdgeIds: [input.newEdgeId] }
	}
	if (parentsOfB.length > 0 && parentsOfA.length === 0) {
		return { addParentEdges: parentsOfB.map(parent => ({ parent, child: a })), addSiblingEdges: [], removeEdgeIds: [input.newEdgeId] }
	}
	if (parentsOfA.length > 0 && parentsOfB.length > 0) {
		// Both sides already have recorded parents: equalizing could be wrong
		// (half/step families), so nothing is automatic. A fully redundant
		// edge (identical parents, already derived) is dropped.
		return sameRefSet(parentsOfA, parentsOfB) ? { ...EMPTY_PLAN, removeEdgeIds: [input.newEdgeId] } : EMPTY_PLAN
	}
	// No parents anywhere: sibling links spread transitively.
	const pairKey = (x: NodeRef, y: NodeRef) => [refKey(x), refKey(y)].sort().join('|')
	const seen = new Set<string>([pairKey(a, b)])
	const addSiblingEdges: Array<[NodeRef, NodeRef]> = []
	for (const [others, target] of [
		[input.explicitSiblingsOfA, b],
		[input.explicitSiblingsOfB, a],
	] as Array<[Array<NodeRef>, NodeRef]>) {
		for (const other of others) {
			const key = pairKey(other, target)
			if (refKey(other) === refKey(target) || seen.has(key)) continue
			seen.add(key)
			addSiblingEdges.push([other, target])
		}
	}
	return { addParentEdges: [], addSiblingEdges, removeEdgeIds: [] }
}

export function planParentPropagation(input: {
	parent: NodeRef
	child: NodeRef
	childParentsBefore: Array<NodeRef>
	siblings: Array<{ ref: NodeRef; parents: Array<NodeRef>; explicitEdgeId: string | null }>
}): PropagationPlan {
	const addParentEdges: Array<{ parent: NodeRef; child: NodeRef }> = []
	const removeEdgeIds: Array<string> = []
	const seen = new Set<string>()
	for (const sibling of input.siblings) {
		const key = refKey(sibling.ref)
		if (seen.has(key) || key === refKey(input.child)) continue
		seen.add(key)
		if (!sameRefSet(sibling.parents, input.childParentsBefore)) continue
		addParentEdges.push({ parent: input.parent, child: sibling.ref })
		// Sharing the new parent makes an explicit edge derived - drop it.
		if (sibling.explicitEdgeId) removeEdgeIds.push(sibling.explicitEdgeId)
	}
	return { addParentEdges, addSiblingEdges: [], removeEdgeIds }
}

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

export async function listPlaceholders(): Promise<Array<PlaceholderPerson>> {
	const pool = getPool()
	const result = await pool.query('SELECT * FROM relationship_placeholders ORDER BY name')
	return result.rows
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
	/** Edges created by auto-link propagation (see PropagationPlan docs). */
	autoAdded: Array<RelationshipRow>
	/** Edges removed because propagation made them derivable (redundant explicit siblings). */
	autoRemoved: Array<RelationshipRow>
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

		const endpointFilter = (prefix: 'a' | 'b', ref: NodeRef, params: Array<unknown>): string => {
			params.push(ref.id)
			return `${prefix}_${ref.kind === 'contact' ? 'contact' : 'placeholder'}_id = $${params.length}`
		}
		const parentEdgesOf = async (ref: NodeRef): Promise<Array<RelationshipRow>> => {
			const params: Array<unknown> = []
			const where = endpointFilter('b', ref, params)
			const result = await client.query(`SELECT * FROM contact_relationships WHERE type = 'parent' AND ${where}`, params)
			return result.rows
		}
		const explicitSiblingEdgesOf = async (ref: NodeRef): Promise<Array<{ edge: RelationshipRow; other: NodeRef }>> => {
			const params: Array<unknown> = []
			const whereA = endpointFilter('a', ref, params)
			const whereB = endpointFilter('b', ref, params)
			const result = await client.query(`SELECT * FROM contact_relationships WHERE type = 'sibling' AND (${whereA} OR ${whereB})`, params)
			return (result.rows as Array<RelationshipRow>).map(edge => ({
				edge,
				other: refKey(endpointA(edge)) === refKey(ref) ? endpointB(edge) : endpointA(edge),
			}))
		}

		// Gather propagation context BEFORE inserting so "parents before this
		// edge" is what the plan reasons about.
		let plan: PropagationPlan = { addParentEdges: [], addSiblingEdges: [], removeEdgeIds: [] }
		let planAfterInsert: ((newEdgeId: string) => PropagationPlan) | null = null
		if (input.type === 'sibling') {
			const [parentsOfA, parentsOfB, siblingsOfA, siblingsOfB] = await Promise.all([
				parentEdgesOf(a),
				parentEdgesOf(b),
				explicitSiblingEdgesOf(a),
				explicitSiblingEdgesOf(b),
			])
			planAfterInsert = newEdgeId =>
				planSiblingPropagation({
					a,
					b,
					newEdgeId,
					parentsOfA: parentsOfA.map(endpointA),
					parentsOfB: parentsOfB.map(endpointA),
					explicitSiblingsOfA: siblingsOfA.map(entry => entry.other),
					explicitSiblingsOfB: siblingsOfB.map(entry => entry.other),
				})
		} else if (input.type === 'parent') {
			// Siblings of the child: explicit edges plus anyone sharing a parent.
			const childParents = (await parentEdgesOf(b)).map(endpointA)
			const explicitSiblings = await explicitSiblingEdgesOf(b)
			const siblings = new Map<string, { ref: NodeRef; parents: Array<NodeRef>; explicitEdgeId: string | null }>()
			for (const entry of explicitSiblings) {
				siblings.set(refKey(entry.other), {
					ref: entry.other,
					parents: (await parentEdgesOf(entry.other)).map(endpointA),
					explicitEdgeId: entry.edge.id,
				})
			}
			for (const parentRef of childParents) {
				const params: Array<unknown> = []
				const where = endpointFilter('a', parentRef, params)
				const children = await client.query(`SELECT * FROM contact_relationships WHERE type = 'parent' AND ${where}`, params)
				for (const row of children.rows as Array<RelationshipRow>) {
					const childRef = endpointB(row)
					const key = refKey(childRef)
					if (key === refKey(b) || siblings.has(key)) continue
					siblings.set(key, { ref: childRef, parents: (await parentEdgesOf(childRef)).map(endpointA), explicitEdgeId: null })
				}
			}
			plan = planParentPropagation({ parent: a, child: b, childParentsBefore: childParents, siblings: [...siblings.values()] })
		}

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
		const mainRow: RelationshipRow = inserted.rows[0]
		if (planAfterInsert) plan = planAfterInsert(mainRow.id)

		const insertAuto = async (rawX: NodeRef, rawY: NodeRef, type: RelationshipType): Promise<RelationshipRow | null> => {
			const [x, y] = canonicalizeEndpoints(rawX, rawY, type)
			const result = await client.query(
				`INSERT INTO contact_relationships (a_contact_id, a_placeholder_id, b_contact_id, b_placeholder_id, type)
				 VALUES ($1, $2, $3, $4, $5)
				 ON CONFLICT (a_contact_id, a_placeholder_id, b_contact_id, b_placeholder_id, type) DO NOTHING
				 RETURNING *`,
				[
					x.kind === 'contact' ? x.id : null,
					x.kind === 'placeholder' ? x.id : null,
					y.kind === 'contact' ? y.id : null,
					y.kind === 'placeholder' ? y.id : null,
					type,
				]
			)
			return result.rows[0] ?? null
		}

		const autoAdded: Array<RelationshipRow> = []
		for (const { parent, child } of plan.addParentEdges) {
			const row = await insertAuto(parent, child, 'parent')
			if (row) autoAdded.push(row)
		}
		for (const [x, y] of plan.addSiblingEdges) {
			const row = await insertAuto(x, y, 'sibling')
			if (row) autoAdded.push(row)
		}
		const autoRemoved: Array<RelationshipRow> = []
		if (plan.removeEdgeIds.length > 0) {
			const removed = await client.query('DELETE FROM contact_relationships WHERE id = ANY($1) RETURNING *', [plan.removeEdgeIds])
			autoRemoved.push(...removed.rows)
		}

		await client.query('COMMIT')
		return { relationship: mainRow, a, b, createdPlaceholders, autoAdded, autoRemoved }
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

// ---------------------------------------------------------------------------
// Merge edge transfer
//
// Merging contacts soft-deletes the consumed rows, so ON DELETE CASCADE never
// fires and their edges would otherwise dangle (ego graphs drop edges that
// touch deleted contacts). Repointing moves each surviving fact onto the
// primary contact; edges that would self-reference or duplicate an existing
// fact after repointing are dropped instead.
// ---------------------------------------------------------------------------

/** The endpoint/type columns of an edge, as stored in merge history metadata. */
export interface TransferredEdgeSnapshot {
	id: string
	a_contact_id: string | null
	a_placeholder_id: string | null
	b_contact_id: string | null
	b_placeholder_id: string | null
	type: RelationshipType
	qualifier: string | null
}

export interface EdgeTransferPlan {
	/** Edges to keep, with their new canonical endpoints. */
	repoint: Array<{ id: string; a: NodeRef; b: NodeRef }>
	/** Edges that would self-reference or duplicate after repointing. */
	dropIds: Array<string>
}

export interface EdgeTransferResult {
	repointed: Array<{ before: TransferredEdgeSnapshot; after: RelationshipRow }>
	dropped: Array<TransferredEdgeSnapshot>
}

/** Shape stored under metadata.relationshipTransfers on merge history rows. */
export interface EdgeTransferSnapshotSet {
	repointed: Array<TransferredEdgeSnapshot>
	dropped: Array<TransferredEdgeSnapshot>
}

/** The five columns of idx_contact_relationships_unique as a comparable key. */
function edgeIndexKey(a: NodeRef, b: NodeRef, type: RelationshipType): string {
	return [
		a.kind === 'contact' ? a.id : '',
		a.kind === 'placeholder' ? a.id : '',
		b.kind === 'contact' ? b.id : '',
		b.kind === 'placeholder' ? b.id : '',
		type,
	].join('|')
}

function snapshotEdge(row: RelationshipRow): TransferredEdgeSnapshot {
	return {
		id: row.id,
		a_contact_id: row.a_contact_id,
		a_placeholder_id: row.a_placeholder_id,
		b_contact_id: row.b_contact_id,
		b_placeholder_id: row.b_placeholder_id,
		type: row.type,
		qualifier: row.qualifier,
	}
}

/**
 * Decide, for every edge touching the merge, whether it moves to the primary
 * contact or is dropped. `edges` must include the primary's own edges - they
 * seed the duplicate check. Duplicates collide on the same five columns as the
 * unique index (qualifier intentionally excluded), and symmetric types are
 * canonicalized first so a duplicate in either direction is caught.
 */
export function planEdgeTransfer(edges: Array<RelationshipRow>, primaryContactId: string, consumedContactIds: Array<string>): EdgeTransferPlan {
	const consumed = new Set(consumedContactIds)
	consumed.delete(primaryContactId)
	const mapRef = (ref: NodeRef): NodeRef =>
		ref.kind === 'contact' && consumed.has(ref.id) ? { kind: 'contact', id: primaryContactId } : ref

	const touched: Array<{ row: RelationshipRow; a: NodeRef; b: NodeRef }> = []
	const seen = new Set<string>()
	for (const row of edges) {
		const a = endpointA(row)
		const b = endpointB(row)
		const mappedA = mapRef(a)
		const mappedB = mapRef(b)
		if (mappedA === a && mappedB === b) {
			// Untouched edges stay put but still occupy their slot in the index.
			seen.add(edgeIndexKey(a, b, row.type))
			continue
		}
		touched.push({ row, a: mappedA, b: mappedB })
	}

	const plan: EdgeTransferPlan = { repoint: [], dropIds: [] }
	for (const { row, a, b } of touched) {
		if (refKey(a) === refKey(b)) {
			plan.dropIds.push(row.id)
			continue
		}
		const [canonicalA, canonicalB] = canonicalizeEndpoints(a, b, row.type)
		const key = edgeIndexKey(canonicalA, canonicalB, row.type)
		if (seen.has(key)) {
			plan.dropIds.push(row.id)
			continue
		}
		seen.add(key)
		plan.repoint.push({ id: row.id, a: canonicalA, b: canonicalB })
	}
	return plan
}

/**
 * Apply planEdgeTransfer for a merge, atomically. Returns before/after rows so
 * the merge history entry can record enough to undo the transfer. No-op (and
 * no queries beyond the feature check) when relationships aren't enabled.
 */
export async function transferRelationshipEdges(primaryContactId: string, consumedContactIds: Array<string>): Promise<EdgeTransferResult> {
	const empty: EdgeTransferResult = { repointed: [], dropped: [] }
	const consumedIds = consumedContactIds.filter(id => id !== primaryContactId)
	if (consumedIds.length === 0 || !(await relationshipsEnabled())) return empty

	const pool = getPool()
	const client = await pool.connect()
	try {
		await client.query('BEGIN')
		const result = await client.query('SELECT * FROM contact_relationships WHERE a_contact_id = ANY($1) OR b_contact_id = ANY($1)', [
			[primaryContactId, ...consumedIds],
		])
		const rows = result.rows as Array<RelationshipRow>
		const plan = planEdgeTransfer(rows, primaryContactId, consumedIds)
		const rowById = new Map(rows.map(row => [row.id, row]))

		// Deletes first so a repoint can never transiently collide with a row
		// that is on its way out.
		const dropped: Array<TransferredEdgeSnapshot> = []
		if (plan.dropIds.length > 0) {
			const removed = await client.query('DELETE FROM contact_relationships WHERE id = ANY($1) RETURNING *', [plan.dropIds])
			dropped.push(...(removed.rows as Array<RelationshipRow>).map(snapshotEdge))
		}

		const repointed: Array<{ before: TransferredEdgeSnapshot; after: RelationshipRow }> = []
		for (const edge of plan.repoint) {
			const updated = await client.query(
				`UPDATE contact_relationships
				 SET a_contact_id = $1, a_placeholder_id = $2, b_contact_id = $3, b_placeholder_id = $4, updated_at = NOW()
				 WHERE id = $5 RETURNING *`,
				[
					edge.a.kind === 'contact' ? edge.a.id : null,
					edge.a.kind === 'placeholder' ? edge.a.id : null,
					edge.b.kind === 'contact' ? edge.b.id : null,
					edge.b.kind === 'placeholder' ? edge.b.id : null,
					edge.id,
				]
			)
			if (updated.rows[0]) repointed.push({ before: snapshotEdge(rowById.get(edge.id)!), after: updated.rows[0] })
		}

		await client.query('COMMIT')
		return { repointed, dropped }
	} catch (error) {
		await client.query('ROLLBACK')
		throw error
	} finally {
		client.release()
	}
}

/**
 * Rewrite contact endpoints through an id map. Used by unmerge: a consumed
 * contact that was permanently deleted comes back under a new id, so restored
 * edges must follow it.
 */
export function remapEdgeContactIds(snapshot: TransferredEdgeSnapshot, contactIdMap: Map<string, string>): TransferredEdgeSnapshot {
	const remap = (id: string | null) => (id !== null ? (contactIdMap.get(id) ?? id) : null)
	return { ...snapshot, a_contact_id: remap(snapshot.a_contact_id), b_contact_id: remap(snapshot.b_contact_id) }
}

/**
 * Undo a merge's edge transfer: repoint surviving edges back to the restored
 * contacts and re-insert edges the merge dropped. Post-merge edits win - an
 * edge that was deleted since the merge stays deleted, and a restore that
 * would collide with an edge added since the merge is skipped.
 */
export async function restoreTransferredEdges(
	transfer: EdgeTransferSnapshotSet,
	contactIdMap: Map<string, string>
): Promise<{ restored: number; skipped: number }> {
	if (!(await relationshipsEnabled())) return { restored: 0, skipped: 0 }
	const pool = getPool()
	let restored = 0
	let skipped = 0
	for (const before of transfer.repointed) {
		const target = remapEdgeContactIds(before, contactIdMap)
		try {
			const result = await pool.query(
				`UPDATE contact_relationships
				 SET a_contact_id = $1, a_placeholder_id = $2, b_contact_id = $3, b_placeholder_id = $4, updated_at = NOW()
				 WHERE id = $5 RETURNING id`,
				[target.a_contact_id, target.a_placeholder_id, target.b_contact_id, target.b_placeholder_id, target.id]
			)
			if (result.rowCount) restored++
			else skipped++
		} catch {
			skipped++
		}
	}
	for (const before of transfer.dropped) {
		const target = remapEdgeContactIds(before, contactIdMap)
		try {
			const result = await pool.query(
				`INSERT INTO contact_relationships (id, a_contact_id, a_placeholder_id, b_contact_id, b_placeholder_id, type, qualifier)
				 VALUES ($1, $2, $3, $4, $5, $6, $7)
				 ON CONFLICT DO NOTHING RETURNING id`,
				[target.id, target.a_contact_id, target.a_placeholder_id, target.b_contact_id, target.b_placeholder_id, target.type, target.qualifier]
			)
			if (result.rowCount) restored++
			else skipped++
		} catch {
			skipped++
		}
	}
	return { restored, skipped }
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

// ---------------------------------------------------------------------------
// vCard "related names" export (write-only)
//
// Relationships are reflected into each contact's stored vcard_data as
// Apple-style grouped properties so CardDAV clients show them:
//
//   screl1.X-ABRELATEDNAMES:Carol Hoffman
//   screl1.X-ABLabel:_$!<Parent>!$_
//
// The DB graph stays authoritative: the sync-service parser drops grouped
// X- properties on inbound parse, so client-side edits to related names are
// ignored and overwritten on the next regeneration. The `screl` group prefix
// is ours alone, which lets injectRelatedNames strip and rewrite exactly its
// own lines while preserving everything else in the stored vCard.
// ---------------------------------------------------------------------------

export interface RelatedName {
	label: string
	name: string
}

/** Apple canonical label wrappers where a gender-neutral one exists; plain text otherwise. */
export function relatedNameLabel(type: RelationshipType, qualifier: string | null, focusIsParentSide: boolean): string {
	switch (type) {
		case 'parent': {
			const base = focusIsParentSide ? 'child' : 'parent'
			if (qualifier && qualifier !== 'biological') return `${qualifier}-${base}`
			return focusIsParentSide ? '_$!<Child>!$_' : '_$!<Parent>!$_'
		}
		case 'spouse':
			return qualifier === 'ex' ? 'ex-spouse' : '_$!<Spouse>!$_'
		case 'partner':
			return '_$!<Partner>!$_'
		case 'sibling':
			return 'sibling'
	}
}

/** Related names for one focal node, from direct edges plus derived siblings. */
export function relatedNamesForFocus(
	focusKey: string,
	edges: Array<GraphEdge>,
	derivedSiblings: Array<DerivedSibling>,
	names: Map<string, string>
): Array<RelatedName> {
	const related: Array<RelatedName> = []
	const seen = new Set<string>()
	const push = (label: string, otherKey: string) => {
		const name = names.get(otherKey)
		if (!name) return
		const dedupeKey = `${label}|${name}`
		if (seen.has(dedupeKey)) return
		seen.add(dedupeKey)
		related.push({ label, name })
	}
	for (const edge of edges) {
		if (edge.a === focusKey) push(relatedNameLabel(edge.type, edge.qualifier, edge.type === 'parent'), edge.b)
		else if (edge.b === focusKey) push(relatedNameLabel(edge.type, edge.qualifier, false), edge.a)
	}
	for (const pair of derivedSiblings) {
		if (pair.a === focusKey) push('sibling', pair.b)
		else if (pair.b === focusKey) push('sibling', pair.a)
	}
	// Deterministic order keeps regenerated vCards byte-stable (hash-based
	// sync change detection).
	related.sort((x, y) => x.label.localeCompare(y.label) || x.name.localeCompare(y.name))
	return related
}

/** Contact ids of every graph component that touches one of the seed contacts. */
export function expandToComponents(edges: Array<GraphEdge>, seedContactIds: Array<string>): Set<string> {
	const adjacency = new Map<string, Array<string>>()
	for (const edge of edges) {
		adjacency.set(edge.a, [...(adjacency.get(edge.a) ?? []), edge.b])
		adjacency.set(edge.b, [...(adjacency.get(edge.b) ?? []), edge.a])
	}
	const contactIds = new Set<string>(seedContactIds)
	const visited = new Set<string>()
	let frontier = seedContactIds.map(id => `c:${id}`)
	while (frontier.length > 0) {
		const upcoming: Array<string> = []
		for (const key of frontier) {
			if (visited.has(key)) continue
			visited.add(key)
			if (key.startsWith('c:')) contactIds.add(key.slice(2))
			for (const neighbor of adjacency.get(key) ?? []) {
				if (!visited.has(neighbor)) upcoming.push(neighbor)
			}
		}
		frontier = upcoming
	}
	return contactIds
}

const RELATED_GROUP_PREFIX = /^screl\d+\./i

function sanitizeVCardValue(value: string): string {
	return value.replace(/[\r\n]+/g, ' ').trim()
}

/**
 * Replace this module's related-name lines inside an existing vCard string,
 * leaving every other line (including client-authored properties) untouched.
 */
export function injectRelatedNames(vcard: string, related: Array<RelatedName>): string {
	const lines = vcard.split(/\r\n|\r|\n/)
	const kept: Array<string> = []
	let skippingFolded = false
	for (const line of lines) {
		if (RELATED_GROUP_PREFIX.test(line)) {
			skippingFolded = true
			continue
		}
		if (skippingFolded && /^[ \t]/.test(line)) continue
		skippingFolded = false
		kept.push(line)
	}

	const additions: Array<string> = []
	related.forEach((entry, index) => {
		additions.push(`screl${index + 1}.X-ABRELATEDNAMES:${sanitizeVCardValue(entry.name)}`)
		additions.push(`screl${index + 1}.X-ABLabel:${sanitizeVCardValue(entry.label)}`)
	})

	// Drop a trailing empty line so the insert lands directly before END:VCARD
	// and repeated injections stay byte-identical.
	while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop()
	const endIndex = kept.findIndex(line => line.trim().toUpperCase() === 'END:VCARD')
	if (endIndex === -1) return [...kept, ...additions].join('\r\n')
	kept.splice(endIndex, 0, ...additions)
	return kept.join('\r\n')
}

async function loadAllGraphEdges(): Promise<Array<GraphEdge>> {
	const pool = getPool()
	const result = await pool.query('SELECT * FROM contact_relationships')
	return (result.rows as Array<RelationshipRow>).map(row => ({
		id: row.id,
		type: row.type,
		qualifier: row.qualifier,
		a: refKey(endpointA(row)),
		b: refKey(endpointB(row)),
	}))
}

async function relatedNamesFromEdges(edges: Array<GraphEdge>, contactIds?: Array<string>): Promise<Map<string, Array<RelatedName>>> {
	const derived = deriveSiblings(edges)
	const refs: Array<NodeRef> = []
	const refKeys = new Set<string>()
	for (const edge of edges) {
		for (const key of [edge.a, edge.b]) {
			if (refKeys.has(key)) continue
			refKeys.add(key)
			const ref = parseKey(key)
			if (ref) refs.push(ref)
		}
	}
	const names = await getEndpointNames(refs)
	const focusIds = contactIds ?? refs.filter(ref => ref.kind === 'contact').map(ref => ref.id)
	const result = new Map<string, Array<RelatedName>>()
	for (const id of focusIds) {
		result.set(id, relatedNamesForFocus(`c:${id}`, edges, derived, names))
	}
	return result
}

/** Related names for a set of contacts (or every related contact when omitted). */
export async function getRelatedNamesByContact(contactIds?: Array<string>): Promise<Map<string, Array<RelatedName>>> {
	return relatedNamesFromEdges(await loadAllGraphEdges(), contactIds)
}

/**
 * Choke point for every vcard_data writer (updateContact): keeps related
 * names present in whatever vCard is being stored. Returns null when the
 * vCard is already correct. Cheap for the common case - contacts without
 * edges only cost one indexed existence check.
 */
export async function maybeInjectRelatedNames(contactId: string, vcard: string): Promise<string | null> {
	if (!(await relationshipsEnabled())) return null
	const pool = getPool()
	const hasEdges = await pool.query('SELECT 1 FROM contact_relationships WHERE a_contact_id = $1 OR b_contact_id = $1 LIMIT 1', [contactId])
	const related = hasEdges.rowCount === 0 ? [] : ((await getRelatedNamesByContact([contactId])).get(contactId) ?? [])
	const injected = injectRelatedNames(vcard, related)
	return injected === vcard ? null : injected
}

/**
 * Re-inject related names into the stored vCards of every contact whose
 * component touches one of the seeds. Derived facts (a new sibling appearing
 * for everyone in the family) change vCards well beyond the mutated edge's
 * endpoints, so the whole component is refreshed - the contacts trigger
 * bumps updated_at, which queues the Radicale push.
 */
export async function refreshRelatedNamesVcards(seedContactIds: Array<string>): Promise<number> {
	const seeds = [...new Set(seedContactIds)]
	if (seeds.length === 0) return 0
	const { getContactById, updateContact } = await import('./db')
	const { generateVCard } = await import('./vcard')
	const edges = await loadAllGraphEdges()
	const affected = expandToComponents(edges, seeds)
	const relatedByContact = await relatedNamesFromEdges(edges, [...affected])
	let changed = 0
	for (const contactId of affected) {
		const contact = await getContactById(contactId)
		if (!contact) continue
		const base = contact.vcard_data || generateVCard(contact)
		const next = injectRelatedNames(base, relatedByContact.get(contactId) ?? [])
		if (next !== contact.vcard_data) {
			await updateContact(contactId, { vcard_data: next })
			changed++
		}
	}
	return changed
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
