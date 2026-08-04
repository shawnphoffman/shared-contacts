import { useMemo } from 'react'
import { CARD_H, CARD_W, layoutEgoTree } from '../../lib/relationship-layout'
import { ContactAvatar } from '../ContactAvatar'
import { cn } from '../../lib/utils'
import type { EgoGraph, GraphNode } from '../../lib/relationship-layout'
import type { Contact } from '../../lib/db'

interface RelationshipTreeProps {
	graph: EgoGraph
	/** Contact nodes are refocus targets; placeholders are inert. */
	onContactClick?: (contactId: string) => void
}

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

/**
 * Read-only auto-layout family tree. Nothing here is draggable by design:
 * edges are the source of truth and the layout is recomputed on every change.
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
		<div className="h-full overflow-auto">
			<div className="relative" style={{ width: layout.width, height: layout.height, minWidth: '100%' }}>
				<svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height} aria-hidden="true">
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
				{layout.nodes.map(({ node, x, y, isFocus, relationLabel }) => {
					const clickable = node.kind === 'contact' && !isFocus && Boolean(onContactClick)
					const caption = [relationLabel, isFocus ? 'focal' : null, lifespan(node)].filter(Boolean).join(' · ')
					return (
						<div
							key={node.key}
							role={clickable ? 'button' : undefined}
							tabIndex={clickable ? 0 : undefined}
							onClick={clickable ? () => onContactClick?.(node.id) : undefined}
							onKeyDown={
								clickable
									? event => {
											if (event.key === 'Enter' || event.key === ' ') {
												event.preventDefault()
												onContactClick?.(node.id)
											}
										}
									: undefined
							}
							className={cn(
								'absolute flex items-center gap-2 rounded-sm border bg-card p-2',
								isFocus && 'border-primary ring-1 ring-primary',
								node.kind === 'placeholder' && 'border-dashed bg-transparent',
								clickable && 'cursor-pointer transition-colors hover:border-primary focus-visible:border-primary'
							)}
							style={{ left: x, top: y, width: CARD_W, minHeight: CARD_H }}
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
								<span className="line-clamp-2 text-xs font-semibold leading-tight break-words">{node.name}</span>
								{caption && <span className="block truncate text-[10px] text-muted-foreground">{caption}</span>}
							</span>
						</div>
					)
				})}
			</div>
		</div>
	)
}
