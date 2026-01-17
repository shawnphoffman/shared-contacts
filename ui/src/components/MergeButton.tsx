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
		<Button onClick={handleMerge} disabled={mergeMutation.isPending || contactIds.length < 2} variant="outline">
			{mergeMutation.isPending ? (
				<>
					<Loader2 className="w-4 h-4 mr-1 animate-spin" />
					Merging...
				</>
			) : (
				<>
					<Merge className="w-4 h-4 mr-1" />
					Merge {contactIds.length} Contacts
				</>
			)}
		</Button>
	)
}
