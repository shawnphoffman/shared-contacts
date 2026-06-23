import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Merge } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'

interface MergeResult {
	message: string
	primaryContactId: string
	deletedContactIds: Array<string>
	mergedContact: unknown
}

interface MergeButtonProps {
	contactIds: Array<string>
	onMergeSuccess?: () => void
}

async function mergeContacts(contactIds: Array<string>): Promise<MergeResult> {
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
		onSuccess: result => {
			// Invalidate contacts query to refresh the list
			queryClient.invalidateQueries({ queryKey: ['contacts'] })
			toast.success(result.message || 'Contacts merged')
			// Clear selection after successful merge
			onMergeSuccess?.()
		},
		onError: (error: Error) => toast.error(error.message),
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
					<Loader2 className="size-4 animate-spin" />
					Merging…
				</>
			) : (
				<>
					<Merge className="size-4" />
					Merge {contactIds.length}
				</>
			)}
		</Button>
	)
}
