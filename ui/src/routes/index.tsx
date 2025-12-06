import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Edit, Plus, Search } from 'lucide-react'
import { useState } from 'react'
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
import type { ColumnDef } from '@tanstack/react-table'
import type { Contact } from '../lib/db'

export const Route = createFileRoute('/')({
  component: ContactsIndexPage,
})

async function fetchContacts(): Promise<Array<Contact>> {
  const response = await fetch('/api/contacts')
  if (!response.ok) {
    throw new Error('Failed to fetch contacts')
  }
  return response.json()
}

function ContactsIndexPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: fetchContacts,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/contacts/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        throw new Error('Failed to delete contact')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
  })

  const columns: Array<ColumnDef<Contact>> = [
    {
      accessorKey: 'full_name',
      header: 'Name',
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
      header: 'Email',
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
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => {
        const phone = row.original.phone
        return phone ? (
          <span>{phone}</span>
        ) : (
          <span className="text-gray-400">—</span>
        )
      },
    },
    {
      accessorKey: 'organization',
      header: 'Organization',
      cell: ({ row }) => {
        const contact = row.original
        return (
          <div>
            {contact.organization && <div>{contact.organization}</div>}
            {contact.job_title && (
              <div className="text-sm text-gray-500">{contact.job_title}</div>
            )}
          </div>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const contact = row.original
        return (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate({ to: '/$id', params: { id: contact.id } })
              }
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data: contacts,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, columnId, filterValue) => {
      const contact = row.original
      const query = filterValue.toLowerCase()
      return (
        contact.full_name?.toLowerCase().includes(query) ||
        contact.email?.toLowerCase().includes(query) ||
        contact.phone?.includes(query) ||
        contact.organization?.toLowerCase().includes(query) ||
        contact.job_title?.toLowerCase().includes(query)
      )
    },
    state: {
      globalFilter: searchQuery,
    },
  })

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading contacts...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Contacts</h1>
        <Button onClick={() => navigate({ to: '/new' })}>
          <Plus className="w-4 h-4 mr-2" />
          New Contact
        </Button>
      </div>

      <div className="mb-6">
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
      </div>

      {contacts.length === 0 && !searchQuery ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">
            No contacts yet. Create your first contact!
          </p>
          <Button onClick={() => navigate({ to: '/new' })}>
            <Plus className="w-4 h-4 mr-2" />
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
                    <TableHead key={header.id}>
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
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
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
