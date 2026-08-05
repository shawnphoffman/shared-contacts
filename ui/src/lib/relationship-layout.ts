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

	// Sibling adjacency (explicit edges + derived pairs) is used to seat
	// parentless people next to the person that anchors them in the row.
	const siblingAdj = new Map<string, Array<string>>()
	const addSiblingAdj = (a: string, b: string) => {
		siblingAdj.set(a, [...(siblingAdj.get(a) ?? []), b])
		siblingAdj.set(b, [...(siblingAdj.get(b) ?? []), a])
	}
	for (const edge of graph.edges) if (edge.type === 'sibling') addSiblingAdj(edge.a, edge.b)
	for (const pair of graph.derivedSiblings) addSiblingAdj(pair.a, pair.b)

	const rows = new Map<number, Array<string>>()
	for (const node of graph.nodes) {
		const gen = generations.get(node.key)!
		rows.set(gen, [...(rows.get(gen) ?? []), node.key])
	}
	const sortedGens = [...rows.keys()].sort((a, b) => a - b)

	const childrenOf = new Map<string, Array<string>>()
	for (const edge of graph.edges) {
		if (edge.type !== 'parent') continue
		childrenOf.set(edge.a, [...(childrenOf.get(edge.a) ?? []), edge.b])
	}

	const positions = new Map<string, Positioned>()

	// Each row is a list of blocks (a couple cluster with order preserved).
	// After the initial sequential placement, an iterative solver pulls each
	// block under its parents (down pass) and re-centers parents over their
	// children (up pass), resolving overlaps while preserving order - so
	// child bars stay local to their family instead of spanning the tree.
	interface RowBlock {
		members: Array<string>
		width: number
		x: number
	}
	const rowBlocks: Array<Array<RowBlock>> = []

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

		// Order clusters under their parents (mean parent x from the rows
		// above). Sibling groups thereby land contiguously, keeping each
		// child bar short instead of spanning unrelated people.
		const parentKeyOf = (cluster: Array<string>): number | null => {
			const parentXs: Array<number> = []
			for (const key of cluster) {
				for (const parent of parentsOf.get(key) ?? []) {
					const pos = positions.get(parent)
					if (pos) parentXs.push(pos.x + CARD_W / 2)
				}
			}
			if (parentXs.length === 0) return null
			return parentXs.reduce((sum, x) => sum + x, 0) / parentXs.length
		}

		const entries = clustered.map(cluster => ({ cluster, key: parentKeyOf(cluster) }))
		// Parentless clusters (a spouse's sibling, an in-law) borrow the sort
		// key of a cluster they connect to via partner/sibling edges, so they
		// sit beside their anchor instead of being dumped at the row's end.
		const clusterIndexByMember = new Map<string, number>()
		entries.forEach((entry, index) => entry.cluster.forEach(member => clusterIndexByMember.set(member, index)))
		for (const entry of entries) {
			if (entry.key !== null) continue
			for (const member of entry.cluster) {
				for (const neighbor of [...(partnerOf.get(member) ?? []), ...(siblingAdj.get(member) ?? [])]) {
					const neighborIndex = clusterIndexByMember.get(neighbor)
					const neighborKey = neighborIndex !== undefined ? entries[neighborIndex].key : null
					if (neighborKey !== null) {
						entry.key = neighborKey + 1
						break
					}
				}
				if (entry.key !== null) break
			}
		}
		entries.sort((a, b) => (a.key ?? Number.POSITIVE_INFINITY) - (b.key ?? Number.POSITIVE_INFINITY))

		const y = PADDING + rowIndex * (CARD_H + V_GAP)
		let cursor = PADDING
		const blocks: Array<RowBlock> = []
		for (const { cluster } of entries) {
			const block: RowBlock = { members: cluster, width: cluster.length * CARD_W + (cluster.length - 1) * H_GAP, x: cursor }
			for (const [index, key] of cluster.entries()) {
				positions.set(key, { x: cursor + index * (CARD_W + H_GAP), y })
			}
			blocks.push(block)
			cursor += block.width + H_GAP
		}
		rowBlocks.push(blocks)
	})

	const centerOf = (key: string): number => positions.get(key)!.x + CARD_W / 2
	const setBlockX = (block: RowBlock, x: number) => {
		block.x = x
		block.members.forEach((member, index) => {
			positions.get(member)!.x = x + index * (CARD_W + H_GAP)
		})
	}
	const meanOrNull = (values: Array<number>): number | null =>
		values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length

	// A block's family identity: the sorted parent set of its first member
	// that has parents (a parentless spouse rides with their partner's group).
	const parentGroupOf = (block: RowBlock): string | null => {
		for (const member of block.members) {
			const parents = parentsOf.get(member) ?? []
			if (parents.length > 0) return [...parents].sort().join('|')
		}
		return null
	}

	// Down pass targets: whole sibling runs (adjacent blocks with the same
	// parent set) center as one unit under their parents' union midpoint.
	const wantsFromParents = (blocks: Array<RowBlock>): Array<number | null> => {
		const wants: Array<number | null> = blocks.map(() => null)
		let start = 0
		while (start < blocks.length) {
			const groupId = parentGroupOf(blocks[start])
			let end = start
			while (end + 1 < blocks.length && groupId !== null && parentGroupOf(blocks[end + 1]) === groupId) end++
			if (groupId !== null) {
				const parents = groupId.split('|').filter(p => positions.has(p))
				const unionCenter = meanOrNull(parents.map(centerOf))
				if (unionCenter !== null) {
					const totalWidth = blocks.slice(start, end + 1).reduce((sum, block) => sum + block.width, 0) + (end - start) * H_GAP
					let cursor = unionCenter - totalWidth / 2
					for (let index = start; index <= end; index++) {
						wants[index] = cursor
						cursor += blocks[index].width + H_GAP
					}
				}
			}
			start = end + 1
		}
		return wants
	}

	// Up pass targets: each parent block re-centers over its own children.
	const wantsFromChildren = (blocks: Array<RowBlock>): Array<number | null> =>
		blocks.map(block => {
			const center = meanOrNull(block.members.flatMap(member => (childrenOf.get(member) ?? []).filter(c => positions.has(c)).map(centerOf)))
			return center === null ? null : center - block.width / 2
		})

	// Place a row's blocks as close to their targets as order and minimum
	// gaps allow: greedy left-to-right, then a right-to-left relax that lets
	// blocks slide back toward their target where room remains.
	const placeRow = (blocks: Array<RowBlock>, wants: Array<number | null>) => {
		if (blocks.length === 0) return
		const want = wants.map((value, index) => value ?? blocks[index].x)
		const xs: Array<number> = []
		let minX = Number.NEGATIVE_INFINITY
		blocks.forEach((block, index) => {
			const x = Math.max(want[index], minX)
			xs.push(x)
			minX = x + block.width + H_GAP
		})
		for (let index = blocks.length - 1; index >= 0; index--) {
			const limit = index === blocks.length - 1 ? Number.POSITIVE_INFINITY : xs[index + 1] - H_GAP - blocks[index].width
			xs[index] = Math.min(want[index], limit)
		}
		let cursor = Number.NEGATIVE_INFINITY
		blocks.forEach((block, index) => {
			const x = Math.max(xs[index], cursor)
			setBlockX(block, x)
			cursor = x + block.width + H_GAP
		})
	}

	for (let iteration = 0; iteration < 3; iteration++) {
		for (let row = 1; row < rowBlocks.length; row++) placeRow(rowBlocks[row], wantsFromParents(rowBlocks[row]))
		for (let row = rowBlocks.length - 2; row >= 0; row--) placeRow(rowBlocks[row], wantsFromChildren(rowBlocks[row]))
	}
	// One final down pass so children end exactly under their parents.
	for (let row = 1; row < rowBlocks.length; row++) placeRow(rowBlocks[row], wantsFromParents(rowBlocks[row]))

	// Normalize into positive space.
	const allX = [...positions.values()].map(pos => pos.x)
	const shift = PADDING - Math.min(...allX, PADDING)
	if (shift !== 0) for (const pos of positions.values()) pos.x += shift
	const maxWidth = Math.max(...[...positions.values()].map(pos => pos.x + CARD_W), PADDING + CARD_W) + PADDING

	const segments: Array<LayoutSegment> = []
	const midY = (pos: Positioned) => pos.y + CARD_H / 2

	// True when another card in the same row sits between the two endpoints,
	// which would put a straight mid-height line behind it.
	const sameRowBlocked = (left: Positioned, right: Positioned): boolean => {
		for (const pos of positions.values()) {
			if (pos.y !== left.y || pos === left || pos === right) continue
			if (pos.x + CARD_W > left.x + CARD_W && pos.x < right.x) return true
		}
		return false
	}

	// Non-adjacent same-row pairs are routed through the channel just below
	// the row (above the child bars) instead of straight through other cards.
	const ELBOW_DROP = 16
	const routeSameRow = (a: Positioned, b: Positioned, dashed: boolean): Positioned => {
		const [left, right] = a.x <= b.x ? [a, b] : [b, a]
		if (!sameRowBlocked(left, right)) {
			const y = midY(left)
			segments.push({ x1: left.x + CARD_W, y1: y, x2: right.x, y2: y, dashed })
			return { x: (left.x + CARD_W + right.x) / 2, y }
		}
		const bottom = left.y + CARD_H
		const channelY = bottom + ELBOW_DROP
		const leftX = left.x + CARD_W / 2
		const rightX = right.x + CARD_W / 2
		segments.push({ x1: leftX, y1: bottom, x2: leftX, y2: channelY, dashed })
		segments.push({ x1: leftX, y1: channelY, x2: rightX, y2: channelY, dashed })
		segments.push({ x1: rightX, y1: channelY, x2: rightX, y2: bottom, dashed })
		return { x: (leftX + rightX) / 2, y: channelY }
	}

	// Union bars between couples.
	const unionAnchor = new Map<string, Positioned>()
	const coupleKey = (a: string, b: string) => (a <= b ? `${a}|${b}` : `${b}|${a}`)
	for (const edge of coupleEdges) {
		const posA = positions.get(edge.a)
		const posB = positions.get(edge.b)
		if (!posA || !posB) continue
		unionAnchor.set(coupleKey(edge.a, edge.b), routeSameRow(posA, posB, edge.qualifier === 'ex'))
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

	// Explicit sibling edges (no shared parent in the graph) render dashed,
	// routed around intermediate cards like unions.
	for (const edge of graph.edges) {
		if (edge.type !== 'sibling') continue
		const posA = positions.get(edge.a)
		const posB = positions.get(edge.b)
		if (!posA || !posB) continue
		if (posA.y === posB.y) {
			routeSameRow(posA, posB, true)
		} else {
			const [top, bottom] = posA.y <= posB.y ? [posA, posB] : [posB, posA]
			segments.push({ x1: top.x + CARD_W / 2, y1: top.y + CARD_H, x2: bottom.x + CARD_W / 2, y2: bottom.y, dashed: true })
		}
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
