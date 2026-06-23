import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileText, Loader2, Upload, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Card, CardContent } from './ui/card'

interface ImportResult {
	message: string
	success: number
	updated: number
	skipped: number
	failed: number
	errors?: Array<{ row: number; error: string }>
}

async function importCSV(file: File): Promise<ImportResult> {
	const formData = new FormData()
	formData.append('file', file)

	const response = await fetch('/api/contacts/import', {
		method: 'POST',
		body: formData,
	})

	if (!response.ok) {
		const error = await response.json()
		throw new Error(error.error || 'Failed to import CSV')
	}

	return response.json()
}

export function CSVUpload() {
	const [file, setFile] = useState<File | null>(null)
	const [isDragging, setIsDragging] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)
	const queryClient = useQueryClient()

	const importMutation = useMutation({
		mutationFn: importCSV,
		onSuccess: data => {
			// Invalidate contacts query to refresh the list
			queryClient.invalidateQueries({ queryKey: ['contacts'] })
			toast.success(`Imported ${data.success} contact${data.success === 1 ? '' : 's'}`)
			// Reset file after successful import
			setFile(null)
		},
		onError: (err: Error) => {
			toast.error(err.message)
		},
	})

	const selectFile = (selectedFile: File | undefined) => {
		if (!selectedFile) return
		if (selectedFile.name.toLowerCase().endsWith('.csv')) {
			setFile(selectedFile)
		} else {
			toast.error('Please select a CSV file')
		}
	}

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		selectFile(e.target.files?.[0])
		// Allow re-selecting the same file name after a reset
		e.target.value = ''
	}

	const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault()
		setIsDragging(false)
		if (importMutation.isPending) return
		selectFile(e.dataTransfer.files[0])
	}

	const openPicker = () => inputRef.current?.click()

	const handleUpload = () => {
		if (file) {
			importMutation.mutate(file)
		}
	}

	const result = importMutation.data

	return (
		<div className="space-y-4">
			<input
				ref={inputRef}
				id="csv-upload"
				type="file"
				accept=".csv"
				onChange={handleFileChange}
				className="sr-only"
				disabled={importMutation.isPending}
			/>

			{/* Dropzone */}
			<div
				role="button"
				tabIndex={0}
				aria-label="Choose a CSV file or drop one here"
				aria-disabled={importMutation.isPending}
				onClick={() => !importMutation.isPending && openPicker()}
				onKeyDown={e => {
					if (importMutation.isPending) return
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault()
						openPicker()
					}
				}}
				onDragOver={e => {
					e.preventDefault()
					if (!importMutation.isPending) setIsDragging(true)
				}}
				onDragLeave={() => setIsDragging(false)}
				onDrop={handleDrop}
				className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center outline-none transition-colors focus-visible:ring-ring/50 focus-visible:ring-[3px] ${
					importMutation.isPending ? 'pointer-events-none opacity-60' : 'cursor-pointer hover:border-primary/50 hover:bg-accent/40'
				} ${isDragging ? 'border-primary bg-accent/50' : 'border-border'}`}
			>
				<Upload className="size-8 text-muted-foreground" />
				{file ? (
					<div className="flex items-center gap-2 text-sm font-medium">
						<FileText className="size-4 text-muted-foreground" />
						{file.name}
					</div>
				) : (
					<p className="text-sm font-medium">Drop a CSV file here, or click to choose</p>
				)}
				<p className="text-xs text-muted-foreground">CSV files only</p>
			</div>

			<div className="flex items-center justify-end gap-2">
				{file && !importMutation.isPending && (
					<Button type="button" variant="outline" onClick={() => setFile(null)}>
						Clear
					</Button>
				)}
				<Button type="button" onClick={handleUpload} disabled={!file || importMutation.isPending}>
					{importMutation.isPending ? (
						<>
							<Loader2 className="mr-1 size-4 animate-spin" />
							Importing…
						</>
					) : (
						<>
							<Upload className="mr-1 size-4" />
							Import
						</>
					)}
				</Button>
			</div>

			{/* Success summary */}
			{importMutation.isSuccess && result && (
				<Card>
					<CardContent className="space-y-3">
						<div className="flex items-start gap-2">
							<CheckCircle2 className="mt-0.5 size-5 text-primary" />
							<div className="flex-1 space-y-2">
								<p className="text-sm font-medium">{result.message}</p>
								<div className="flex flex-wrap gap-2">
									<Badge variant="secondary">{result.success} imported</Badge>
									{result.updated > 0 && <Badge variant="secondary">{result.updated} updated</Badge>}
									{result.skipped > 0 && <Badge variant="outline">{result.skipped} skipped</Badge>}
									{result.failed > 0 && <Badge variant="destructive">{result.failed} failed</Badge>}
								</div>
								{result.errors && result.errors.length > 0 && (
									<details className="mt-1">
										<summary className="cursor-pointer text-sm text-muted-foreground outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] rounded">
											{result.errors.length} error{result.errors.length === 1 ? '' : 's'}
										</summary>
										<ul className="mt-2 space-y-1 text-sm text-muted-foreground">
											{result.errors.map((error, idx) => (
												<li key={idx}>
													Row {error.row}: {error.error}
												</li>
											))}
										</ul>
									</details>
								)}
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Error summary */}
			{importMutation.isError && (
				<Card className="border-destructive/50">
					<CardContent>
						<div className="flex items-start gap-2">
							<XCircle className="mt-0.5 size-5 text-destructive" />
							<div className="flex-1">
								<p className="text-sm font-medium">Import failed</p>
								<p className="mt-1 text-sm text-muted-foreground">
									{importMutation.error instanceof Error ? importMutation.error.message : 'An unknown error occurred'}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
