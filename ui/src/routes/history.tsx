import { Fragment, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, History, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import {
	UNDOABLE_OPS,
	computeChanges,
	describeSource,
	fetchHistory,
	formatHistoryDate as formatDate,
	humanizeField,
	operationBadgeClass,
	undoHistory,
} from '../lib/history-format'

export const Route = createFileRoute('/history')({
	component: HistoryPage,
	validateSearch: (search: Record<string, unknown>) => ({
		contactId: typeof search.contactId === 'string' ? search.contactId : undefined,
	}),
})

function HistoryPage() {
	const { contactId } = Route.useSearch()
	const queryClient = useQueryClient()
	const queryKey = ['history', contactId ?? null] as const
	const [expandedId, setExpandedId] = useState<string | null>(null)

	const { data, isLoading, error } = useQuery({
		queryKey,
		queryFn: () => fetchHistory(contactId),
	})

	const undoMutation = useMutation({
		mutationFn: undoHistory,
		onSuccess: result => {
			toast.success(result.message || 'Change undone')
			queryClient.invalidateQueries({ queryKey: ['history'] })
			queryClient.invalidateQueries({ queryKey: ['contacts'] })
			queryClient.invalidateQueries({ queryKey: ['trash'] })
		},
		onError: (err: Error) => toast.error(err.message),
	})

	const rows = data?.rows ?? []

	if (isLoading) {
		return (
			<div className="container mx-auto p-6">
				<div className="text-center">Loading history…</div>
			</div>
		)
	}

	if (error) {
		return (
			<div className="container mx-auto p-6">
				<div className="text-center text-red-500">Error loading history</div>
			</div>
		)
	}

	return (
		<div className="container mx-auto p-6 max-w-6xl">
			<div className="mb-6">
				<h1 className="text-3xl font-bold flex items-center gap-2">
					<History className="w-7 h-7" />
					Change History
				</h1>
				<p className="text-muted-foreground mt-1">
					{contactId ? 'History for this contact' : 'All changes across contacts'} ({rows.length} of {data?.total ?? 0})
				</p>
			</div>

			{rows.length === 0 ? (
				<Card>
					<CardContent className="py-12 text-center text-muted-foreground">No history yet.</CardContent>
				</Card>
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>When</TableHead>
								<TableHead>Operation</TableHead>
								<TableHead>How</TableHead>
								<TableHead>Who</TableHead>
								<TableHead>What</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map(row => {
								const undone = Boolean(row.undone_at)
								const canUndo = UNDOABLE_OPS.has(row.operation) && !undone
								const changes = computeChanges(row)
								const expanded = expandedId === row.id
								return (
									<Fragment key={row.id}>
										<TableRow className={undone ? 'opacity-60' : ''}>
											<TableCell className="text-sm whitespace-nowrap align-top">{formatDate(row.created_at)}</TableCell>
											<TableCell className="align-top">
												<span className={operationBadgeClass(row.operation)}>{row.operation}</span>
											</TableCell>
											<TableCell className="text-sm align-top">{describeSource(row.source)}</TableCell>
											<TableCell className="text-sm align-top">{row.actor || (row.actor_type === 'system' ? 'system' : '—')}</TableCell>
											<TableCell className="text-sm">
												<div>{row.summary || '—'}</div>
												{changes.length > 0 && (
													<button
														type="button"
														onClick={() => setExpandedId(expanded ? null : row.id)}
														className="inline-flex items-center gap-1 text-xs text-muted-foreground mt-0.5 hover:text-foreground transition-colors"
														aria-expanded={expanded}
													>
														{expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
														{changes.length} {changes.length === 1 ? 'field' : 'fields'} changed
													</button>
												)}
												{undone && <div className="text-xs italic text-muted-foreground mt-0.5">Undone {formatDate(row.undone_at!)}</div>}
											</TableCell>
											<TableCell className="text-right align-top">
												{canUndo ? (
													<Button
														variant="outline"
														size="sm"
														onClick={() => {
															if (window.confirm('Undo this change? A new history entry will be recorded.')) {
																undoMutation.mutate(row.id)
															}
														}}
														disabled={undoMutation.isPending}
													>
														<RotateCcw className="w-3 h-3 mr-1" />
														Undo
													</Button>
												) : (
													<span className="text-xs text-muted-foreground">—</span>
												)}
											</TableCell>
										</TableRow>
										{expanded && changes.length > 0 && (
											<TableRow key={`${row.id}-diff`} className={undone ? 'opacity-60' : ''}>
												<TableCell colSpan={6} className="bg-muted/30">
													<div className="space-y-2 py-1">
														{changes.map(change => (
															<div key={change.field} className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1 text-sm">
																<div className="font-medium text-muted-foreground">{humanizeField(change.field)}</div>
																{change.hasValues ? (
																	<div className="flex flex-wrap items-baseline gap-2 font-mono text-xs">
																		<span className="text-red-700 line-through decoration-red-700/40 dark:text-red-400">
																			{change.before}
																		</span>
																		<span className="text-muted-foreground">→</span>
																		<span className="text-green-700 dark:text-green-400">{change.after}</span>
																	</div>
																) : (
																	<div className="text-xs italic text-muted-foreground">updated (value not recorded)</div>
																)}
															</div>
														))}
													</div>
												</TableCell>
											</TableRow>
										)}
									</Fragment>
								)
							})}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	)
}
