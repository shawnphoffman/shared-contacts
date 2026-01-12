import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui/button'
import { Merge, Loader2 } from 'lucide-react'

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
  )
}
