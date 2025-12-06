import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Upload, Loader2, CheckCircle2, XCircle } from 'lucide-react'

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
  const queryClient = useQueryClient()

  const importMutation = useMutation({
    mutationFn: importCSV,
    onSuccess: () => {
      // Invalidate contacts query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      // Reset file after successful import
      setFile(null)
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (selectedFile.name.endsWith('.csv')) {
        setFile(selectedFile)
      } else {
        alert('Please select a CSV file')
      }
    }
  }

  const handleUpload = () => {
    if (file) {
      importMutation.mutate(file)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <label
            htmlFor="csv-upload"
            className="flex items-center gap-2 cursor-pointer"
          >
            <input
              id="csv-upload"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              disabled={importMutation.isPending}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById('csv-upload')?.click()}
              disabled={importMutation.isPending}
            >
              <Upload className="w-4 h-4 mr-2" />
              {file ? file.name : 'Select CSV File'}
            </Button>
          </label>
        </div>

        {file && (
          <Button onClick={handleUpload} disabled={importMutation.isPending}>
            {importMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Import
              </>
            )}
          </Button>
        )}
      </div>

      {importMutation.isSuccess && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                {importMutation.data.message}
              </p>
              {importMutation.data.updated > 0 && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  {importMutation.data.updated} existing contacts were updated
                </p>
              )}
              {importMutation.data.errors &&
                importMutation.data.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-sm text-green-700 dark:text-green-300 cursor-pointer">
                      {importMutation.data.errors.length} error(s)
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-green-600 dark:text-green-400">
                      {importMutation.data.errors.map((error, idx) => (
                        <li key={idx}>
                          Row {error.row}: {error.error}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
            </div>
          </div>
        </div>
      )}

      {importMutation.isError && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <div className="flex items-start gap-2">
            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Import failed
              </p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                {importMutation.error instanceof Error
                  ? importMutation.error.message
                  : 'An unknown error occurred'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
