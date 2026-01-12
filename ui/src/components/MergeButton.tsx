import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Merge, Loader2, CheckCircle2, XCircle } from 'lucide-react'

interface MergeResult {
  message: string
  primaryContactId: string
  deletedContactIds: string[]
  mergedContact: unknown
}

interface MergeButtonProps {
  contactIds: string[]
  onMergeSuccess?: () => void
}

async function mergeContacts(contactIds: string[]): Promise<MergeResult> {
  const response = await fetch('/api/contacts/merge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contactIds }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to merge contacts')
  }

  return response.json()
}

export function MergeButton({ contactIds, onMergeSuccess }: MergeButtonProps) {
  const queryClient = useQueryClient()

  const mergeMutation = useMutation({
    mutationFn: mergeContacts,
    onSuccess: () => {
      // Invalidate contacts query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      // Clear selection after successful merge
      onMergeSuccess?.()
    },
  })

  const handleMerge = () => {
    if (contactIds.length < 2) {
      return
    }
    mergeMutation.mutate(contactIds)
  }

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-medium mb-2">
          Merge Selected Contacts ({contactIds.length})
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Merge {contactIds.length} selected contacts into the oldest contact.
          Duplicate emails and phone numbers will be deduplicated.
        </p>
        <Button
          onClick={handleMerge}
          disabled={mergeMutation.isPending || contactIds.length < 2}
          variant="outline"
        >
          {mergeMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Merging...
            </>
          ) : (
            <>
              <Merge className="w-4 h-4 mr-2" />
              Merge {contactIds.length} Contacts
            </>
          )}
        </Button>
      </div>

      {mergeMutation.isSuccess && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                {mergeMutation.data.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {mergeMutation.isError && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <div className="flex items-start gap-2">
            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Merge failed
              </p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                {mergeMutation.error instanceof Error
                  ? mergeMutation.error.message
                  : 'An unknown error occurred'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
