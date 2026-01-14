import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowUpDown, ArrowUp, ArrowDown, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatPhoneNumber } from '../lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Checkbox } from '../components/ui/checkbox'
import { DeduplicateButton } from '../components/DeduplicateButton'
import { MergeButton } from '../components/MergeButton'
import type { ColumnDef } from '@tanstack/react-table'
import type { Contact } from '../lib/db'

// Extend ColumnMeta to include className
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    className?: string
  }
}

export const Route = createFileRoute('/')({
  component: ContactsIndexPage,
})

async function fetchContacts(): Promise<Array<Contact>> {
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/150ee9a9-9ed8-47a6-a49f-3d7830732250',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/index.tsx:43',message:'fetch contacts start',data:{url:'/api/contacts'},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  const response = await fetch('/api/contacts')
  const contentType = response.headers.get('content-type')
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/150ee9a9-9ed8-47a6-a49f-3d7830732250',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/index.tsx:47',message:'fetch contacts response',data:{ok:response.ok,status:response.status,contentType},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  if (!response.ok) {
    throw new Error('Failed to fetch contacts')
  }
  let data: unknown
  try {
    data = await response.json()
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/150ee9a9-9ed8-47a6-a49f-3d7830732250',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/index.tsx:55',message:'fetch contacts json error',data:{errorMessage:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    throw error
  }
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/150ee9a9-9ed8-47a6-a49f-3d7830732250',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/index.tsx:62',message:'fetch contacts parsed',data:{isArray:Array.isArray(data),length:Array.isArray(data) ? data.length : null},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  return data as Array<Contact>
}

function ContactsIndexPage() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})

  const { data: contacts = [], isLoading, status } = useQuery({
    queryKey: ['contacts'],
    queryFn: fetchContacts,
  })
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/150ee9a9-9ed8-47a6-a49f-3d7830732250',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/index.tsx:68',message:'contacts index render',data:{status,isLoading,contactsLength:contacts.length,searchQueryLength:searchQuery.length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
  }, [status, isLoading, contacts.length, searchQuery.length])

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

  const columns: Array<ColumnDef<Contact>> = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'full_name',
      header: ({ column }) => {
        return (
          <button
            className="flex items-center gap-2 hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              column.toggleSorting(column.getIsSorted() === 'asc')
            }}
          >
            Name
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="h-4 w-4" />
            ) : (
              <ArrowUpDown className="h-4 w-4 opacity-50" />
            )}
          </button>
        )
      },
      cell: ({ row }) => {
        const contact = row.original
        return (
          <div>
            <div className="font-medium">
              {contact.full_name || 'Unnamed Contact'}
            </div>
            {contact.nickname && (
              <div className="text-sm text-gray-500">{contact.nickname}</div>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'email',
      header: ({ column }) => {
        return (
          <button
            className="flex items-center gap-2 hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              column.toggleSorting(column.getIsSorted() === 'asc')
            }}
          >
            Email
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="h-4 w-4" />
            ) : (
              <ArrowUpDown className="h-4 w-4 opacity-50" />
            )}
          </button>
        )
      },
      cell: ({ row }) => {
        const email = row.original.email
        return email ? (
          <span>{email}</span>
        ) : (
          <span className="text-gray-400">—</span>
        )
      },
    },
    {
      accessorKey: 'birthday',
      header: ({ column }) => {
        return (
          <button
            className="flex items-center gap-2 hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              column.toggleSorting(column.getIsSorted() === 'asc')
            }}
          >
            Birthday
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="h-4 w-4" />
            ) : (
              <ArrowUpDown className="h-4 w-4 opacity-50" />
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
            onClick={(e) => {
              e.stopPropagation()
              column.toggleSorting(column.getIsSorted() === 'asc')
            }}
          >
            Phone
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="h-4 w-4" />
            ) : (
              <ArrowUpDown className="h-4 w-4 opacity-50" />
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
            onClick={(e) => {
              e.stopPropagation()
              column.toggleSorting(column.getIsSorted() === 'asc')
            }}
          >
            Organization
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="h-4 w-4" />
            ) : (
              <ArrowUpDown className="h-4 w-4 opacity-50" />
            )}
          </button>
        )
      },
      cell: ({ row }) => {
        const contact = row.original
        return (
          <div className="hidden lg:block">
            {contact.organization && <div>{contact.organization}</div>}
            {contact.job_title && (
              <div className="text-sm text-gray-500">{contact.job_title}</div>
            )}
          </div>
        )
      },
      meta: {
        className: 'hidden lg:table-cell',
      },
    },
  ]

  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data: contacts,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true,
    getRowId: (row) => row.id,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    globalFilterFn: (row, _columnId, filterValue) => {
      const contact = row.original
      const query = String(filterValue).toLowerCase()
      return !!(
        contact.full_name?.toLowerCase().includes(query) ||
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

  const selectedContactIds = Object.keys(rowSelection).filter(
    (id) => rowSelection[id],
  )

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading contacts...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 gap-4 flex flex-col">
      <div className="flex sm:justify-between sm:items-center flex-col sm:flex-row gap-2">
        <h1 className="text-3xl font-bold">Contacts</h1>
        <div className="flex sm:flex-row flex-col sm:items-center gap-2 w-full sm:w-auto justify-between">
          <DeduplicateButton />
          <Button onClick={() => navigate({ to: '/new' })}>
            <Plus className="w-4 h-4 mr-1" />
            New Contact
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {selectedContactIds.length >= 2 && (
          <div className="border-t pt-4 flex flex-col sm:flex-row sm:justify-end">
            <div className="w-full sm:w-auto">
              <MergeButton
                contactIds={selectedContactIds}
                onMergeSuccess={() => setRowSelection({})}
              />
            </div>
          </div>
        )}
      </div>

      {contacts.length === 0 && !searchQuery ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">
            No contacts yet. Create your first contact!
          </p>
          <Button onClick={() => navigate({ to: '/new' })}>
            <Plus className="w-4 h-4 mr-1" />
            Create Contact
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={header.column.columnDef.meta?.className}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => {
                  const contact = row.original
                  return (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      onClick={() =>
                        navigate({ to: '/$id', params: { id: contact.id } })
                      }
                      className="cursor-pointer"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cell.column.columnDef.meta?.className}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    {searchQuery
                      ? 'No contacts found matching your search.'
                      : 'No contacts yet.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
