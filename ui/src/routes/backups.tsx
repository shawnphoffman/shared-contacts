import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, DatabaseBackup, Download, Play, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const Route = createFileRoute('/backups')({
	component: BackupsPage,
})

interface BackupFile {
	name: string
	size: number
	createdAt: string
}

interface BackupRun extends BackupFile {
	durationMs: number
	counts: Record<string, number>
	contactCount: number
	skippedTables: Array<string>
	pruned: Array<string>
}

type BackupLastRun = { status: 'success'; finishedAt: string; run: BackupRun } | { status: 'error'; finishedAt: string; message: string }

interface BackupsResponse {
	config: {
		enabled: boolean
		dir: string
		intervalMs: number
		keep: number
		warnings: Array<string>
	}
	scheduler: { running: boolean; nextRunAt: number | null }
	lastRun: BackupLastRun | null
	backups: Array<BackupFile>
}

async function fetchBackups(): Promise<BackupsResponse> {
	const response = await fetch('/api/backups')
	if (!response.ok) throw new Error('Failed to load backups')
	return response.json()
}

async function runBackupNow(): Promise<{ run: BackupRun }> {
	const response = await fetch('/api/backups', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action: 'run' }),
	})
	const body = await response.json().catch(() => null)
	if (!response.ok) throw new Error(body?.error || 'Failed to create backup')
	return body
}

async function deleteBackupFile(name: string): Promise<void> {
	const response = await fetch(`/api/backups/${encodeURIComponent(name)}`, { method: 'DELETE' })
	if (!response.ok) {
		const body = await response.json().catch(() => null)
		throw new Error(body?.error || 'Failed to delete backup')
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	const units = ['KB', 'MB', 'GB']
	let value = bytes / 1024
	let unit = 0
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024
		unit += 1
	}
	return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

function formatDuration(ms: number): string {
	const minutes = Math.round(ms / 60_000)
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
	const hours = minutes / 60
	if (hours < 24) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hour${hours === 1 ? '' : 's'}`
	const days = hours / 24
	return `${Number.isInteger(days) ? days : days.toFixed(1)} day${days === 1 ? '' : 's'}`
}

function formatDateTime(value: string | number): string {
	return new Date(value).toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})
}

function ScheduleSummary({ data }: { data: BackupsResponse }) {
	const { config, scheduler } = data

	return (
		<div className="space-y-3 rounded-2xl border bg-card p-4">
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant={config.enabled ? 'default' : 'secondary'}>{config.enabled ? 'scheduled' : 'manual only'}</Badge>
				{config.enabled && scheduler.nextRunAt && (
					<span className="text-sm text-muted-foreground">next run {formatDateTime(scheduler.nextRunAt)}</span>
				)}
			</div>

			<dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
				<div className="flex gap-2">
					<dt className="text-muted-foreground">Every</dt>
					<dd className="font-medium">{formatDuration(config.intervalMs)}</dd>
				</div>
				<div className="flex gap-2">
					<dt className="text-muted-foreground">Retention</dt>
					<dd className="font-medium">{config.keep === 0 ? 'keep every backup' : `newest ${config.keep}`}</dd>
				</div>
				<div className="flex gap-2 sm:col-span-2">
					<dt className="text-muted-foreground">Directory</dt>
					<dd className="font-mono text-xs break-all">{config.dir}</dd>
				</div>
			</dl>

			{!config.enabled && (
				<p className="text-sm text-muted-foreground">
					Set <code className="font-mono">BACKUP_ENABLED=true</code> to run backups on a schedule. You can still create one by hand below.
				</p>
			)}

			{config.warnings.map(warning => (
				<p key={warning} className="flex items-start gap-2 text-sm text-destructive">
					<AlertTriangle className="mt-0.5 size-4 shrink-0" />
					{warning}
				</p>
			))}
		</div>
	)
}

function LastRunSummary({ lastRun }: { lastRun: BackupLastRun }) {
	if (lastRun.status === 'error') {
		return (
			<p className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-card p-4 text-sm text-destructive">
				<AlertTriangle className="mt-0.5 size-4 shrink-0" />
				<span>
					Last backup failed at {formatDateTime(lastRun.finishedAt)}: {lastRun.message}
				</span>
			</p>
		)
	}

	const { run } = lastRun
	const rows = Object.values(run.counts).reduce((total, count) => total + count, 0)
	return (
		<p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
			Last backup {formatDateTime(lastRun.finishedAt)} — {run.contactCount} contacts, {rows} rows across {Object.keys(run.counts).length}{' '}
			tables, {formatBytes(run.size)} in {(run.durationMs / 1000).toFixed(1)}s{run.pruned.length > 0 && ` (pruned ${run.pruned.length})`}.
		</p>
	)
}

function BackupsPage() {
	const queryClient = useQueryClient()
	const [deleteTarget, setDeleteTarget] = useState<BackupFile | null>(null)

	const { data, isLoading, error } = useQuery({
		queryKey: ['backups'],
		queryFn: fetchBackups,
	})

	const runMutation = useMutation({
		mutationFn: runBackupNow,
		onSuccess: result => {
			queryClient.invalidateQueries({ queryKey: ['backups'] })
			toast.success(`Backup created (${formatBytes(result.run.size)})`)
		},
		onError: (err: Error) => toast.error(err.message),
	})

	const deleteMutation = useMutation({
		mutationFn: deleteBackupFile,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['backups'] })
			setDeleteTarget(null)
			toast.success('Backup deleted')
		},
		onError: (err: Error) => toast.error(err.message),
	})

	const header = (
		<PageHeader
			icon={<DatabaseBackup />}
			title="Backups"
			description="Scheduled archives of every contact, address book and relationship, written to disk."
			actions={
				<Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
					<Play className="mr-2 h-4 w-4" />
					{runMutation.isPending ? 'Backing up…' : 'Back up now'}
				</Button>
			}
		/>
	)

	if (isLoading) {
		return (
			<PageContainer width="standard" className="space-y-6">
				{header}
				<div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
			</PageContainer>
		)
	}

	if (error || !data) {
		return (
			<PageContainer width="standard" className="space-y-6">
				{header}
				<div className="py-12 text-center text-sm text-destructive">Error loading backups</div>
			</PageContainer>
		)
	}

	return (
		<PageContainer width="standard" className="space-y-6">
			{header}

			<ScheduleSummary data={data} />
			{data.lastRun && <LastRunSummary lastRun={data.lastRun} />}

			{data.backups.length === 0 ? (
				<div className="flex flex-col items-center gap-2 rounded-2xl border bg-card py-16 text-center">
					<DatabaseBackup className="size-8 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">No backups yet. Create one now, or wait for the next scheduled run.</p>
				</div>
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Archive</TableHead>
								<TableHead className="hidden sm:table-cell">Created</TableHead>
								<TableHead className="hidden md:table-cell">Size</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.backups.map(backup => {
								const deletingThis = deleteMutation.isPending && deleteTarget?.name === backup.name
								return (
									<TableRow key={backup.name}>
										<TableCell className="font-mono text-xs break-all">{backup.name}</TableCell>
										<TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{formatDateTime(backup.createdAt)}</TableCell>
										<TableCell className="hidden text-sm text-muted-foreground md:table-cell">{formatBytes(backup.size)}</TableCell>
										<TableCell className="text-right">
											<div className="flex justify-end gap-2">
												<Button variant="outline" size="sm" asChild>
													<a href={`/api/backups/${encodeURIComponent(backup.name)}`} download>
														<Download className="mr-1 h-3 w-3" />
														Download
													</a>
												</Button>
												<Button variant="destructive" size="sm" onClick={() => setDeleteTarget(backup)} disabled={deleteMutation.isPending}>
													<Trash2 className="mr-1 h-3 w-3" />
													{deletingThis ? 'Deleting…' : 'Delete'}
												</Button>
											</div>
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				</div>
			)}

			<ConfirmDialog
				open={deleteTarget !== null}
				onOpenChange={open => {
					if (!open) setDeleteTarget(null)
				}}
				title="Delete this backup?"
				description={deleteTarget ? `${deleteTarget.name} will be removed from disk. This cannot be undone.` : undefined}
				confirmLabel="Delete"
				pendingLabel="Deleting…"
				onConfirm={() => {
					if (deleteTarget) deleteMutation.mutate(deleteTarget.name)
				}}
				pending={deleteMutation.isPending}
			/>
		</PageContainer>
	)
}
