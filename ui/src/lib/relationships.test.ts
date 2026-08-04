import { describe, expect, it } from 'vitest'
import { canonicalizeEndpoints, deriveSiblings, describeRelationship, parseKey, refKey } from './relationships'
import type { GraphEdge, NodeRef } from './relationships'

const contact = (id: string): NodeRef => ({ kind: 'contact', id })
const placeholder = (id: string): NodeRef => ({ kind: 'placeholder', id })

const ID_A = '11111111-1111-1111-1111-111111111111'
const ID_B = '22222222-2222-2222-2222-222222222222'

const edge = (a: string, b: string, type: GraphEdge['type'], qualifier: string | null = null): GraphEdge => ({
	id: `${a}-${b}-${type}`,
	type,
	qualifier,
	a,
	b,
})

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------
describe('refKey / parseKey', () => {
	it('round-trips contact and placeholder refs', () => {
		expect(parseKey(refKey(contact(ID_A)))).toEqual(contact(ID_A))
		expect(parseKey(refKey(placeholder(ID_B)))).toEqual(placeholder(ID_B))
	})

	it('rejects malformed keys', () => {
		expect(parseKey('c:not-a-uuid')).toBeNull()
		expect(parseKey(`x:${ID_A}`)).toBeNull()
	})
})

// ---------------------------------------------------------------------------
// Canonical direction
// ---------------------------------------------------------------------------
describe('canonicalizeEndpoints', () => {
	it('keeps caller order for directional parent edges', () => {
		expect(canonicalizeEndpoints(contact(ID_B), contact(ID_A), 'parent')).toEqual([contact(ID_B), contact(ID_A)])
	})

	it('orders symmetric edges by ascending id so both directions collide', () => {
		const forward = canonicalizeEndpoints(contact(ID_A), contact(ID_B), 'spouse')
		const backward = canonicalizeEndpoints(contact(ID_B), contact(ID_A), 'spouse')
		expect(forward).toEqual(backward)
		expect(forward).toEqual([contact(ID_A), contact(ID_B)])
	})

	it('orders contacts before placeholders for symmetric edges', () => {
		expect(canonicalizeEndpoints(placeholder(ID_A), contact(ID_B), 'sibling')).toEqual([contact(ID_B), placeholder(ID_A)])
	})
})

// ---------------------------------------------------------------------------
// Sibling derivation
// ---------------------------------------------------------------------------
describe('deriveSiblings', () => {
	it('derives full siblings from two shared parents', () => {
		const edges = [
			edge('c:dad', 'c:kid1', 'parent'),
			edge('c:mom', 'c:kid1', 'parent'),
			edge('c:dad', 'c:kid2', 'parent'),
			edge('c:mom', 'c:kid2', 'parent'),
		]
		expect(deriveSiblings(edges)).toEqual([{ a: 'c:kid1', b: 'c:kid2', sharedParents: 2 }])
	})

	it('derives half siblings from one shared parent', () => {
		const edges = [edge('c:dad', 'c:kid1', 'parent'), edge('c:dad', 'c:kid2', 'parent'), edge('c:mom', 'c:kid1', 'parent')]
		expect(deriveSiblings(edges)).toEqual([{ a: 'c:kid1', b: 'c:kid2', sharedParents: 1 }])
	})

	it('skips pairs already covered by an explicit sibling edge', () => {
		const edges = [edge('c:dad', 'c:kid1', 'parent'), edge('c:dad', 'c:kid2', 'parent'), edge('c:kid1', 'c:kid2', 'sibling')]
		expect(deriveSiblings(edges)).toEqual([])
	})

	it('derives nothing without shared parents', () => {
		const edges = [edge('c:dad', 'c:kid1', 'parent'), edge('c:mom', 'c:kid2', 'parent')]
		expect(deriveSiblings(edges)).toEqual([])
	})

	it('works through placeholder parents', () => {
		const edges = [edge('p:grandpa', 'c:kid1', 'parent'), edge('p:grandpa', 'c:kid2', 'parent')]
		expect(deriveSiblings(edges)).toEqual([{ a: 'c:kid1', b: 'c:kid2', sharedParents: 1 }])
	})
})

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------
describe('describeRelationship', () => {
	it('labels both directions of a parent edge', () => {
		expect(describeRelationship('parent', null, false)).toBe('parent')
		expect(describeRelationship('parent', null, true)).toBe('child')
	})

	it('prefixes qualifiers except biological', () => {
		expect(describeRelationship('parent', 'step', false)).toBe('step-parent')
		expect(describeRelationship('parent', 'biological', false)).toBe('parent')
	})

	it('labels ex-spouses', () => {
		expect(describeRelationship('spouse', 'ex', false)).toBe('ex-spouse')
		expect(describeRelationship('spouse', null, false)).toBe('spouse')
	})
})
