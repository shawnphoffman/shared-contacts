import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle2, Mail, Merge, Phone, RefreshCw, User, UserCheck, X } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Badge } from '../components/ui/badge'
import { PageContainer } from '../components/ui/page-container'
import { PageHeader } from '../components/ui/page-header'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { Skeleton } from '../components/ui/skeleton'
import { formatPhoneNumber } from '../lib/utils'
import type { Contact } from '../lib/db'

interface DuplicateGroup {
	contacts: Array<Contact>
	matchType: 'email' | 'phone' | 'name' | 'fuzzy_name'
	matchReason: string
}

interface DuplicatesResponse {
	groups: Array<DuplicateGroup>
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

interface MergeResult {
	message: string
	primaryContactId: string
	deletedContactIds: Array<string>
	mergedContact: Contact
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

function getMatchTypeIcon(matchType: string) {
	switch (matchType) {
		case 'email':
			return <Mail className="h-4 w-4" />
		case 'phone':
			return <Phone className="h-4 w-4" />
		case 'name':
			return <User className="h-4 w-4" />
		case 'fuzzy_name':
			return <UserCheck className="h-4 w-4" />
		default:
			return <User className="h-4 w-4" />
	}
}

function getMatchTypeLabel(matchType: string) {
	switch (matchType) {
		case 'email':
			return 'Email match'
		case 'phone':
			return 'Phone match'
		case 'name':
			return 'Name match'
		case 'fuzzy_name':
			return 'Similar name'
		default:
			return 'Match'
	}
}

/**
 * Match-confidence badge. Exact identifier matches (email/phone/name) are
 * high-confidence merges the user can act on, so they get the stronger
 * `default` variant. Fuzzy-name matches are uncertain and routine, so they
 * stay quiet with `secondary`.
 */
function getMatchBadgeVariant(matchType: string): 'default' | 'secondary' {
	return matchType === 'fuzzy_name' ? 'secondary' : 'default'
}

/**
 * Generate a unique identifier for a duplicate group
 * Based on sorted contact IDs to ensure consistency
 */
function getGroupId(group: DuplicateGroup): string {
	const contactIds = group.contacts.map(c => c.id).sort()
	return contactIds.join('|')
}

function contactDisplayName(contact: Contact): string {
	return contact.full_name || 'Unnamed Contact'
}

const DECLINED_GROUPS_STORAGE_KEY = 'declined-duplicate-groups'

export const Route = createFileRoute('/duplicates')({
	component: DuplicatesPage,
})

function DuplicatesPage() {
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set())
	const [declinedGroups, setDeclinedGroups] = useState<Set<string>>(new Set())
	// The group whose merge is pending confirmation.
	const [pendingMergeGroup, setPendingMergeGroup] = useState<DuplicateGroup | null>(null)

	// Load declined groups from localStorage on mount
	useEffect(() => {
		try {
			const stored = localStorage.getItem(DECLINED_GROUPS_STORAGE_KEY)
			if (stored) {
				const declined = JSON.parse(stored) as Array<string>
				setDeclinedGroups(new Set(declined))
			}
		} catch (error) {
			console.error('Failed to load declined groups:', error)
		}
	}, [])

	// Save declined groups to localStorage whenever it changes
	useEffect(() => {
		try {
			localStorage.setItem(DECLINED_GROUPS_STORAGE_KEY, JSON.stringify(Array.from(declinedGroups)))
		} catch (error) {
			console.error('Failed to save declined groups:', error)
		}
	}, [declinedGroups])

	const {
		data: duplicates,
		isLoading,
		isFetching,
		refetch,
	} = useQuery({
		queryKey: ['duplicates'],
		queryFn: fetchDuplicates,
	})

	const mergeMutation = useMutation({
		mutationFn: mergeContacts,
		onSuccess: data => {
			toast.success(data.message)
			// Invalidate queries to refresh data
			queryClient.invalidateQueries({ queryKey: ['contacts'] })
			queryClient.invalidateQueries({ queryKey: ['duplicates'] })
			// Clear selection and pending confirmation
			setSelectedContacts(new Set())
			setPendingMergeGroup(null)
			// Refetch duplicates
			refetch()
		},
		onError: (error: Error) => {
			toast.error(error.message || 'Failed to merge contacts')
		},
	})

	const handleSelectContact = (contactId: string, checked: boolean) => {
		const newSelected = new Set(selectedContacts)
		if (checked) {
			newSelected.add(contactId)
		} else {
			newSelected.delete(contactId)
		}
		setSelectedContacts(newSelected)
	}

	// Resolve which contacts a merge would combine for a given group: the
	// selected subset when 2+ are checked, otherwise the whole group.
	const resolveMergeContacts = (group: DuplicateGroup): Array<Contact> => {
		const selectedInGroup = group.contacts.filter(c => selectedContacts.has(c.id))
		return selectedInGroup.length >= 2 ? selectedInGroup : group.contacts
	}

	const handleConfirmMerge = () => {
		if (!pendingMergeGroup) return
		const contactIds = resolveMergeContacts(pendingMergeGroup).map(c => c.id)
		mergeMutation.mutate(contactIds)
	}

	const handleDeclineGroup = (group: DuplicateGroup) => {
		const groupId = getGroupId(group)
		setDeclinedGroups(prev => {
			const next = new Set(prev)
			next.add(groupId)
			return next
		})
		// Clear any selected contacts from this group
		setSelectedContacts(prev => {
			const next = new Set(prev)
			group.contacts.forEach(c => next.delete(c.id))
			return next
		})
		toast.success('Match declined and hidden')
	}

	if (isLoading) {
		return (
			<PageContainer width="standard" className="space-y-6">
				<PageHeader title="Duplicate contacts" description="Review and merge contacts that look like the same person." />
				<div className="space-y-4">
					<Skeleton className="h-40 w-full rounded-xl" />
					<Skeleton className="h-40 w-full rounded-xl" />
				</div>
			</PageContainer>
		)
	}

	// Filter out declined groups
	const visibleGroups = duplicates?.groups.filter(group => !declinedGroups.has(getGroupId(group))) || []

	const headerActions = (
		<>
			<Button variant="outline" onClick={() => navigate({ to: '/', search: { book: undefined } })}>
				<ArrowLeft className="mr-1 h-4 w-4" />
				Back
			</Button>
			<Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
				<RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
				{isFetching ? 'Refreshing…' : 'Refresh'}
			</Button>
		</>
	)

	if (!duplicates || visibleGroups.length === 0) {
		const reviewedSome = duplicates && duplicates.totalGroups > 0
		return (
			<PageContainer width="standard" className="space-y-6">
				<PageHeader
					title="Duplicate contacts"
					description="Review and merge contacts that look like the same person."
					actions={headerActions}
				/>
				<Card className="border-dashed">
					<CardContent className="flex flex-col items-center justify-center py-16 text-center">
						<CheckCircle2 className="mb-4 h-12 w-12 text-muted-foreground" />
						<p className="mb-1 text-muted-foreground">{reviewedSome ? 'No duplicate groups to review' : 'No duplicate contacts found'}</p>
						<p className="text-sm text-muted-foreground">
							{reviewedSome ? 'All visible duplicate groups have been reviewed.' : 'All contacts are unique.'}
						</p>
					</CardContent>
				</Card>
			</PageContainer>
		)
	}

	// Build the named-consequence description for the pending merge.
	const mergePreview = pendingMergeGroup ? resolveMergeContacts(pendingMergeGroup) : []
	const mergePrimary = mergePreview[0]

	return (
		<PageContainer width="standard" className="space-y-6">
			<PageHeader
				title="Duplicate contacts"
				description={
					<>
						{visibleGroups.length} duplicate group{visibleGroups.length === 1 ? '' : 's'} to review
						{declinedGroups.size > 0 && ` (${declinedGroups.size} declined)`}
					</>
				}
				actions={headerActions}
			/>

			<div className="space-y-4">
				{visibleGroups.map((group, groupIndex) => {
					const hasMoreThanTwo = group.contacts.length > 2
					const selectedInGroup = group.contacts.filter(c => selectedContacts.has(c.id))
					const hasSelection = selectedInGroup.length >= 2
					const isThisPending = mergeMutation.isPending && pendingMergeGroup === group

					return (
						<Card key={groupIndex}>
							<CardHeader>
								<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
									<div className="flex items-center gap-2">
										<span className="text-muted-foreground">{getMatchTypeIcon(group.matchType)}</span>
										<div>
											<div className="flex items-center gap-2">
												<CardTitle className="text-base font-semibold">{getMatchTypeLabel(group.matchType)}</CardTitle>
												<Badge variant={getMatchBadgeVariant(group.matchType)}>{group.contacts.length} contacts</Badge>
											</div>
											<CardDescription>{group.matchReason}</CardDescription>
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => handleDeclineGroup(group)}
											disabled={mergeMutation.isPending}
											title="Decline this match"
										>
											<X className="mr-1 h-4 w-4" />
											Decline
										</Button>
										<Button variant="outline" size="sm" onClick={() => setPendingMergeGroup(group)} disabled={mergeMutation.isPending}>
											<Merge className="mr-1 h-4 w-4" />
											{isThisPending ? 'Merging…' : hasMoreThanTwo && hasSelection ? `Merge selected (${selectedInGroup.length})` : 'Merge'}
										</Button>
									</div>
								</div>
							</CardHeader>
							<CardContent>
								<div className="space-y-3">
									{group.contacts.map(contact => {
										const isSelected = selectedContacts.has(contact.id)
										return (
											<div
												key={contact.id}
												className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
													isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
												}`}
											>
												{hasMoreThanTwo && (
													<Checkbox
														checked={isSelected}
														onCheckedChange={checked => handleSelectContact(contact.id, checked === true)}
														onClick={e => e.stopPropagation()}
														className="mt-1"
														aria-label={`Select ${contactDisplayName(contact)}`}
													/>
												)}
												<div className="min-w-0 flex-1">
													<div className="flex items-center gap-2">
														<h4 className="font-medium">{contactDisplayName(contact)}</h4>
														{contact.nickname && <span className="text-sm text-muted-foreground">({contact.nickname})</span>}
													</div>
													<div className="mt-1 space-y-1 text-sm text-muted-foreground">
														{contact.email && (
															<div className="flex items-center gap-2">
																<Mail className="h-3 w-3" />
																<span>{contact.email}</span>
															</div>
														)}
														{contact.phone && (
															<div className="flex items-center gap-2">
																<Phone className="h-3 w-3" />
																<span>{formatPhoneNumber(contact.phone)}</span>
															</div>
														)}
														{contact.organization && (
															<div className="flex items-center gap-2">
																<span>{contact.organization}</span>
																{contact.job_title && <span className="text-muted-foreground">• {contact.job_title}</span>}
															</div>
														)}
													</div>
												</div>
												<Button variant="ghost" size="sm" onClick={() => navigate({ to: '/$id', params: { id: contact.id } })}>
													View
												</Button>
											</div>
										)
									})}
								</div>
							</CardContent>
						</Card>
					)
				})}
			</div>

			<ConfirmDialog
				open={pendingMergeGroup !== null}
				onOpenChange={open => {
					if (!open && !mergeMutation.isPending) setPendingMergeGroup(null)
				}}
				title={mergePreview.length > 0 ? `Merge ${mergePreview.length} contacts?` : 'Merge contacts?'}
				description={
					mergePreview.length > 0
						? `${mergePreview.length} contacts will be combined into "${contactDisplayName(mergePrimary)}". The other ${
								mergePreview.length - 1
							} will be deleted. This cannot be undone.`
						: 'The selected contacts will be combined into one. This cannot be undone.'
				}
				confirmLabel="Merge"
				pendingLabel="Merging…"
				variant="default"
				onConfirm={handleConfirmMerge}
				pending={mergeMutation.isPending}
			/>
		</PageContainer>
	)
}
