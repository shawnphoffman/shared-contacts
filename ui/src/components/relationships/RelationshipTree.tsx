import { useEffect, useMemo } from 'react'
import {
	Background,
	BackgroundVariant,
	Controls,
	MiniMap,
	ReactFlow,
	ReactFlowProvider,
	ViewportPortal,
	useNodesInitialized,
	useReactFlow,
} from '@xyflow/react'
import { CARD_H, CARD_W, layoutEgoTree } from '../../lib/relationship-layout'
import { ContactAvatar } from '../ContactAvatar'
import { cn } from '../../lib/utils'
import type { Node as FlowNode, NodeProps } from '@xyflow/react'
import type { EgoGraph, GraphNode, TreeLayout } from '../../lib/relationship-layout'
import type { Contact } from '../../lib/db'

import '@xyflow/react/dist/style.css'

interface RelationshipTreeProps {
	graph: EgoGraph
	/** Contact nodes are refocus targets; placeholders are inert. */
	onContactClick?: (contactId: string) => void
}

interface PersonNodeData extends Record<string, unknown> {
	node: GraphNode
	isFocus: boolean
	caption: string
	clickable: boolean
}

type PersonFlowNode = FlowNode<PersonNodeData, 'person'>

function initials(name: string): string {
	return (
		name
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map(part => part.charAt(0).toUpperCase())
			.join('') || '?'
	)
}

function lifespan(node: GraphNode): string | null {
	if (node.kind === 'placeholder') {
		if (node.birth_year && node.death_year) return `${node.birth_year}-${node.death_year}`
		if (node.death_year) return `† ${node.death_year}`
		if (node.birth_year) return `b. ${node.birth_year}`
		return null
	}
	if (node.birthday) return `b. ${node.birthday.slice(0, 4)}`
	return null
}

function PersonNode({ data }: NodeProps<PersonFlowNode>) {
	const { node, isFocus, caption, clickable } = data
	return (
		<div
			className={cn(
				'flex items-center gap-2 rounded-sm border bg-card p-2',
				isFocus && 'border-primary ring-1 ring-primary',
				node.kind === 'placeholder' && 'border-dashed bg-transparent',
				clickable && 'cursor-pointer transition-colors hover:border-primary'
			)}
			style={{ width: CARD_W, minHeight: CARD_H }}
		>
			{node.kind === 'contact' ? (
				<ContactAvatar
					contact={
						{
							id: node.id,
							full_name: node.name,
							photo_hash: node.photo_hash,
							photo_updated_at: node.photo_updated_at,
						} as Pick<Contact, 'id' | 'full_name' | 'photo_hash' | 'photo_updated_at'>
					}
					className="h-8 w-8 text-[10px]"
				/>
			) : (
				<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed text-[10px] font-medium text-muted-foreground">
					{initials(node.name)}
				</span>
			)}
			<span className="min-w-0">
				<span className="line-clamp-2 break-words text-xs font-semibold leading-tight">{node.name}</span>
				{caption && <span className="block truncate text-[10px] text-muted-foreground">{caption}</span>}
			</span>
		</div>
	)
}

const nodeTypes = { person: PersonNode }

/**
 * Refits the viewport once nodes are measured and again whenever the focal
 * person (projection) changes.
 */
function AutoFit({ focusKey }: { focusKey: string }) {
	const { fitView } = useReactFlow()
	const nodesInitialized = useNodesInitialized()
	useEffect(() => {
		if (!nodesInitialized) return
		void fitView({ padding: 0.08, duration: 250, maxZoom: 1 })
	}, [focusKey, nodesInitialized, fitView])
	return null
}

function TreeCanvas({ graph, layout, onContactClick }: RelationshipTreeProps & { layout: TreeLayout }) {
	const nodes = useMemo<Array<PersonFlowNode>>(
		() =>
			layout.nodes.map(({ node, x, y, isFocus, relationLabel }) => ({
				id: node.key,
				type: 'person',
				position: { x, y },
				width: CARD_W,
				height: CARD_H,
				draggable: false,
				connectable: false,
				data: {
					node,
					isFocus,
					caption: [relationLabel, isFocus ? 'focal' : null, lifespan(node)].filter(Boolean).join(' · '),
					clickable: node.kind === 'contact' && !isFocus && Boolean(onContactClick),
				},
			})),
		[layout, onContactClick]
	)

	return (
		<ReactFlow
			nodes={nodes}
			edges={[]}
			nodeTypes={nodeTypes}
			onNodeClick={(_, flowNode) => {
				const data = flowNode.data
				if (data.clickable) onContactClick?.(data.node.id)
			}}
			nodesDraggable={false}
			nodesConnectable={false}
			elementsSelectable={false}
			minZoom={0.15}
			maxZoom={1.5}
			fitView
			fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
			proOptions={{ hideAttribution: true }}
			className="relationship-flow"
		>
			{/* Genealogy connectors (union bars, child drops) are not node-to-node
			    edges, so they render as one SVG layer in graph coordinates. */}
			<ViewportPortal>
				<svg
					className="pointer-events-none absolute left-0 top-0"
					width={layout.width}
					height={layout.height}
					style={{ zIndex: -1 }}
					aria-hidden="true"
				>
					{layout.segments.map((segment, index) => (
						<line
							key={index}
							x1={segment.x1}
							y1={segment.y1}
							x2={segment.x2}
							y2={segment.y2}
							className="stroke-muted-foreground/60"
							strokeWidth={1.5}
							strokeDasharray={segment.dashed ? '5 4' : undefined}
						/>
					))}
				</svg>
			</ViewportPortal>
			<Background variant={BackgroundVariant.Dots} gap={22} size={1} className="!bg-transparent" color="var(--border)" />
			<Controls showInteractive={false} position="top-right" />
			<MiniMap
				pannable
				zoomable
				position="bottom-right"
				nodeColor={node => ((node.data as PersonNodeData).isFocus ? 'var(--primary)' : 'var(--muted-foreground)')}
				nodeStrokeWidth={0}
				bgColor="var(--card)"
				maskColor="color-mix(in srgb, var(--background) 70%, transparent)"
			/>
			<AutoFit focusKey={graph.focus} />
		</ReactFlow>
	)
}

/**
 * Pannable, zoomable family tree on React Flow. The layout itself stays
 * auto-computed (edges are the source of truth); the viewport is what the
 * user controls: drag to pan, wheel to zoom, controls to fit, minimap to
 * navigate big trees. Refocusing re-fits automatically.
 */
export function RelationshipTree({ graph, onContactClick }: RelationshipTreeProps) {
	const layout = useMemo(() => layoutEgoTree(graph), [graph])

	if (graph.edges.length === 0 && graph.derivedSiblings.length === 0) {
		return (
			<div className="flex h-full min-h-64 items-center justify-center p-8 text-center text-sm text-muted-foreground">
				No relationships yet. Add a parent, spouse, or child to start the tree.
			</div>
		)
	}

	return (
		<ReactFlowProvider>
			<TreeCanvas graph={graph} layout={layout} onContactClick={onContactClick} />
		</ReactFlowProvider>
	)
}
