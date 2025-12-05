import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ContactForm } from '../components/ContactForm'
import type { Contact } from '../lib/db'

export const Route = createFileRoute('/new')({
  component: NewContactPage,
})

async function createContact(data: Partial<Contact>): Promise<Contact> {
  const response = await fetch('/api/contacts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error('Failed to create contact')
  }
  return response.json()
}

function NewContactPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: createContact,
    onSuccess: (contact) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      navigate({ to: '/$id', params: { id: contact.id } })
    },
  })

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">New Contact</h1>
      <ContactForm
        onSubmit={async (data) => {
          await mutation.mutateAsync(data)
        }}
        onCancel={() => navigate({ to: '/' })}
      />
    </div>
  )
}
