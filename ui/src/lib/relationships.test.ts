import { describe, expect, it } from 'vitest'
import {
	canonicalizeEndpoints,
	deriveSiblings,
	describeRelationship,
	expandToComponents,
	injectRelatedNames,
	parseKey,
	planParentPropagation,
	planSiblingPropagation,
	refKey,
	relatedNamesForFocus,
} from './relationships'
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
// Auto-link propagation planning
// ---------------------------------------------------------------------------
describe('planSiblingPropagation', () => {
	const base = { a: contact('A'), b: contact('B'), newEdgeId: 'edge-1' }

	it('copies parents to the parentless side and drops the now-derived edge', () => {
		const plan = planSiblingPropagation({
			...base,
			parentsOfA: [contact('dad'), placeholder('mom')],
			parentsOfB: [],
			explicitSiblingsOfA: [],
			explicitSiblingsOfB: [],
		})
		expect(plan.addParentEdges).toEqual([
			{ parent: contact('dad'), child: contact('B') },
			{ parent: placeholder('mom'), child: contact('B') },
		])
		expect(plan.removeEdgeIds).toEqual(['edge-1'])
		expect(plan.addSiblingEdges).toEqual([])
	})

	it('does nothing automatic when both sides have differing parents', () => {
		const plan = planSiblingPropagation({
			...base,
			parentsOfA: [contact('dad')],
			parentsOfB: [contact('other-dad')],
			explicitSiblingsOfA: [],
			explicitSiblingsOfB: [],
		})
		expect(plan.addParentEdges).toEqual([])
		expect(plan.addSiblingEdges).toEqual([])
		expect(plan.removeEdgeIds).toEqual([])
	})

	it('drops a redundant edge when both sides already share identical parents', () => {
		const plan = planSiblingPropagation({
			...base,
			parentsOfA: [contact('dad')],
			parentsOfB: [contact('dad')],
			explicitSiblingsOfA: [],
			explicitSiblingsOfB: [],
		})
		expect(plan.removeEdgeIds).toEqual(['edge-1'])
		expect(plan.addParentEdges).toEqual([])
	})

	it('spreads sibling links transitively when no parents exist anywhere', () => {
		const plan = planSiblingPropagation({
			...base,
			parentsOfA: [],
			parentsOfB: [],
			explicitSiblingsOfA: [contact('C')],
			explicitSiblingsOfB: [contact('D')],
		})
		expect(plan.addSiblingEdges).toEqual([
			[contact('C'), contact('B')],
			[contact('D'), contact('A')],
		])
		expect(plan.removeEdgeIds).toEqual([])
	})
})

describe('planParentPropagation', () => {
	it('propagates a new parent to full siblings and drops explicit edges', () => {
		const plan = planParentPropagation({
			parent: placeholder('dad'),
			child: contact('A'),
			childParentsBefore: [],
			siblings: [
				{ ref: contact('B'), parents: [], explicitEdgeId: 'sib-edge' },
				{ ref: contact('C'), parents: [contact('other')], explicitEdgeId: null },
			],
		})
		expect(plan.addParentEdges).toEqual([{ parent: placeholder('dad'), child: contact('B') }])
		expect(plan.removeEdgeIds).toEqual(['sib-edge'])
	})

	it('propagates to derived full siblings but never to half siblings', () => {
		const plan = planParentPropagation({
			parent: contact('mom'),
			child: contact('A'),
			childParentsBefore: [contact('dad')],
			siblings: [
				{ ref: contact('full'), parents: [contact('dad')], explicitEdgeId: null },
				{ ref: contact('half'), parents: [contact('dad'), contact('step')], explicitEdgeId: null },
			],
		})
		expect(plan.addParentEdges).toEqual([{ parent: contact('mom'), child: contact('full') }])
		expect(plan.removeEdgeIds).toEqual([])
	})
})

// ---------------------------------------------------------------------------
// vCard related-names export
// ---------------------------------------------------------------------------
describe('relatedNamesForFocus', () => {
	const names = new Map([
		['c:dad', 'Miguel Delgado'],
		['c:kid', 'Sofia Delgado'],
		['c:sib', 'Marcus Delgado'],
		['c:wife', 'Anna Delgado'],
		['p:grandpa', 'Roberto Delgado'],
	])

	it('maps direct edges and derived siblings with Apple labels, sorted and deduped', () => {
		const edges = [edge('c:dad', 'c:kid', 'parent'), edge('c:dad', 'c:wife', 'spouse'), edge('p:grandpa', 'c:dad', 'parent', 'step')]
		const derived = [{ a: 'c:kid', b: 'c:sib', sharedParents: 2 }]
		expect(relatedNamesForFocus('c:kid', edges, derived, names)).toEqual([
			{ label: '_$!<Parent>!$_', name: 'Miguel Delgado' },
			{ label: 'sibling', name: 'Marcus Delgado' },
		])
		expect(relatedNamesForFocus('c:dad', edges, derived, names)).toEqual([
			{ label: '_$!<Child>!$_', name: 'Sofia Delgado' },
			{ label: '_$!<Spouse>!$_', name: 'Anna Delgado' },
			{ label: 'step-parent', name: 'Roberto Delgado' },
		])
	})

	it('labels ex-spouses and partners', () => {
		const edges = [edge('c:dad', 'c:wife', 'spouse', 'ex'), edge('c:dad', 'c:sib', 'partner')]
		expect(relatedNamesForFocus('c:dad', edges, [], names)).toEqual([
			{ label: '_$!<Partner>!$_', name: 'Marcus Delgado' },
			{ label: 'ex-spouse', name: 'Anna Delgado' },
		])
	})
})

describe('injectRelatedNames', () => {
	const BASE = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Sofia Delgado', 'END:VCARD'].join('\r\n')

	it('inserts grouped lines before END:VCARD', () => {
		const result = injectRelatedNames(BASE, [{ label: '_$!<Parent>!$_', name: 'Miguel Delgado' }])
		expect(result).toBe(
			[
				'BEGIN:VCARD',
				'VERSION:3.0',
				'FN:Sofia Delgado',
				'screl1.X-ABRELATEDNAMES:Miguel Delgado',
				'screl1.X-ABLabel:_$!<Parent>!$_',
				'END:VCARD',
			].join('\r\n')
		)
	})

	it('is idempotent and replaces stale lines', () => {
		const first = injectRelatedNames(BASE, [{ label: 'sibling', name: 'Marcus Delgado' }])
		const second = injectRelatedNames(first, [{ label: 'sibling', name: 'Marcus Delgado' }])
		expect(second).toBe(first)
		const replaced = injectRelatedNames(first, [{ label: 'sibling', name: 'Zane Delgado' }])
		expect(replaced).not.toContain('Marcus Delgado')
		expect(replaced).toContain('screl1.X-ABRELATEDNAMES:Zane Delgado')
	})

	it('strips all related lines when the list is empty and preserves other properties', () => {
		const withOther = injectRelatedNames(BASE.replace('FN:Sofia Delgado', 'FN:Sofia Delgado\r\nitem1.URL:https://example.com'), [
			{ label: 'sibling', name: 'Marcus Delgado' },
		])
		const stripped = injectRelatedNames(withOther, [])
		expect(stripped).not.toContain('screl')
		expect(stripped).toContain('item1.URL:https://example.com')
	})
})

describe('expandToComponents', () => {
	it('collects contact ids across the whole component, hopping placeholders', () => {
		const edges = [edge('c:a', 'c:b', 'parent'), edge('p:x', 'c:b', 'parent'), edge('p:x', 'c:c', 'parent'), edge('c:d', 'c:e', 'spouse')]
		expect([...expandToComponents(edges, ['a'])].sort()).toEqual(['a', 'b', 'c'])
		expect([...expandToComponents(edges, ['d'])].sort()).toEqual(['d', 'e'])
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
