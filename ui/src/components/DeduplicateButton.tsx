import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Button } from './ui/button'
import { Merge } from 'lucide-react'

interface DuplicatesResponse {
  groups: Array<{
    contacts: Array<{ id: string }>
    matchType: string
    matchReason: string
  }>
  totalGroups: number
  totalDuplicates: number
}

async function fetchDuplicates(): Promise<DuplicatesResponse> {
  const response = await fetch('/api/contacts/duplicates')

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch duplicates')
  }

  return response.json()
}

export function DeduplicateButton() {
  const navigate = useNavigate()

  const { data: duplicates, isLoading } = useQuery({
    queryKey: ['duplicates'],
    queryFn: fetchDuplicates,
    refetchInterval: 30000, // Refetch every 30 seconds
  })

  // Only show button if duplicates are found
  if (isLoading || !duplicates || duplicates.totalGroups === 0) {
    return null
  }

  return (
    <Button onClick={() => navigate({ to: '/duplicates' })} variant="outline">
      <Merge className="w-4 h-4 mr-1" />
      Merge
      {duplicates.totalGroups > 0 && (
        <span className="ml-1 px-2 py-0.5 text-xs font-semibold bg-primary text-primary-foreground rounded-full">
          {duplicates.totalGroups}
        </span>
      )}
    </Button>
  )
}
