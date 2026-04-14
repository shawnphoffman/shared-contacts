import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	BookOpen,
	Briefcase,
	Calendar,
	Download,
	FileDown,
	Mail,
	Phone,
	Plus,
	RefreshCw,
	Search,
	Trash2,
	X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatPhoneNumber } from '../lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Checkbox } from '../components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Skeleton } from '../components/ui/skeleton'
import { DeduplicateButton } from '../components/DeduplicateButton'
import { MergeButton } from '../components/MergeButton'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import type { Contact } from '../lib/db'

// Extend ColumnMeta to include className
declare module '@tanstack/react-table' {
	interface ColumnMeta<TData, TValue> {
		className?: string
	}
}

export const Route = createFileRoute('/')({
	component: ContactsIndexPage,
	validateSearch: (search: Record<string, unknown>) => ({
		book: typeof search.book === 'string' ? search.book : undefined,
	}),
})

async function fetchContacts(): Promise<Array<Contact>> {
	const response = await fetch('/api/contacts')
	if (!response.ok) {
		throw new Error('Failed to fetch contacts')
	}
	return response.json()
}

type FieldFilterKey = 'email' | 'phone' | 'birthday' | 'organization' | 'book'
type FieldFilterState = 'off' | 'has' | 'missing'

const FIELD_FILTERS: Array<{ id: FieldFilterKey; hasLabel: string; missingLabel: string; icon: typeof Mail }> = [
	{ id: 'email', hasLabel: 'Has Email', missingLabel: 'No Email', icon: Mail },
	{ id: 'phone', hasLabel: 'Has Phone', missingLabel: 'No Phone', icon: Phone },
	{ id: 'birthday', hasLabel: 'Has Birthday', missingLabel: 'No Birthday', icon: Calendar },
	{ id: 'organization', hasLabel: 'Has Org', missingLabel: 'No Org', icon: Briefcase },
	{ id: 'book', hasLabel: 'Has Book', missingLabel: 'No Book', icon: BookOpen },
]

function ContactsIndexPage() {
	const navigate = useNavigate()
	const { book: bookFromUrl } = Route.useSearch()
	const [searchQuery, setSearchQuery] = useState('')
	const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
	const [isBulkDeleting, setIsBulkDeleting] = useState(false)
	const [isBulkBooksDialogOpen, setIsBulkBooksDialogOpen] = useState(false)
	const [bulkAddToBookIds, setBulkAddToBookIds] = useState<Set<string>>(new Set())
	const [bulkRemoveFromBookIds, setBulkRemoveFromBookIds] = useState<Set<string>>(new Set())
	const [isBulkBooksSubmitting, setIsBulkBooksSubmitting] = useState(false)
	const [addressBooks, setAddressBooks] = useState<Array<{ id: string; name: string }>>([])
	const [selectedBookId, setSelectedBookId] = useState<string>(bookFromUrl ?? 'all')
	const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false)
	const [activeFilters, setActiveFilters] = useState<Map<FieldFilterKey, FieldFilterState>>(new Map())
	const showBookCount = addressBooks.length > 1

	// Sync URL param → dropdown when navigating with ?book=
	useEffect(() => {
		if (bookFromUrl && addressBooks.length > 0) {
			setSelectedBookId(bookFromUrl)
		}
	}, [bookFromUrl, addressBooks])

	const getNameParts = useCallback((contact: Contact) => {
		const firstName = contact.first_name?.trim() ?? ''
		const lastName = contact.last_name?.trim() ?? ''
		if (firstName || lastName) {
			return { firstName, lastName }
		}

		const fullName = contact.full_name?.trim() ?? ''
		if (!fullName) {
			return { firstName: '', lastName: '' }
		}

		if (fullName.includes(',')) {
			const [last, rest] = fullName.split(',')
			return { firstName: rest.trim(), lastName: last.trim() }
		}

		const parts = fullName.split(/\s+/)
		if (parts.length === 1) {
			return { firstName: parts[0], lastName: '' }
		}

		return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
	}, [])

	const {
		data: contacts = [],
		isLoading,
		isFetching,
		error,
		refetch,
	} = useQuery({
		queryKey: ['contacts'],
		queryFn: fetchContacts,
	})

	useEffect(() => {
		let isMounted = true
		const loadAddressBooks = async () => {
			try {
				const response = await fetch('/api/address-books')
				if (!response.ok) return
				const books = await response.json()
				if (isMounted) {
					setAddressBooks(Array.isArray(books) ? books : [])
				}
			} catch (error) {
				console.error('Failed to load address books', error)
			}
		}
		loadAddressBooks()
		return () => {
			isMounted = false
		}
	}, [])

	// Delete mutation available for future use
	// const deleteMutation = useMutation({
	//   mutationFn: async (id: string) => {
	//     const response = await fetch(`/api/contacts/${id}`, {
	//       method: 'DELETE',
	//     })
	//     if (!response.ok) {
	//       throw new Error('Failed to delete contact')
	//     }
	//   },
	//   onSuccess: () => {
	//     queryClient.invalidateQueries({ queryKey: ['contacts'] })
	//   },
	// })

	const columns: Array<ColumnDef<Contact>> = useMemo(
		() => [
			{
				id: 'select',
				header: ({ table }) => (
					<Checkbox
						checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
						onCheckedChange={value => table.toggleAllPageRowsSelected(!!value)}
						aria-label="Select all"
					/>
				),
				cell: ({ row }) => (
					<Checkbox
						checked={row.getIsSelected()}
						onCheckedChange={value => row.toggleSelected(!!value)}
						onClick={e => e.stopPropagation()}
						aria-label="Select row"
					/>
				),
				enableSorting: false,
				enableHiding: false,
			},
			{
				id: 'first_name',
				accessorFn: row => getNameParts(row).firstName.toLowerCase(),
				header: ({ column }) => {
					return (
						<button
							className="flex items-center gap-2 hover:text-foreground"
							onClick={e => {
								e.stopPropagation()
								column.toggleSorting(column.getIsSorted() === 'asc')
							}}
						>
							First Name
							{column.getIsSorted() === 'asc' ? (
								<ArrowUp className="size-4" />
							) : column.getIsSorted() === 'desc' ? (
								<ArrowDown className="size-4" />
							) : (
								<ArrowUpDown className="size-4 opacity-50" />
							)}
						</button>
					)
				},
				cell: ({ row }) => {
					const contact = row.original
					const { firstName } = getNameParts(contact)
					return (
						<div>
							<div className="font-medium">{firstName || 'Unnamed Contact'}</div>
							{contact.nickname && <div className="text-sm text-gray-500">{contact.nickname}</div>}
						</div>
					)
				},
			},
			{
				id: 'last_name',
				accessorFn: row => getNameParts(row).lastName.toLowerCase(),
				header: ({ column }) => {
					return (
						<button
							className="flex items-center gap-2 hover:text-foreground"
							onClick={e => {
								e.stopPropagation()
								column.toggleSorting(column.getIsSorted() === 'asc')
							}}
						>
							Last Name
							{column.getIsSorted() === 'asc' ? (
								<ArrowUp className="size-4" />
							) : column.getIsSorted() === 'desc' ? (
								<ArrowDown className="size-4" />
							) : (
								<ArrowUpDown className="size-4 opacity-50" />
							)}
						</button>
					)
				},
				cell: ({ row }) => {
					const { lastName } = getNameParts(row.original)
					return lastName ? <span>{lastName}</span> : <span className="text-gray-400">—</span>
				},
			},
			{
				accessorKey: 'email',
				header: ({ column }) => {
					return (
						<button
							className="flex items-center gap-2 hover:text-foreground"
							onClick={e => {
								e.stopPropagation()
								column.toggleSorting(column.getIsSorted() === 'asc')
							}}
						>
							Email
							{column.getIsSorted() === 'asc' ? (
								<ArrowUp className="size-4" />
							) : column.getIsSorted() === 'desc' ? (
								<ArrowDown className="size-4" />
							) : (
								<ArrowUpDown className="size-4 opacity-50" />
							)}
						</button>
					)
				},
				cell: ({ row }) => {
					const email = row.original.email
					return email ? <span>{email}</span> : <span className="text-gray-400">—</span>
				},
			},
			{
				accessorKey: 'birthday',
				header: ({ column }) => {
					return (
						<button
							className="flex items-center gap-2 hover:text-foreground"
							onClick={e => {
								e.stopPropagation()
								column.toggleSorting(column.getIsSorted() === 'asc')
							}}
						>
							Birthday
							{column.getIsSorted() === 'asc' ? (
								<ArrowUp className="size-4" />
							) : column.getIsSorted() === 'desc' ? (
								<ArrowDown className="size-4" />
							) : (
								<ArrowUpDown className="size-4 opacity-50" />
							)}
						</button>
					)
				},
				cell: ({ row }) => {
					const birthday = row.original.birthday
					if (!birthday) {
						return <span className="text-gray-400">—</span>
					}
					const date = new Date(birthday)
					return (
						<span>
							{date.toLocaleDateString('en-US', {
								year: 'numeric',
								month: 'short',
								day: 'numeric',
							})}
						</span>
					)
				},
			},
			{
				accessorKey: 'phone',
				header: ({ column }) => {
					return (
						<button
							className="flex items-center gap-2 hover:text-foreground"
							onClick={e => {
								e.stopPropagation()
								column.toggleSorting(column.getIsSorted() === 'asc')
							}}
						>
							Phone
							{column.getIsSorted() === 'asc' ? (
								<ArrowUp className="size-4" />
							) : column.getIsSorted() === 'desc' ? (
								<ArrowDown className="size-4" />
							) : (
								<ArrowUpDown className="size-4 opacity-50" />
							)}
						</button>
					)
				},
				cell: ({ row }) => {
					const phone = row.original.phone
					if (!phone) {
						return <span className="text-gray-400">—</span>
					}
					return <span>{formatPhoneNumber(phone)}</span>
				},
			},
			{
				accessorKey: 'organization',
				header: ({ column }) => {
					return (
						<button
							className="flex items-center gap-2 hover:text-foreground"
							onClick={e => {
								e.stopPropagation()
								column.toggleSorting(column.getIsSorted() === 'asc')
							}}
						>
							Organization
							{column.getIsSorted() === 'asc' ? (
								<ArrowUp className="size-4" />
							) : column.getIsSorted() === 'desc' ? (
								<ArrowDown className="size-4" />
							) : (
								<ArrowUpDown className="size-4 opacity-50" />
							)}
						</button>
					)
				},
				cell: ({ row }) => {
					const contact = row.original
					return (
						<div className="hidden lg:block">
							{contact.organization && <div>{contact.organization}</div>}
							{contact.job_title && <div className="text-sm text-gray-500">{contact.job_title}</div>}
						</div>
					)
				},
				meta: {
					className: 'hidden lg:table-cell',
				},
			},
			...(showBookCount
				? [
						{
							id: 'address_books_count',
							header: 'Books',
							cell: ({ row }) => {
								const count = row.original.address_books?.length ?? 0
								return count > 0 ? <span>{count}</span> : <span className="text-gray-400">—</span>
							},
							enableSorting: false,
							meta: {
								className: 'hidden sm:table-cell',
							},
						} as ColumnDef<Contact>,
					]
				: []),
		],
		[getNameParts, showBookCount]
	)

	const [sorting, setSorting] = useState<SortingState>([])

	const toggleFilter = useCallback((filter: FieldFilterKey) => {
		setActiveFilters(prev => {
			const next = new Map(prev)
			const current = next.get(filter) ?? 'off'
			if (current === 'off') next.set(filter, 'has')
			else if (current === 'has') next.set(filter, 'missing')
			else next.delete(filter)
			return next
		})
	}, [])

	const clearAllFilters = useCallback(() => {
		setActiveFilters(new Map())
		setSelectedBookId('all')
		setSearchQuery('')
		navigate({ to: '/', search: { book: undefined }, replace: true })
	}, [navigate])

	const handleBookChange = useCallback(
		(bookId: string) => {
			setSelectedBookId(bookId)
			navigate({
				to: '/',
				search: { book: bookId === 'all' ? undefined : bookId },
				replace: true,
			})
		},
		[navigate]
	)

	const filteredContacts = useMemo(() => {
		let result = contacts

		if (selectedBookId !== 'all') {
			result = result.filter(contact => contact.address_books?.some(book => book.id === selectedBookId))
		}

		for (const [key, state] of activeFilters) {
			if (state === 'off') continue
			if (key === 'email') result = result.filter(c => (state === 'has' ? !!c.email : !c.email))
			if (key === 'phone') result = result.filter(c => (state === 'has' ? !!c.phone : !c.phone))
			if (key === 'birthday') result = result.filter(c => (state === 'has' ? !!c.birthday : !c.birthday))
			if (key === 'organization') result = result.filter(c => (state === 'has' ? !!c.organization : !c.organization))
			if (key === 'book')
				result = result.filter(c =>
					state === 'has' ? c.address_books && c.address_books.length > 0 : !c.address_books || c.address_books.length === 0
				)
		}

		return result
	}, [contacts, selectedBookId, activeFilters])

	const table = useReactTable({
		data: filteredContacts,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		enableRowSelection: true,
		getRowId: row => row.id,
		onRowSelectionChange: setRowSelection,
		onSortingChange: setSorting,
		globalFilterFn: (row, _columnId, filterValue) => {
			const contact = row.original
			const query = String(filterValue).toLowerCase()
			return !!(
				contact.full_name?.toLowerCase().includes(query) ||
				contact.first_name?.toLowerCase().includes(query) ||
				contact.last_name?.toLowerCase().includes(query) ||
				contact.email?.toLowerCase().includes(query) ||
				contact.phone?.includes(query) ||
				contact.organization?.toLowerCase().includes(query) ||
				contact.job_title?.toLowerCase().includes(query)
			)
		},
		state: {
			globalFilter: searchQuery,
			rowSelection,
			sorting,
		},
	})

	const selectedContactIds = Object.keys(rowSelection).filter(id => rowSelection[id])

	const handleBulkBooksSubmit = async () => {
		if (selectedContactIds.length === 0 || (bulkAddToBookIds.size === 0 && bulkRemoveFromBookIds.size === 0) || isBulkBooksSubmitting) {
			return
		}
		setIsBulkBooksSubmitting(true)
		try {
			const response = await fetch('/api/contacts/bulk-books', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					contact_ids: selectedContactIds,
					add_to_book_ids: Array.from(bulkAddToBookIds),
					remove_from_book_ids: Array.from(bulkRemoveFromBookIds),
				}),
			})
			if (!response.ok) {
				const err = await response.json()
				throw new Error(err.error || 'Failed to update')
			}
			setIsBulkBooksDialogOpen(false)
			setBulkAddToBookIds(new Set())
			setBulkRemoveFromBookIds(new Set())
			setRowSelection({})
			await refetch()
		} catch (e) {
			console.error(e)
			alert(e instanceof Error ? e.message : 'Failed to update address books')
		} finally {
			setIsBulkBooksSubmitting(false)
		}
	}

	const handleBulkDelete = async () => {
		if (selectedContactIds.length === 0 || isBulkDeleting) {
			return
		}

		const shouldDelete = window.confirm(
			`Delete ${selectedContactIds.length} contact${selectedContactIds.length === 1 ? '' : 's'}? This cannot be undone.`
		)
		if (!shouldDelete) {
			return
		}

		setIsBulkDeleting(true)
		try {
			const results = await Promise.allSettled(
				selectedContactIds.map(async id => {
					const response = await fetch(`/api/contacts/${id}`, {
						method: 'DELETE',
					})
					if (!response.ok) {
						const errorText = await response.text()
						throw new Error(errorText || `Failed to delete contact with id ${id}`)
					}
				})
			)
			const failed = results.filter(result => result.status === 'rejected')
			if (failed.length > 0) {
				alert(`Failed to delete ${failed.length} contact${failed.length === 1 ? '' : 's'}.`)
			}
		} catch (error) {
			console.error('Error deleting contacts:', error)
			alert('Failed to delete selected contacts.')
		} finally {
			setIsBulkDeleting(false)
			await refetch()
			setRowSelection({})
		}
	}

	if (isLoading) {
		return (
			<div className="container mx-auto p-6 gap-4 flex flex-col max-w-5xl">
				<div className="flex sm:justify-between sm:items-center flex-col sm:flex-row gap-2">
					<Skeleton className="h-9 w-40" />
					<div className="flex gap-2">
						<Skeleton className="h-9 w-24" />
						<Skeleton className="h-9 w-16" />
					</div>
				</div>
				<div className="space-y-4">
					<Skeleton className="h-9 w-full" />
					<div className="rounded-md border">
						<div className="p-4 space-y-4">
							{Array.from({ length: 8 }).map((_, i) => (
								<div key={i} className="flex items-center gap-4">
									<Skeleton className="h-4 w-4 rounded" />
									<Skeleton className="h-4 flex-1" />
									<Skeleton className="h-4 w-40 hidden sm:block" />
									<Skeleton className="h-4 w-32 hidden md:block" />
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		)
	}

	if (error) {
		return (
			<div className="container mx-auto p-6 max-w-5xl">
				<div className="text-center py-12">
					<p className="text-red-500 mb-4">Failed to load contacts</p>
					<Button variant="outline" onClick={() => refetch()}>
						Try Again
					</Button>
				</div>
			</div>
		)
	}

	return (
		<div className="container mx-auto p-6 gap-4 flex flex-col max-w-5xl">
			<div className="flex sm:justify-between sm:items-center flex-col sm:flex-row gap-2">
				<h1 className="text-3xl font-bold">Contacts</h1>
				<div className="flex sm:flex-row flex-col sm:items-center gap-2 w-full sm:w-auto justify-between">
					<DeduplicateButton />
					<Button onClick={() => navigate({ to: '/new' })}>
						<Plus className="w-4 h-4 mr-1" />
						New
					</Button>
				</div>
			</div>

			<div className="space-y-4">
				<div className="flex flex-col sm:flex-row gap-2 sm:items-center">
					<div className="relative flex-1">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
						<Input
							type="text"
							placeholder="Search contacts..."
							value={searchQuery}
							onChange={e => setSearchQuery(e.target.value)}
							className="pl-10"
						/>
					</div>
					<div className="flex flex-row gap-2">
						<Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
							<RefreshCw className="size-4" />
						</Button>
						<Button variant="outline" onClick={() => setIsDownloadDialogOpen(true)}>
							<Download className="size-4" />
							Export
						</Button>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{addressBooks.length > 0 && (
						<select
							value={selectedBookId}
							onChange={e => handleBookChange(e.target.value)}
							className="h-7 pl-2 pr-6 rounded-full border border-input bg-background text-xs font-medium appearance-none"
							style={{
								backgroundImage:
									"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
								backgroundRepeat: 'no-repeat',
								backgroundPosition: 'right 6px center',
							}}
							aria-label="Filter by address book"
						>
							<option value="all">All Books</option>
							{addressBooks.map(book => (
								<option key={book.id} value={book.id}>
									{book.name}
								</option>
							))}
						</select>
					)}
					{FIELD_FILTERS.map(({ id, hasLabel, missingLabel, icon: Icon }) => {
						const state = activeFilters.get(id) ?? 'off'
						return (
							<button
								key={id}
								onClick={() => toggleFilter(id)}
								className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
									state === 'has'
										? 'border-primary bg-primary text-primary-foreground'
										: state === 'missing'
											? 'border-destructive bg-destructive text-white'
											: 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
								}`}
							>
								<Icon className="size-3" />
								{state === 'missing' ? missingLabel : hasLabel}
							</button>
						)
					})}
					{(activeFilters.size > 0 || selectedBookId !== 'all' || searchQuery) && (
						<button
							onClick={clearAllFilters}
							className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							<X className="size-3" />
							Clear all
						</button>
					)}
				</div>
				{(activeFilters.size > 0 || selectedBookId !== 'all' || searchQuery) && (
					<div className="text-sm text-muted-foreground">
						Showing {table.getRowModel().rows.length} of {contacts.length} contact{contacts.length === 1 ? '' : 's'}
					</div>
				)}
				{selectedContactIds.length >= 1 && (
					<div className="border-t pt-4 flex flex-col sm:flex-row sm:justify-end">
						<div className="w-full sm:w-auto flex flex-col sm:flex-row sm:items-center gap-2">
							{addressBooks.length > 0 && (
								<Button
									variant="outline"
									onClick={() => {
										setBulkAddToBookIds(new Set())
										setBulkRemoveFromBookIds(new Set())
										setIsBulkBooksDialogOpen(true)
									}}
								>
									<BookOpen className="w-4 h-4 mr-1" />
									Manage Books
								</Button>
							)}
							<Button variant="destructive" onClick={handleBulkDelete} disabled={isBulkDeleting}>
								<Trash2 className="w-4 h-4 mr-1" />
								{isBulkDeleting ? 'Deleting...' : `Delete ${selectedContactIds.length}`}
							</Button>
							{selectedContactIds.length >= 2 && <MergeButton contactIds={selectedContactIds} onMergeSuccess={() => setRowSelection({})} />}
						</div>
					</div>
				)}
			</div>

			{contacts.length === 0 && !searchQuery ? (
				<div className="text-center py-12">
					<p className="text-gray-500 mb-4">No contacts yet. Create your first contact!</p>
					<Button onClick={() => navigate({ to: '/new' })}>
						<Plus className="w-4 h-4 mr-1" />
						Create Contact
					</Button>
				</div>
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							{table.getHeaderGroups().map(headerGroup => (
								<TableRow key={headerGroup.id}>
									{headerGroup.headers.map(header => (
										<TableHead key={header.id} className={header.column.columnDef.meta?.className}>
											{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
										</TableHead>
									))}
								</TableRow>
							))}
						</TableHeader>
						<TableBody>
							{table.getRowModel().rows.length > 0 ? (
								table.getRowModel().rows.map(row => {
									const contact = row.original
									return (
										<TableRow
											key={row.id}
											data-state={row.getIsSelected() && 'selected'}
											onClick={() => navigate({ to: '/$id', params: { id: contact.id } })}
											className="cursor-pointer"
										>
											{row.getVisibleCells().map(cell => (
												<TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
													{flexRender(cell.column.columnDef.cell, cell.getContext())}
												</TableCell>
											))}
										</TableRow>
									)
								})
							) : (
								<TableRow>
									<TableCell colSpan={columns.length} className="h-24 text-center">
										{searchQuery ? 'No contacts found matching your search.' : 'No contacts yet.'}
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			)}

			<Dialog open={isDownloadDialogOpen} onOpenChange={setIsDownloadDialogOpen}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Export Contacts</DialogTitle>
						<DialogDescription>Download all contacts in your preferred format.</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-3 py-2">
						<Button variant="outline" className="justify-start h-auto py-3" asChild>
							<a href="/api/contacts/export?format=csv" download="contacts.csv" onClick={() => setIsDownloadDialogOpen(false)}>
								<FileDown className="size-5 mr-3" />
								<div className="text-left">
									<div className="font-medium">CSV</div>
									<div className="text-xs text-muted-foreground font-normal">Spreadsheet-compatible format</div>
								</div>
							</a>
						</Button>
						<Button variant="outline" className="justify-start h-auto py-3" asChild>
							<a href="/api/contacts/export?format=vcf" download="contacts.vcf" onClick={() => setIsDownloadDialogOpen(false)}>
								<FileDown className="size-5 mr-3" />
								<div className="text-left">
									<div className="font-medium">vCard (VCF)</div>
									<div className="text-xs text-muted-foreground font-normal">Standard contact exchange format</div>
								</div>
							</a>
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog open={isBulkBooksDialogOpen} onOpenChange={setIsBulkBooksDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Manage address books</DialogTitle>
						<DialogDescription>
							Add or remove {selectedContactIds.length} selected contact{selectedContactIds.length === 1 ? '' : 's'} to or from address
							books.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-6 py-2">
						<div>
							<div className="text-sm font-medium mb-2">Add to</div>
							<div className="flex flex-col gap-2">
								{addressBooks.map(book => (
									<label key={book.id} className="flex items-center gap-2">
										<Checkbox
											checked={bulkAddToBookIds.has(book.id)}
											onCheckedChange={checked =>
												setBulkAddToBookIds(prev => {
													const next = new Set(prev)
													if (checked) next.add(book.id)
													else next.delete(book.id)
													return next
												})
											}
										/>
										<span>{book.name}</span>
									</label>
								))}
							</div>
						</div>
						<div>
							<div className="text-sm font-medium mb-2">Remove from</div>
							<div className="flex flex-col gap-2">
								{addressBooks.map(book => (
									<label key={book.id} className="flex items-center gap-2">
										<Checkbox
											checked={bulkRemoveFromBookIds.has(book.id)}
											onCheckedChange={checked =>
												setBulkRemoveFromBookIds(prev => {
													const next = new Set(prev)
													if (checked) next.add(book.id)
													else next.delete(book.id)
													return next
												})
											}
										/>
										<span>{book.name}</span>
									</label>
								))}
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setIsBulkBooksDialogOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleBulkBooksSubmit}
							disabled={isBulkBooksSubmitting || (bulkAddToBookIds.size === 0 && bulkRemoveFromBookIds.size === 0)}
						>
							{isBulkBooksSubmitting ? 'Updating...' : 'Update'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
