import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ContactAvatar } from '../ContactAvatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Skeleton } from '../ui/skeleton'
import { RelationshipTree } from './RelationshipTree'
import { PersonPicker } from './PersonPicker'
import type { PersonPick } from './PersonPicker'
import type { EgoGraph, GraphEdge, GraphNode } from '../../lib/relationship-layout'
import type { Contact } from '../../lib/db'

interface RelationshipPanelProps {
	contactId: string
	/** Shown in the loading overlay before the new graph arrives. */
	focusName?: string
	/** Called when the user clicks another contact's node to refocus. */
	onFocusContact?: (contactId: string) => void
}

type EndpointBody = { contact_id: string } | { placeholder_id: string } | { new_placeholder: { name: string } }

interface CreateBody {
	a: EndpointBody
	b: EndpointBody
	type: 'parent' | 'spouse' | 'partner' | 'sibling'
	qualifier?: string | null
}

async function fetchGraph(contactId: string): Promise<EgoGraph> {
	const response = await fetch(`/api/contacts/${contactId}/relationships`)
	if (!response.ok) {
		const body = await response.json().catch(() => ({}))
		throw new Error(body.error || 'Failed to fetch relationships')
	}
	return response.json()
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
	const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
	if (!response.ok) {
		const body = await response.json().catch(() => ({}))
		throw new Error((body as { error?: string }).error || 'Request failed')
	}
	return response.json()
}

function keyToEndpoint(key: string): EndpointBody {
	const id = key.slice(2)
	return key.startsWith('c:') ? { contact_id: id } : { placeholder_id: id }
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function BrailleSpinner({ className }: { className?: string }) {
	const [frame, setFrame] = useState(0)
	useEffect(() => {
		const timer = setInterval(() => setFrame(current => (current + 1) % SPINNER_FRAMES.length), 80)
		return () => clearInterval(timer)
	}, [])
	return (
		<span role="status" aria-label="Loading" className={className}>
			{SPINNER_FRAMES[frame]}
		</span>
	)
}

function placeholderInitials(name: string): string {
	return (
		name
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map(part => part.charAt(0).toUpperCase())
			.join('') || '?'
	)
}

function PersonRow({ node, right, dashed }: { node: GraphNode; right?: React.ReactNode; dashed?: boolean }) {
	return (
		<div className={`flex items-center gap-2 rounded-sm border bg-background px-2 py-1.5 ${dashed ? 'border-dashed bg-transparent' : ''}`}>
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
					className="h-6 w-6 text-[9px]"
				/>
			) : (
				<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed text-[9px] font-medium text-muted-foreground">
					{placeholderInitials(node.name)}
				</span>
			)}
			<span className="min-w-0 truncate text-sm font-medium">{node.name}</span>
			{node.kind === 'placeholder' && (
				<span className="shrink-0 rounded-sm border bg-muted px-1.5 text-[10px] text-muted-foreground">placeholder</span>
			)}
			<span className="ml-auto flex shrink-0 items-center gap-1">{right}</span>
		</div>
	)
}

function SectionHeading({ children }: { children: React.ReactNode }) {
	return <h3 className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground first:mt-0">{children}</h3>
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="block w-full rounded-sm border border-dashed border-input px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
		>
			+ {label}
		</button>
	)
}

function RemoveButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label="Remove relationship"
			className="px-1 text-sm text-muted-foreground transition-colors hover:text-destructive"
		>
			✕
		</button>
	)
}

type AddSection = 'parent' | 'partner' | 'child' | 'sibling'

/**
 * Relationship editor + auto-layout tree for one focal contact. Used with a
 * roster on the Relationships page and standalone on the contact editor's
 * Relations tab. Edits always write to the shared graph - the focal person
 * only determines the projection.
 */
export function RelationshipPanel({ contactId, focusName, onFocusContact }: RelationshipPanelProps) {
	const queryClient = useQueryClient()
	const [openPicker, setOpenPicker] = useState<AddSection | null>(null)

	const {
		data: graph,
		isLoading,
		isPlaceholderData,
		error,
	} = useQuery({
		queryKey: ['relationships', contactId],
		queryFn: () => fetchGraph(contactId),
		placeholderData: keepPreviousData,
	})

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ['relationships'] })
		queryClient.invalidateQueries({ queryKey: ['history'] })
	}

	const addMutation = useMutation({
		mutationFn: (body: CreateBody) => requestJson('/api/relationships', { method: 'POST', body: JSON.stringify(body) }),
		onSuccess: () => {
			invalidate()
			setOpenPicker(null)
		},
		onError: (err: Error) => toast.error(err.message),
	})

	const patchMutation = useMutation({
		mutationFn: ({ id, qualifier }: { id: string; qualifier: string | null }) =>
			requestJson(`/api/relationships/${id}`, { method: 'PATCH', body: JSON.stringify({ qualifier }) }),
		onSuccess: invalidate,
		onError: (err: Error) => toast.error(err.message),
	})

	const removeMutation = useMutation({
		mutationFn: (id: string) => requestJson(`/api/relationships/${id}`, { method: 'DELETE' }),
		onSuccess: invalidate,
		onError: (err: Error) => toast.error(err.message),
	})

	// spouse <-> partner is a type change, which means replace (edges are
	// canonical rows, not mutable type fields).
	const replaceMutation = useMutation({
		mutationFn: async ({ edge, body }: { edge: GraphEdge; body: CreateBody }) => {
			await requestJson(`/api/relationships/${edge.id}`, { method: 'DELETE' })
			return requestJson('/api/relationships', { method: 'POST', body: JSON.stringify(body) })
		},
		onSuccess: invalidate,
		onError: (err: Error) => toast.error(err.message),
	})

	if (error) {
		return <div className="rounded-sm border bg-card p-8 text-center text-sm text-destructive">{error.message}</div>
	}

	if (isLoading || !graph) {
		return (
			<div className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
				<div className="space-y-2">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-9 w-full" />
				</div>
				<div className="flex h-[520px] items-center justify-center rounded-sm border bg-card">
					<div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
						<BrailleSpinner className="text-xl text-primary" />
						<span>building tree{focusName ? ` for ${focusName}` : ''}…</span>
					</div>
				</div>
			</div>
		)
	}

	const focus = graph.focus
	const nodesByKey = new Map(graph.nodes.map(node => [node.key, node]))
	const otherKey = (edge: GraphEdge) => (edge.a === focus ? edge.b : edge.a)

	const parentEdges = graph.edges.filter(edge => edge.type === 'parent' && edge.b === focus)
	const childEdges = graph.edges.filter(edge => edge.type === 'parent' && edge.a === focus)
	const partnerEdges = graph.edges.filter(
		edge => (edge.type === 'spouse' || edge.type === 'partner') && (edge.a === focus || edge.b === focus)
	)
	const explicitSiblingEdges = graph.edges.filter(edge => edge.type === 'sibling' && (edge.a === focus || edge.b === focus))
	const derivedSiblingPairs = graph.derivedSiblings.filter(pair => pair.a === focus || pair.b === focus)

	const sectionContactIds = (edges: Array<GraphEdge>): Set<string> => {
		const ids = new Set<string>([contactId])
		for (const edge of edges) {
			const node = nodesByKey.get(otherKey(edge))
			if (node?.kind === 'contact') ids.add(node.id)
		}
		return ids
	}

	const addFromPick = (section: AddSection, pick: PersonPick) => {
		const self: EndpointBody = { contact_id: contactId }
		const bodies: Record<AddSection, CreateBody> = {
			parent: { a: pick, b: self, type: 'parent' },
			child: { a: self, b: pick, type: 'parent' },
			partner: { a: self, b: pick, type: 'spouse' },
			sibling: { a: self, b: pick, type: 'sibling' },
		}
		addMutation.mutate(bodies[section])
	}

	const partnerSelectValue = (edge: GraphEdge): string => {
		if (edge.type === 'partner') return 'partner'
		return edge.qualifier === 'ex' ? 'ex-spouse' : 'spouse'
	}

	const onPartnerTypeChange = (edge: GraphEdge, value: string) => {
		const targetType = value === 'partner' ? 'partner' : 'spouse'
		const targetQualifier = value === 'ex-spouse' ? 'ex' : null
		if (targetType === edge.type) {
			patchMutation.mutate({ id: edge.id, qualifier: targetQualifier })
			return
		}
		replaceMutation.mutate({
			edge,
			body: { a: keyToEndpoint(edge.a), b: keyToEndpoint(edge.b), type: targetType, qualifier: targetQualifier },
		})
	}

	const picker = (section: AddSection, edges: Array<GraphEdge>, placeholder: string) =>
		openPicker === section ? (
			<PersonPicker
				excludeContactIds={sectionContactIds(edges)}
				placeholder={placeholder}
				onPick={pick => addFromPick(section, pick)}
				onCancel={() => setOpenPicker(null)}
			/>
		) : null

	return (
		<div className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
			{/* Form pane */}
			<div className={isPlaceholderData ? 'pointer-events-none opacity-40' : undefined}>
				<SectionHeading>Parents</SectionHeading>
				<div className="space-y-1.5">
					{parentEdges.map(edge => {
						const node = nodesByKey.get(otherKey(edge))
						if (!node) return null
						return (
							<PersonRow
								key={edge.id}
								node={node}
								right={
									<>
										<Select
											value={edge.qualifier ?? 'biological'}
											onValueChange={value => patchMutation.mutate({ id: edge.id, qualifier: value === 'biological' ? null : value })}
										>
											<SelectTrigger className="h-7 w-[110px] text-xs">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="biological">biological</SelectItem>
												<SelectItem value="step">step</SelectItem>
												<SelectItem value="adoptive">adoptive</SelectItem>
											</SelectContent>
										</Select>
										<RemoveButton onClick={() => removeMutation.mutate(edge.id)} />
									</>
								}
							/>
						)
					})}
					{picker('parent', parentEdges, 'search or name a parent…')}
					{openPicker !== 'parent' && <AddButton label="add parent" onClick={() => setOpenPicker('parent')} />}
				</div>

				<SectionHeading>Spouse / Partner</SectionHeading>
				<div className="space-y-1.5">
					{partnerEdges.map(edge => {
						const node = nodesByKey.get(otherKey(edge))
						if (!node) return null
						return (
							<PersonRow
								key={edge.id}
								node={node}
								right={
									<>
										<Select value={partnerSelectValue(edge)} onValueChange={value => onPartnerTypeChange(edge, value)}>
											<SelectTrigger className="h-7 w-[110px] text-xs">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="spouse">spouse</SelectItem>
												<SelectItem value="partner">partner</SelectItem>
												<SelectItem value="ex-spouse">ex-spouse</SelectItem>
											</SelectContent>
										</Select>
										<RemoveButton onClick={() => removeMutation.mutate(edge.id)} />
									</>
								}
							/>
						)
					})}
					{picker('partner', partnerEdges, 'search or name a spouse or partner…')}
					{openPicker !== 'partner' && <AddButton label="add spouse or partner" onClick={() => setOpenPicker('partner')} />}
				</div>

				<SectionHeading>Siblings</SectionHeading>
				<div className="space-y-1.5">
					{derivedSiblingPairs.map(pair => {
						const node = nodesByKey.get(pair.a === focus ? pair.b : pair.a)
						if (!node) return null
						return (
							<PersonRow
								key={node.key}
								node={node}
								dashed
								right={
									<span className="rounded-sm border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
										derived · {pair.sharedParents >= 2 ? 'shared parents' : 'shared parent'}
									</span>
								}
							/>
						)
					})}
					{explicitSiblingEdges.map(edge => {
						const node = nodesByKey.get(otherKey(edge))
						if (!node) return null
						return <PersonRow key={edge.id} node={node} right={<RemoveButton onClick={() => removeMutation.mutate(edge.id)} />} />
					})}
					{picker('sibling', explicitSiblingEdges, 'search or name a sibling…')}
					{openPicker !== 'sibling' && <AddButton label="add sibling" onClick={() => setOpenPicker('sibling')} />}
					<p className="text-[10px] leading-snug text-muted-foreground">
						Siblings are derived automatically from shared parents. Add one explicitly only when the parents aren&apos;t in the system.
					</p>
				</div>

				<SectionHeading>Children</SectionHeading>
				<div className="space-y-1.5">
					{childEdges.map(edge => {
						const node = nodesByKey.get(otherKey(edge))
						if (!node) return null
						return <PersonRow key={edge.id} node={node} right={<RemoveButton onClick={() => removeMutation.mutate(edge.id)} />} />
					})}
					{picker('child', childEdges, 'search or name a child…')}
					{openPicker !== 'child' && <AddButton label="add child" onClick={() => setOpenPicker('child')} />}
				</div>
			</div>

			{/* Tree preview pane */}
			<div className="overflow-hidden rounded-sm border bg-card">
				<div className="border-b px-3 py-2 text-xs text-muted-foreground">auto-layout preview · click a node to refocus</div>
				<div className="relative h-[520px]">
					<RelationshipTree graph={graph} onContactClick={onFocusContact} />
					{isPlaceholderData && (
						<div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/85 text-xs text-muted-foreground">
							<BrailleSpinner className="text-xl text-primary" />
							<span>building tree{focusName ? ` for ${focusName}` : ''}…</span>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
