import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Merge, Loader2 } from 'lucide-react'

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
    <div className="gap-2 flex flex-col sm:flex-row justify-between sm:items-center">
      <div className="gap-1 flex flex-col">
        <h3 className="text-sm font-medium">
          Merge Selected Contacts ({contactIds.length})
        </h3>
        <p className="text-xs text-gray-500">
          Merge {contactIds.length} selected contacts into the oldest contact.
          Duplicate emails and phone numbers will be deduplicated.
        </p>
      </div>
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
  )
}
