import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { History, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'

export const Route = createFileRoute('/history')({
	component: HistoryPage,
	validateSearch: (search: Record<string, unknown>) => ({
		contactId: typeof search.contactId === 'string' ? search.contactId : undefined,
	}),
})

interface HistoryRow {
	id: string
	contact_id: string | null
	operation: string
	source: string
	actor: string | null
	actor_type: string | null
	user_agent: string | null
	summary: string | null
	changed_fields: Array<string> | null
	related_contact_ids: Array<string> | null
	undone_at: string | null
	undoes_history_id: string | null
	created_at: string
}

interface HistoryResponse {
	rows: Array<HistoryRow>
	total: number
}

async function fetchHistory(contactId?: string): Promise<HistoryResponse> {
	const params = new URLSearchParams()
	if (contactId) params.set('contactId', contactId)
	const response = await fetch(`/api/history?${params.toString()}`)
	if (!response.ok) throw new Error('Failed to fetch history')
	return response.json()
}

async function undoHistory(historyId: string): Promise<{ message: string }> {
	const response = await fetch(`/api/history/${historyId}/undo`, { method: 'POST' })
	if (!response.ok) {
		const error = await response.json()
		throw new Error(error.error || 'Undo failed')
	}
	return response.json()
}

function formatDate(dateStr: string): string {
	return new Date(dateStr).toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})
}

function describeSource(source: string): string {
	switch (source) {
		case 'web':
			return 'Web'
		case 'api':
			return 'API'
		case 'carddav':
			return 'CardDAV client'
		case 'sync':
			return 'Sync service'
		case 'import':
			return 'CSV import'
		case 'merge':
			return 'Manual merge'
		case 'dedup':
			return 'Auto-dedup'
		case 'system':
			return 'System'
		default:
			return source
	}
}

function operationBadgeClass(op: string): string {
	const base = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium'
	switch (op) {
		case 'create':
			return `${base} bg-green-500/15 text-green-700 dark:text-green-400`
		case 'update':
			return `${base} bg-blue-500/15 text-blue-700 dark:text-blue-400`
		case 'delete':
			return `${base} bg-orange-500/15 text-orange-700 dark:text-orange-400`
		case 'permanent_delete':
			return `${base} bg-red-500/15 text-red-700 dark:text-red-400`
		case 'restore':
			return `${base} bg-teal-500/15 text-teal-700 dark:text-teal-400`
		case 'merge':
			return `${base} bg-purple-500/15 text-purple-700 dark:text-purple-400`
		case 'undo':
			return `${base} bg-yellow-500/15 text-yellow-700 dark:text-yellow-400`
		default:
			return `${base} bg-muted text-muted-foreground`
	}
}

const UNDOABLE_OPS = new Set(['create', 'update', 'delete', 'restore', 'merge', 'permanent_delete'])

function HistoryPage() {
	const { contactId } = Route.useSearch()
	const queryClient = useQueryClient()
	const queryKey = ['history', contactId ?? null] as const

	const {
		data,
		isLoading,
		error,
	} = useQuery({
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
								return (
									<TableRow key={row.id} className={undone ? 'opacity-60' : ''}>
										<TableCell className="text-sm whitespace-nowrap">{formatDate(row.created_at)}</TableCell>
										<TableCell>
											<span className={operationBadgeClass(row.operation)}>{row.operation}</span>
										</TableCell>
										<TableCell className="text-sm">{describeSource(row.source)}</TableCell>
										<TableCell className="text-sm">{row.actor || (row.actor_type === 'system' ? 'system' : '—')}</TableCell>
										<TableCell className="text-sm">
											<div>{row.summary || '—'}</div>
											{row.changed_fields && row.changed_fields.length > 0 && (
												<div className="text-xs text-muted-foreground mt-0.5">
													Fields: {row.changed_fields.slice(0, 6).join(', ')}
													{row.changed_fields.length > 6 ? `, +${row.changed_fields.length - 6} more` : ''}
												</div>
											)}
											{undone && <div className="text-xs italic text-muted-foreground mt-0.5">Undone {formatDate(row.undone_at!)}</div>}
										</TableCell>
										<TableCell className="text-right">
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
								)
							})}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	)
}
