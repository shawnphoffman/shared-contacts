import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Merge, Loader2, CheckCircle2, XCircle } from 'lucide-react'

interface DeduplicateResult {
  message: string
  merged: number
  deleted: number
  errors?: Array<{ contact: string; error: string }>
}

async function deduplicateContacts(): Promise<DeduplicateResult> {
  const response = await fetch('/api/contacts/deduplicate', {
    method: 'POST',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to deduplicate contacts')
  }

  return response.json()
}

export function DeduplicateButton() {
  const queryClient = useQueryClient()

  const deduplicateMutation = useMutation({
    mutationFn: deduplicateContacts,
    onSuccess: () => {
      // Invalidate contacts query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
  })

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-medium mb-2">Merge Duplicates</h3>
        <p className="text-xs text-gray-500 mb-3">
          Find and merge duplicate contacts based on email or name + phone
        </p>
        <Button
          onClick={() => deduplicateMutation.mutate()}
          disabled={deduplicateMutation.isPending}
          variant="outline"
        >
          {deduplicateMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Merging...
            </>
          ) : (
            <>
              <Merge className="w-4 h-4 mr-2" />
              Merge Duplicates
            </>
          )}
        </Button>
      </div>

      {deduplicateMutation.isSuccess && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                {deduplicateMutation.data.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {deduplicateMutation.isError && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <div className="flex items-start gap-2">
            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Deduplication failed
              </p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                {deduplicateMutation.error instanceof Error
                  ? deduplicateMutation.error.message
                  : 'An unknown error occurred'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
