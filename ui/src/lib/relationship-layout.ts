import type { DerivedSibling, EgoGraph, GraphEdge, GraphNode, RelationshipType } from './relationships'

// Pure generational auto-layout for the ego tree. Server types are imported
// type-only so none of the pg-backed module lands in the client bundle.
//
// Geometry contract (matches the locked mock): generations in rows, couples
// joined by a union bar at card mid-height, children hanging from a child bar
// below the union. Positions are recomputed on every graph change - nothing
// about layout is ever persisted.

export const CARD_W = 168
export const CARD_H = 56
export const H_GAP = 28
export const V_GAP = 80
export const PADDING = 24

export interface LayoutNode {
	node: GraphNode
	x: number
	y: number
	isFocus: boolean
	/** Relation to the focal person ("parent", "grandparent", "sibling · derived"), null when not adjacent enough to name. */
	relationLabel: string | null
}

export interface LayoutSegment {
	x1: number
	y1: number
	x2: number
	y2: number
	dashed?: boolean
}

export interface TreeLayout {
	width: number
	height: number
	nodes: Array<LayoutNode>
	segments: Array<LayoutSegment>
}

function qualifierPrefix(qualifier: string | null): string {
	return qualifier && qualifier !== 'biological' && qualifier !== 'ex' ? `${qualifier}-` : ''
}

function directLabel(type: RelationshipType, qualifier: string | null, focusIsParentSide: boolean): string {
	switch (type) {
		case 'parent':
			return focusIsParentSide ? `${qualifierPrefix(qualifier)}child` : `${qualifierPrefix(qualifier)}parent`
		case 'spouse':
			return qualifier === 'ex' ? 'ex-spouse' : 'spouse'
		case 'partner':
			return 'partner'
		case 'sibling':
			return `${qualifierPrefix(qualifier)}sibling`
	}
}

function ancestorLabel(depth: number): string {
	if (depth === 1) return 'parent'
	if (depth === 2) return 'grandparent'
	return `${'great-'.repeat(depth - 2)}grandparent`
}

function descendantLabel(depth: number): string {
	if (depth === 1) return 'child'
	if (depth === 2) return 'grandchild'
	return `${'great-'.repeat(depth - 2)}grandchild`
}

/** Chain depths via parent edges only (ancestors: node -> focus, descendants: focus -> node). */
function chainDepths(edges: Array<GraphEdge>, focus: string, direction: 'up' | 'down'): Map<string, number> {
	const next = new Map<string, Array<string>>()
	for (const edge of edges) {
		if (edge.type !== 'parent') continue
		const [from, to] = direction === 'up' ? [edge.b, edge.a] : [edge.a, edge.b]
		const list = next.get(from) ?? []
		list.push(to)
		next.set(from, list)
	}
	const depths = new Map<string, number>()
	let frontier = [focus]
	let depth = 0
	while (frontier.length > 0 && depth < 32) {
		depth++
		const upcoming: Array<string> = []
		for (const key of frontier) {
			for (const target of next.get(key) ?? []) {
				if (target === focus || depths.has(target)) continue
				depths.set(target, depth)
				upcoming.push(target)
			}
		}
		frontier = upcoming
	}
	return depths
}

export function relationLabels(graph: EgoGraph): Map<string, string> {
	const labels = new Map<string, string>()
	const ancestors = chainDepths(graph.edges, graph.focus, 'up')
	const descendants = chainDepths(graph.edges, graph.focus, 'down')
	for (const [key, depth] of ancestors) labels.set(key, ancestorLabel(depth))
	for (const [key, depth] of descendants) labels.set(key, descendantLabel(depth))
	// Direct edges override chain labels (they carry qualifiers).
	for (const edge of graph.edges) {
		if (edge.a === graph.focus) labels.set(edge.b, directLabel(edge.type, edge.qualifier, edge.type === 'parent'))
		else if (edge.b === graph.focus) labels.set(edge.a, directLabel(edge.type, edge.qualifier, false))
	}
	for (const pair of graph.derivedSiblings) {
		const other = pair.a === graph.focus ? pair.b : pair.b === graph.focus ? pair.a : null
		if (other && !labels.has(other)) {
			labels.set(other, pair.sharedParents >= 2 ? 'sibling · derived' : 'half-sibling · derived')
		}
	}
	return labels
}

/** Generation offset of every node relative to the focal node (negative = older). */
export function assignGenerations(graph: EgoGraph): Map<string, number> {
	const adjacency = new Map<string, Array<{ key: string; delta: number }>>()
	const link = (from: string, to: string, delta: number) => {
		const list = adjacency.get(from) ?? []
		list.push({ key: to, delta })
		adjacency.set(from, list)
	}
	for (const edge of graph.edges) {
		const delta = edge.type === 'parent' ? 1 : 0
		link(edge.a, edge.b, delta)
		link(edge.b, edge.a, -delta)
	}
	for (const pair of graph.derivedSiblings) {
		link(pair.a, pair.b, 0)
		link(pair.b, pair.a, 0)
	}

	const generations = new Map<string, number>([[graph.focus, 0]])
	let frontier = [graph.focus]
	while (frontier.length > 0) {
		const upcoming: Array<string> = []
		for (const key of frontier) {
			const gen = generations.get(key)!
			for (const { key: neighbor, delta } of adjacency.get(key) ?? []) {
				if (generations.has(neighbor)) continue
				generations.set(neighbor, gen + delta)
				upcoming.push(neighbor)
			}
		}
		frontier = upcoming
	}
	// Disconnected nodes (shouldn't happen in an ego graph) park on the focal row.
	for (const node of graph.nodes) {
		if (!generations.has(node.key)) generations.set(node.key, 0)
	}
	return generations
}

interface Positioned {
	x: number
	y: number
}

export function layoutEgoTree(graph: EgoGraph): TreeLayout {
	const nodesByKey = new Map(graph.nodes.map(node => [node.key, node]))
	const generations = assignGenerations(graph)
	const labels = relationLabels(graph)

	// Couple edges (same generation) drive both adjacency grouping and unions.
	const coupleEdges = graph.edges.filter(
		edge => (edge.type === 'spouse' || edge.type === 'partner') && generations.get(edge.a) === generations.get(edge.b)
	)
	const partnerOf = new Map<string, Array<string>>()
	for (const edge of coupleEdges) {
		partnerOf.set(edge.a, [...(partnerOf.get(edge.a) ?? []), edge.b])
		partnerOf.set(edge.b, [...(partnerOf.get(edge.b) ?? []), edge.a])
	}

	const parentsOf = new Map<string, Array<string>>()
	for (const edge of graph.edges) {
		if (edge.type !== 'parent') continue
		parentsOf.set(edge.b, [...(parentsOf.get(edge.b) ?? []), edge.a])
	}

	const rows = new Map<number, Array<string>>()
	for (const node of graph.nodes) {
		const gen = generations.get(node.key)!
		rows.set(gen, [...(rows.get(gen) ?? []), node.key])
	}
	const sortedGens = [...rows.keys()].sort((a, b) => a - b)

	const positions = new Map<string, Positioned>()
	const rowSpans: Array<{ keys: Array<string>; width: number }> = []

	sortedGens.forEach((gen, rowIndex) => {
		const keys = rows.get(gen)!
		// Cluster couples so union bars stay short: seed clusters from couple
		// edges, then absorb singles.
		const clustered: Array<Array<string>> = []
		const placed = new Set<string>()
		const byName = (a: string, b: string) => (nodesByKey.get(a)?.name ?? '').localeCompare(nodesByKey.get(b)?.name ?? '')
		for (const key of [...keys].sort(byName)) {
			if (placed.has(key)) continue
			const cluster = [key]
			placed.add(key)
			for (const partner of partnerOf.get(key) ?? []) {
				if (!placed.has(partner) && keys.includes(partner)) {
					cluster.push(partner)
					placed.add(partner)
				}
			}
			clustered.push(cluster)
		}

		// Order clusters under their parents where possible (mean parent x from
		// the rows above), falling back to name order.
		const clusterSortKey = (cluster: Array<string>): number => {
			const parentXs: Array<number> = []
			for (const key of cluster) {
				for (const parent of parentsOf.get(key) ?? []) {
					const pos = positions.get(parent)
					if (pos) parentXs.push(pos.x + CARD_W / 2)
				}
			}
			if (parentXs.length === 0) return Number.POSITIVE_INFINITY
			return parentXs.reduce((sum, x) => sum + x, 0) / parentXs.length
		}
		clustered.sort((a, b) => clusterSortKey(a) - clusterSortKey(b))

		const y = PADDING + rowIndex * (CARD_H + V_GAP)
		let cursor = PADDING
		const rowKeys: Array<string> = []
		for (const cluster of clustered) {
			for (const key of cluster) {
				positions.set(key, { x: cursor, y })
				rowKeys.push(key)
				cursor += CARD_W + H_GAP
			}
		}
		rowSpans.push({ keys: rowKeys, width: cursor - H_GAP + PADDING })
	})

	// Center every row within the widest one.
	const maxWidth = Math.max(...rowSpans.map(row => row.width), PADDING * 2 + CARD_W)
	for (const row of rowSpans) {
		const offset = (maxWidth - row.width) / 2
		if (offset <= 0) continue
		for (const key of row.keys) {
			const pos = positions.get(key)!
			positions.set(key, { x: pos.x + offset, y: pos.y })
		}
	}

	const segments: Array<LayoutSegment> = []
	const midY = (pos: Positioned) => pos.y + CARD_H / 2

	// Union bars between couples.
	const unionAnchor = new Map<string, Positioned>()
	const coupleKey = (a: string, b: string) => (a <= b ? `${a}|${b}` : `${b}|${a}`)
	for (const edge of coupleEdges) {
		const posA = positions.get(edge.a)
		const posB = positions.get(edge.b)
		if (!posA || !posB) continue
		const [left, right] = posA.x <= posB.x ? [posA, posB] : [posB, posA]
		const y = midY(left)
		segments.push({ x1: left.x + CARD_W, y1: y, x2: right.x, y2: y, dashed: edge.qualifier === 'ex' })
		unionAnchor.set(coupleKey(edge.a, edge.b), { x: (left.x + CARD_W + right.x) / 2, y })
	}

	// Parent drops: group children by their exact parent set.
	const childGroups = new Map<string, { parents: Array<string>; children: Array<string> }>()
	for (const [child, parents] of parentsOf) {
		const groupId = [...parents].sort().join('|')
		const group = childGroups.get(groupId) ?? { parents: [...parents], children: [] }
		group.children.push(child)
		childGroups.set(groupId, group)
	}
	for (const group of childGroups.values()) {
		const childPositions = group.children.map(key => positions.get(key)).filter((p): p is Positioned => Boolean(p))
		if (childPositions.length === 0) continue
		const childCenters = childPositions.map(pos => pos.x + CARD_W / 2)
		const childTop = Math.min(...childPositions.map(pos => pos.y))
		const barY = childTop - V_GAP / 2

		let anchor: Positioned | null = null
		if (group.parents.length === 2) {
			anchor = unionAnchor.get(coupleKey(group.parents[0], group.parents[1])) ?? null
		}
		if (!anchor) {
			const parentPositions = group.parents.map(key => positions.get(key)).filter((p): p is Positioned => Boolean(p))
			if (parentPositions.length === 0) continue
			const meanX = parentPositions.reduce((sum, pos) => sum + pos.x + CARD_W / 2, 0) / parentPositions.length
			const bottom = Math.max(...parentPositions.map(pos => pos.y + CARD_H))
			anchor = { x: meanX, y: bottom }
		}

		segments.push({ x1: anchor.x, y1: anchor.y, x2: anchor.x, y2: barY })
		const minX = Math.min(...childCenters, anchor.x)
		const maxX = Math.max(...childCenters, anchor.x)
		if (maxX > minX) segments.push({ x1: minX, y1: barY, x2: maxX, y2: barY })
		for (let i = 0; i < childCenters.length; i++) {
			segments.push({ x1: childCenters[i], y1: barY, x2: childCenters[i], y2: childPositions[i].y })
		}
	}

	// Explicit sibling edges (no shared parent in the graph) render dashed.
	for (const edge of graph.edges) {
		if (edge.type !== 'sibling') continue
		const posA = positions.get(edge.a)
		const posB = positions.get(edge.b)
		if (!posA || !posB) continue
		const [left, right] = posA.x <= posB.x ? [posA, posB] : [posB, posA]
		segments.push({ x1: left.x + CARD_W, y1: midY(left), x2: right.x, y2: midY(right), dashed: true })
	}

	const layoutNodes: Array<LayoutNode> = graph.nodes.map(node => {
		const pos = positions.get(node.key)!
		return {
			node,
			x: pos.x,
			y: pos.y,
			isFocus: node.key === graph.focus,
			relationLabel: node.key === graph.focus ? null : (labels.get(node.key) ?? null),
		}
	})

	const height = PADDING * 2 + sortedGens.length * CARD_H + (sortedGens.length - 1) * V_GAP
	return { width: maxWidth, height, nodes: layoutNodes, segments }
}

export type { DerivedSibling, EgoGraph, GraphEdge, GraphNode }
