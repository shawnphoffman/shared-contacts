import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Merge, Loader2, RefreshCw, Mail, Phone, User, UserCheck, X } from 'lucide-react'
import type { Contact } from '../lib/db'
import { formatPhoneNumber } from '../lib/utils'

interface DuplicateGroup {
	contacts: Contact[]
	matchType: 'email' | 'phone' | 'name' | 'fuzzy_name'
	matchReason: string
}

interface DuplicatesResponse {
	groups: DuplicateGroup[]
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
	deletedContactIds: string[]
	mergedContact: Contact
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

function getMatchTypeIcon(matchType: string) {
	switch (matchType) {
		case 'email':
			return <Mail className="w-4 h-4" />
		case 'phone':
			return <Phone className="w-4 h-4" />
		case 'name':
			return <User className="w-4 h-4" />
		case 'fuzzy_name':
			return <UserCheck className="w-4 h-4" />
		default:
			return <User className="w-4 h-4" />
	}
}

function getMatchTypeLabel(matchType: string) {
	switch (matchType) {
		case 'email':
			return 'Email Match'
		case 'phone':
			return 'Phone Match'
		case 'name':
			return 'Name Match'
		case 'fuzzy_name':
			return 'Similar Name'
		default:
			return 'Match'
	}
}

/**
 * Generate a unique identifier for a duplicate group
 * Based on sorted contact IDs to ensure consistency
 */
function getGroupId(group: DuplicateGroup): string {
	const contactIds = group.contacts.map(c => c.id).sort()
	return contactIds.join('|')
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

	// Load declined groups from localStorage on mount
	useEffect(() => {
		try {
			const stored = localStorage.getItem(DECLINED_GROUPS_STORAGE_KEY)
			if (stored) {
				const declined = JSON.parse(stored) as string[]
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
			// Clear selection
			setSelectedContacts(new Set())
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

	const handleApproveGroup = (group: DuplicateGroup) => {
		// If there are selected contacts in this group, merge only those
		// Otherwise, merge all contacts in the group
		const selectedInGroup = group.contacts.filter(c => selectedContacts.has(c.id))
		const contactIds = selectedInGroup.length >= 2 ? selectedInGroup.map(c => c.id) : group.contacts.map(c => c.id)
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
			<div className="container mx-auto p-6">
				<div className="flex items-center justify-center py-12">
					<Loader2 className="w-8 h-8 animate-spin text-gray-400" />
					<span className="ml-3 text-muted-foreground">Loading duplicates...</span>
				</div>
			</div>
		)
	}

	// Filter out declined groups
	const visibleGroups = duplicates?.groups.filter(group => !declinedGroups.has(getGroupId(group))) || []

	if (!duplicates || visibleGroups.length === 0) {
		return (
			<div className="container mx-auto p-6">
				<div className="mb-6">
					<Button variant="outline" onClick={() => navigate({ to: '/' })}>
						← Back to Contacts
					</Button>
				</div>
				<div className="text-center py-12">
					<p className="text-lg text-muted-foreground mb-4">
						{duplicates && duplicates.totalGroups > 0 ? 'No duplicate groups to review' : 'No duplicate contacts found!'}
					</p>
					<p className="text-sm text-gray-500">
						{duplicates && duplicates.totalGroups > 0 ? 'All visible duplicate groups have been reviewed.' : 'All contacts are unique.'}
					</p>
				</div>
			</div>
		)
	}

	return (
		<div className="container mx-auto p-6 space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold">Duplicate Contacts Review</h1>
					<p className="text-gray-500 mt-1">
						Found {visibleGroups.length} duplicate group(s) to review
						{declinedGroups.size > 0 && <span className="text-gray-400"> ({declinedGroups.size} declined)</span>}
					</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" onClick={() => navigate({ to: '/' })}>
						← Back
					</Button>
					<Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
						<RefreshCw className="w-4 h-4 mr-1" />
						Refresh
					</Button>
				</div>
			</div>

			<div className="space-y-4">
				{visibleGroups.map((group, groupIndex) => {
					const hasMoreThanTwo = group.contacts.length > 2
					const selectedInGroup = group.contacts.filter(c => selectedContacts.has(c.id))
					const hasSelection = selectedInGroup.length >= 2

					return (
						<Card key={groupIndex}>
							<CardHeader>
								<div className="flex items-start justify-between">
									<div className="flex items-center gap-2">
										{getMatchTypeIcon(group.matchType)}
										<div>
											<CardTitle className="text-lg">{getMatchTypeLabel(group.matchType)}</CardTitle>
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
											<X className="w-4 h-4 mr-1" />
											Decline
										</Button>
										<Button variant="outline" size="sm" onClick={() => handleApproveGroup(group)} disabled={mergeMutation.isPending}>
											{mergeMutation.isPending ? (
												<>
													<Loader2 className="w-4 h-4 mr-1 animate-spin" />
													Merging...
												</>
											) : (
												<>
													<Merge className="w-4 h-4 mr-1" />
													{hasMoreThanTwo && hasSelection ? `Merge Selected (${selectedInGroup.length})` : 'Merge'}
												</>
											)}
										</Button>
									</div>
								</div>
							</CardHeader>
							<CardContent>
								<div className="space-y-3">
									{group.contacts.map(contact => {
										const isSelected = selectedContacts.has(contact.id)
										return (
											<div key={contact.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/20">
												{hasMoreThanTwo && (
													<Checkbox
														checked={isSelected}
														onCheckedChange={checked => handleSelectContact(contact.id, checked === true)}
														onClick={e => e.stopPropagation()}
														className="mt-1"
													/>
												)}
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2">
														<h4 className="font-medium">{contact.full_name || 'Unnamed Contact'}</h4>
														{contact.nickname && <span className="text-sm text-gray-500">({contact.nickname})</span>}
													</div>
													<div className="mt-1 space-y-1 text-sm text-muted-foreground">
														{contact.email && (
															<div className="flex items-center gap-2">
																<Mail className="w-3 h-3" />
																<span>{contact.email}</span>
															</div>
														)}
														{contact.phone && (
															<div className="flex items-center gap-2">
																<Phone className="w-3 h-3" />
																<span>{formatPhoneNumber(contact.phone)}</span>
															</div>
														)}
														{contact.organization && (
															<div className="flex items-center gap-2">
																<span>{contact.organization}</span>
																{contact.job_title && <span className="text-gray-400">• {contact.job_title}</span>}
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
		</div>
	)
}
