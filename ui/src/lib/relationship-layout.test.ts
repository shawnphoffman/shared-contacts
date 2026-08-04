import { describe, expect, it } from 'vitest'
import { CARD_H, CARD_W, assignGenerations, layoutEgoTree, relationLabels } from './relationship-layout'
import type { EgoGraph, GraphEdge, GraphNode } from './relationship-layout'

const node = (key: string, name: string): GraphNode => ({
	key,
	kind: key.startsWith('c:') ? 'contact' : 'placeholder',
	id: key.slice(2),
	name,
	birthday: null,
	birth_year: null,
	death_year: null,
	photo_hash: null,
	photo_updated_at: null,
})

const edge = (a: string, b: string, type: GraphEdge['type'], qualifier: string | null = null): GraphEdge => ({
	id: `${a}|${b}|${type}`,
	type,
	qualifier,
	a,
	b,
})

/**
 * Three generations centered on Sofia: grandparents (one a placeholder),
 * parents, focal + derived sibling + spouse.
 */
function familyGraph(): EgoGraph {
	const edges = [
		edge('p:grandpa', 'c:dad', 'parent'),
		edge('c:grandma', 'c:dad', 'parent'),
		edge('p:grandpa', 'c:grandma', 'spouse'),
		edge('c:dad', 'c:sofia', 'parent'),
		edge('c:mom', 'c:sofia', 'parent'),
		edge('c:dad', 'c:marcus', 'parent'),
		edge('c:mom', 'c:marcus', 'parent'),
		edge('c:dad', 'c:mom', 'spouse'),
		edge('c:sofia', 'c:tom', 'spouse'),
	]
	return {
		focus: 'c:sofia',
		nodes: [
			node('p:grandpa', 'Roberto Delgado'),
			node('c:grandma', 'Elena Delgado'),
			node('c:dad', 'Miguel Delgado'),
			node('c:mom', 'Anna Delgado'),
			node('c:sofia', 'Sofia Delgado'),
			node('c:marcus', 'Marcus Delgado'),
			node('c:tom', 'Tom Whitfield-Kowalczyk'),
		],
		edges,
		derivedSiblings: [{ a: 'c:marcus', b: 'c:sofia', sharedParents: 2 }],
	}
}

describe('assignGenerations', () => {
	it('places ancestors above and partners beside the focal person', () => {
		const generations = assignGenerations(familyGraph())
		expect(generations.get('c:sofia')).toBe(0)
		expect(generations.get('c:tom')).toBe(0)
		expect(generations.get('c:marcus')).toBe(0)
		expect(generations.get('c:dad')).toBe(-1)
		expect(generations.get('c:mom')).toBe(-1)
		expect(generations.get('p:grandpa')).toBe(-2)
		expect(generations.get('c:grandma')).toBe(-2)
	})
})

describe('relationLabels', () => {
	it('labels direct edges, chains, and derived siblings relative to the focus', () => {
		const labels = relationLabels(familyGraph())
		expect(labels.get('c:dad')).toBe('parent')
		expect(labels.get('c:grandma')).toBe('grandparent')
		expect(labels.get('p:grandpa')).toBe('grandparent')
		expect(labels.get('c:tom')).toBe('spouse')
		expect(labels.get('c:marcus')).toBe('sibling · derived')
	})

	it('labels half-siblings and qualified direct edges', () => {
		const graph: EgoGraph = {
			focus: 'c:kid1',
			nodes: [node('c:dad', 'Dad'), node('c:kid1', 'Kid One'), node('c:kid2', 'Kid Two'), node('c:step', 'Step Parent')],
			edges: [edge('c:dad', 'c:kid1', 'parent'), edge('c:dad', 'c:kid2', 'parent'), edge('c:step', 'c:kid1', 'parent', 'step')],
			derivedSiblings: [{ a: 'c:kid1', b: 'c:kid2', sharedParents: 1 }],
		}
		const labels = relationLabels(graph)
		expect(labels.get('c:kid2')).toBe('half-sibling · derived')
		expect(labels.get('c:step')).toBe('step-parent')
	})
})

describe('layoutEgoTree', () => {
	it('stacks generations top-down with finite positions', () => {
		const layout = layoutEgoTree(familyGraph())
		const byKey = new Map(layout.nodes.map(entry => [entry.node.key, entry]))

		const grandma = byKey.get('c:grandma')!
		const dad = byKey.get('c:dad')!
		const sofia = byKey.get('c:sofia')!
		expect(grandma.y).toBeLessThan(dad.y)
		expect(dad.y).toBeLessThan(sofia.y)
		expect(sofia.isFocus).toBe(true)

		for (const entry of layout.nodes) {
			expect(Number.isFinite(entry.x)).toBe(true)
			expect(Number.isFinite(entry.y)).toBe(true)
			expect(entry.x).toBeGreaterThanOrEqual(0)
		}
		expect(layout.width).toBeGreaterThan(CARD_W)
		expect(layout.height).toBeGreaterThan(CARD_H * 3)
	})

	it('draws a union bar between couples and a drop to their children', () => {
		const layout = layoutEgoTree(familyGraph())
		const byKey = new Map(layout.nodes.map(entry => [entry.node.key, entry]))
		const dad = byKey.get('c:dad')!
		const mom = byKey.get('c:mom')!

		// A horizontal segment at the parents' mid-height between the two cards.
		const midY = dad.y + CARD_H / 2
		const union = layout.segments.find(
			segment => segment.y1 === midY && segment.y2 === midY && Math.abs(segment.x1 - segment.x2) <= CARD_W + 200
		)
		expect(union).toBeDefined()

		// At least one vertical segment ends at a child's top edge.
		const sofia = byKey.get('c:sofia')!
		const drop = layout.segments.find(segment => segment.x1 === segment.x2 && segment.y2 === sofia.y)
		expect(drop).toBeDefined()
		expect(mom.y).toBe(dad.y)
	})

	it('handles an empty graph without segments', () => {
		const graph: EgoGraph = { focus: 'c:solo', nodes: [node('c:solo', 'Solo Person')], edges: [], derivedSiblings: [] }
		const layout = layoutEgoTree(graph)
		expect(layout.nodes).toHaveLength(1)
		expect(layout.segments).toHaveLength(0)
		expect(layout.nodes[0].isFocus).toBe(true)
	})
})
