import { Fragment, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, History, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { PageContainer } from '../components/ui/page-container'
import { PageHeader } from '../components/ui/page-header'
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
	const [confirmId, setConfirmId] = useState<string | null>(null)

	const { data, isLoading, error } = useQuery({
		queryKey,
		queryFn: () => fetchHistory(contactId),
	})

	const undoMutation = useMutation({
		mutationFn: undoHistory,
		onSuccess: result => {
			toast.success(result.message || 'Change undone')
			setConfirmId(null)
			queryClient.invalidateQueries({ queryKey: ['history'] })
			queryClient.invalidateQueries({ queryKey: ['contacts'] })
			queryClient.invalidateQueries({ queryKey: ['trash'] })
		},
		onError: (err: Error) => toast.error(err.message),
	})

	const rows = data?.rows ?? []

	const description = contactId
		? `History for this contact (${rows.length} of ${data?.total ?? 0}).`
		: `Every change made to your contacts (${rows.length} of ${data?.total ?? 0}).`

	if (isLoading) {
		return (
			<PageContainer width="wide">
				<PageHeader icon={<History />} title="History" description="Every change made to your contacts." />
				<div className="mt-6 text-center text-sm text-muted-foreground">Loading history…</div>
			</PageContainer>
		)
	}

	if (error) {
		return (
			<PageContainer width="wide">
				<PageHeader icon={<History />} title="History" description="Every change made to your contacts." />
				<div className="mt-6 text-center text-sm text-destructive">Error loading history</div>
			</PageContainer>
		)
	}

	return (
		<PageContainer width="wide" className="space-y-6">
			<PageHeader icon={<History />} title="History" description={description} />

			{rows.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center gap-2 py-12 text-center">
						<History className="size-8 text-muted-foreground" />
						<p className="text-sm text-muted-foreground">No history yet.</p>
					</CardContent>
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
											<TableCell className="align-top whitespace-nowrap text-sm text-muted-foreground">
												{formatDate(row.created_at)}
											</TableCell>
											<TableCell className="align-top">
												<span className={operationBadgeClass(row.operation)}>{row.operation}</span>
											</TableCell>
											<TableCell className="align-top text-sm text-muted-foreground">{describeSource(row.source)}</TableCell>
											<TableCell className="align-top text-sm font-medium">
												{row.actor || (row.actor_type === 'system' ? 'system' : '—')}
											</TableCell>
											<TableCell className="text-sm">
												<div>{row.summary || '—'}</div>
												{changes.length > 0 && (
													<button
														type="button"
														onClick={() => setExpandedId(expanded ? null : row.id)}
														className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
														aria-expanded={expanded}
													>
														{expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
														{changes.length} {changes.length === 1 ? 'field' : 'fields'} changed
													</button>
												)}
												{undone && <div className="mt-0.5 text-xs italic text-muted-foreground">Undone {formatDate(row.undone_at!)}</div>}
											</TableCell>
											<TableCell className="align-top text-right">
												{canUndo ? (
													<Button variant="outline" size="sm" onClick={() => setConfirmId(row.id)} disabled={undoMutation.isPending}>
														<RotateCcw className="mr-1 size-3" />
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

			<ConfirmDialog
				open={confirmId !== null}
				onOpenChange={open => {
					if (!open) setConfirmId(null)
				}}
				variant="default"
				title="Undo this change?"
				description="A new history entry will be recorded."
				confirmLabel="Undo"
				pendingLabel="Undoing…"
				pending={undoMutation.isPending}
				onConfirm={() => {
					if (confirmId) undoMutation.mutate(confirmId)
				}}
			/>
		</PageContainer>
	)
}
