import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import {
	UNDOABLE_OPS,
	computeChanges,
	describeSource,
	fetchHistory,
	formatHistoryDate,
	humanizeField,
	operationBadgeClass,
	undoHistory,
} from '../lib/history-format'
import { Button } from './ui/button'

interface ContactHistoryPanelProps {
	contactId: string
}

const COLLAPSED_DIFF_COUNT = 4

/**
 * Per-contact change history rendered inline beside the editor. Mirrors the
 * History page's red/green diff language: who, how, operation, field-level
 * diffs (old to new) and a per-entry Undo.
 */
export function ContactHistoryPanel({ contactId }: ContactHistoryPanelProps) {
	const queryClient = useQueryClient()
	const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set())

	const { data, isLoading, error } = useQuery({
		queryKey: ['history', contactId],
		queryFn: () => fetchHistory(contactId),
	})

	const undoMutation = useMutation({
		mutationFn: undoHistory,
		onSuccess: result => {
			toast.success(result.message || 'Change undone')
			queryClient.invalidateQueries({ queryKey: ['history'] })
			queryClient.invalidateQueries({ queryKey: ['contacts'] })
			queryClient.invalidateQueries({ queryKey: ['contacts', contactId] })
			queryClient.invalidateQueries({ queryKey: ['trash'] })
		},
		onError: (err: Error) => toast.error(err.message),
	})

	if (isLoading) {
		return <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">Loading history…</div>
	}

	if (error) {
		return <div className="rounded-2xl border bg-card p-8 text-center text-sm text-destructive">Error loading history</div>
	}

	const rows = data?.rows ?? []

	if (rows.length === 0) {
		return <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">No history yet for this contact.</div>
	}

	return (
		<div className="divide-y overflow-hidden rounded-2xl border bg-card">
			{rows.map(row => {
				const undone = Boolean(row.undone_at)
				const canUndo = UNDOABLE_OPS.has(row.operation) && !undone
				const changes = computeChanges(row)
				const expanded = expandedDiffs.has(row.id)
				const visibleChanges = expanded ? changes : changes.slice(0, COLLAPSED_DIFF_COUNT)
				const hiddenCount = changes.length - visibleChanges.length
				const fieldCount = changes.length

				return (
					<div key={row.id} className={`p-4 ${undone ? 'opacity-60' : ''}`}>
						<div className="flex flex-wrap items-center gap-2 text-sm">
							<span className={operationBadgeClass(row.operation)}>{row.operation}</span>
							<span className="text-muted-foreground">{row.actor || (row.actor_type === 'system' ? 'system' : '—')}</span>
							<span className="text-xs text-muted-foreground/70">
								· {formatHistoryDate(row.created_at)} · {describeSource(row.source)}
								{fieldCount > 0 && ` · ${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'}`}
							</span>
							{canUndo && (
								<Button
									variant="ghost"
									size="sm"
									className="ml-auto h-7 text-primary hover:text-primary"
									disabled={undoMutation.isPending}
									onClick={() => {
										if (window.confirm('Undo this change? A new history entry will be recorded.')) {
											undoMutation.mutate(row.id)
										}
									}}
								>
									<RotateCcw className="size-3" />
									Undo
								</Button>
							)}
						</div>

						{undone && <div className="mt-1 text-xs italic text-muted-foreground">Undone {formatHistoryDate(row.undone_at!)}</div>}

						{changes.length > 0 && (
							<div className="mt-3 space-y-1.5 font-mono text-xs">
								{visibleChanges.map(change => (
									<div key={change.field} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
										<span className="inline-block w-24 shrink-0 font-sans text-muted-foreground">{humanizeField(change.field)}</span>
										{change.hasValues ? (
											<>
												<span className="text-red-700 line-through decoration-red-700/40 dark:text-red-400">{change.before}</span>
												<span className="text-muted-foreground">→</span>
												<span className="text-green-700 dark:text-green-400">{change.after}</span>
											</>
										) : (
											<span className="italic text-muted-foreground">updated (value not recorded)</span>
										)}
									</div>
								))}
								{hiddenCount > 0 && (
									<button
										type="button"
										className="mt-1 font-sans text-xs text-muted-foreground hover:text-foreground"
										onClick={() => setExpandedDiffs(prev => new Set(prev).add(row.id))}
									>
										+{hiddenCount} more {hiddenCount === 1 ? 'field' : 'fields'}
									</button>
								)}
							</div>
						)}
					</div>
				)
			})}
		</div>
	)
}
