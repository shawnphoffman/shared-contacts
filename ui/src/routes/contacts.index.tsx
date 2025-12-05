import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ContactCard } from '../components/ContactCard'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import type { Contact } from '../lib/db'

export const Route = createFileRoute('/contacts/')({
  component: ContactsIndexPage,
})

async function fetchContacts(): Promise<Contact[]> {
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

  const filteredContacts = contacts.filter((contact) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      contact.full_name?.toLowerCase().includes(query) ||
      contact.email?.toLowerCase().includes(query) ||
      contact.phone?.includes(query) ||
      contact.organization?.toLowerCase().includes(query)
    )
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
        <Button onClick={() => navigate({ to: '/contacts/new' })}>
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

      {filteredContacts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">
            {searchQuery
              ? 'No contacts found matching your search.'
              : 'No contacts yet. Create your first contact!'}
          </p>
          {!searchQuery && (
            <Button onClick={() => navigate({ to: '/contacts/new' })}>
              <Plus className="w-4 h-4 mr-2" />
              Create Contact
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContacts.map((contact) => (
            <ContactCard key={contact.id} contact={contact} />
          ))}
        </div>
      )}
    </div>
  )
}

