import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
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

const DECLINED_GROUPS_STORAGE_KEY = 'declined-duplicate-groups'

function getGroupId(group: DuplicatesResponse['groups'][number]): string {
	const contactIds = group.contacts.map(contact => contact.id).sort()
	return contactIds.join('|')
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
	const [declinedGroups, setDeclinedGroups] = useState<Set<string>>(new Set())

	const { data: duplicates, isLoading } = useQuery({
		queryKey: ['duplicates'],
		queryFn: fetchDuplicates,
		refetchInterval: 30000, // Refetch every 30 seconds
	})

	useEffect(() => {
		const loadDeclined = () => {
			try {
				const stored = localStorage.getItem(DECLINED_GROUPS_STORAGE_KEY)
				if (!stored) {
					setDeclinedGroups(new Set())
					return
				}
				const declined = JSON.parse(stored) as string[]
				setDeclinedGroups(new Set(declined))
			} catch {
				setDeclinedGroups(new Set())
			}
		}

		loadDeclined()
		const handleStorage = (event: StorageEvent) => {
			if (event.key === DECLINED_GROUPS_STORAGE_KEY) {
				loadDeclined()
			}
		}
		window.addEventListener('storage', handleStorage)
		return () => window.removeEventListener('storage', handleStorage)
	}, [])

	const visibleGroupsCount = useMemo(() => {
		if (!duplicates) {
			return 0
		}
		return duplicates.groups.filter(group => !declinedGroups.has(getGroupId(group))).length
	}, [declinedGroups, duplicates])

	// Only show button if visible duplicates are found
	if (isLoading || !duplicates || visibleGroupsCount === 0) {
		return null
	}

	return (
		<Button onClick={() => navigate({ to: '/duplicates' })} variant="outline">
			<Merge className="w-4 h-4 mr-1" />
			Merge
			{visibleGroupsCount > 0 && (
				<span className="ml-1 px-2 py-0.5 text-xs font-semibold bg-primary text-primary-foreground rounded-full">{visibleGroupsCount}</span>
			)}
		</Button>
	)
}
