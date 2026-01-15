import { createFileRoute, useNavigate, notFound } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ContactForm, type ContactPayload } from '../components/ContactForm'
import {
  formatAddressForDisplay,
  parseAddress,
} from '../components/AddressInput'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import {
  Mail,
  Phone,
  Building,
  MapPin,
  Edit,
  Trash2,
  Globe,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Contact } from '../lib/db'
import { formatPhoneNumber } from '../lib/utils'
import { getContactPhotoUrl } from '../lib/image'

export const Route = createFileRoute('/$id')({
  beforeLoad: ({ params }) => {
    // Exclude "new" from matching this dynamic route
    // This ensures the static /new route takes precedence
    if (params.id === 'new') {
      throw notFound()
    }
  },
  component: ContactDetailPage,
})

async function fetchContact(id: string): Promise<Contact> {
  const response = await fetch(`/api/contacts/${id}`)
  if (!response.ok) {
    throw new Error('Failed to fetch contact')
  }
  return response.json()
}

async function updateContact(
  id: string,
  data: ContactPayload,
): Promise<Contact> {
  const response = await fetch(`/api/contacts/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const errorText = await response.text()
    let errorData
    try {
      errorData = JSON.parse(errorText)
    } catch {
      errorData = { error: errorText }
    }
    throw new Error(errorData.error || 'Failed to update contact')
  }
  return response.json()
}

async function deleteContact(id: string): Promise<void> {
  const response = await fetch(`/api/contacts/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error('Failed to delete contact')
  }
}

function ContactDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showPhoto, setShowPhoto] = useState(true)

  const { data: contact, isLoading } = useQuery({
    queryKey: ['contacts', id],
    queryFn: () => fetchContact(id),
  })

  useEffect(() => {
    if (!contact) {
      return
    }
    setShowPhoto(true)
  }, [contact?.id, contact?.photo_hash, contact?.photo_updated_at])

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Contact>) => updateContact(id, data),
    onSuccess: (updatedContact) => {
      queryClient.setQueryData(['contacts', id], updatedContact)
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['contacts', id] })
      setIsEditing(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      navigate({ to: '/' })
    },
  })

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading contact...</div>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Contact not found</div>
      </div>
    )
  }

  if (isEditing) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <h1 className="text-3xl font-bold mb-6">Edit Contact</h1>
        <ContactForm
          contact={contact}
          onSubmit={async (data) => {
            await updateMutation.mutateAsync(data)
          }}
          onCancel={() => setIsEditing(false)}
        />
      </div>
    )
  }

  const displayName = contact.full_name || 'Unnamed Contact'
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  const fallbackStructuredAddress = {
    street: [contact.address_street, contact.address_extended]
      .filter(Boolean)
      .join(', '),
    city: contact.address_city || '',
    state: contact.address_state || '',
    postal: contact.address_postal || '',
    country: contact.address_country || '',
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-500">
            {showPhoto && (
              <img
                src={getContactPhotoUrl(contact)}
                alt={displayName}
                className="h-full w-full object-cover"
                onError={() => setShowPhoto(false)}
              />
            )}
            {!showPhoto && <span>{initials || '—'}</span>}
          </div>
          <h1 className="text-3xl font-bold">{displayName}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsEditing(true)}>
            <Edit className="w-4 h-4 mr-1" />
            Edit
          </Button>
          <Button
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {((contact.emails && contact.emails.length > 0) || contact.email) && (
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-gray-400" />
              <div className="flex-1">
                <p className="text-sm text-gray-500 mb-1">
                  Email{contact.emails && contact.emails.length > 1 ? 's' : ''}
                </p>
                <div className="space-y-1">
                  {contact.emails && contact.emails.length > 0
                    ? contact.emails.map((email, index) => (
                        <div key={index}>
                          <a
                            href={`mailto:${email.value}`}
                            className="text-blue-600 hover:underline"
                          >
                            {email.value}
                            {email.type && (
                              <span className="text-gray-500 text-xs ml-2">
                                ({email.type})
                              </span>
                            )}
                          </a>
                        </div>
                      ))
                    : contact.email && (
                        <a
                          href={`mailto:${contact.email}`}
                          className="text-blue-600 hover:underline"
                        >
                          {contact.email}
                        </a>
                      )}
                </div>
              </div>
            </div>
          )}
          {((contact.phones && contact.phones.length > 0) || contact.phone) && (
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-gray-400" />
              <div className="flex-1">
                <p className="text-sm text-gray-500 mb-1">
                  Phone{contact.phones && contact.phones.length > 1 ? 's' : ''}
                </p>
                <div className="space-y-1">
                  {contact.phones && contact.phones.length > 0
                    ? contact.phones.map((phone, index) => (
                        <div key={index}>
                          <a
                            href={`tel:${phone.value}`}
                            className="text-blue-600 hover:underline"
                          >
                            {formatPhoneNumber(phone.value)}
                            {phone.type && (
                              <span className="text-gray-500 text-xs ml-2">
                                ({phone.type})
                              </span>
                            )}
                          </a>
                        </div>
                      ))
                    : contact.phone && (
                        <a
                          href={`tel:${contact.phone}`}
                          className="text-blue-600 hover:underline"
                        >
                          {formatPhoneNumber(contact.phone)}
                        </a>
                      )}
                </div>
              </div>
            </div>
          )}
          {contact.organization && (
            <div className="flex items-center gap-3">
              <Building className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Organization</p>
                <p>{contact.organization}</p>
              </div>
            </div>
          )}
          {contact.job_title && (
            <div>
              <p className="text-sm text-gray-500">Job Title</p>
              <p>{contact.job_title}</p>
            </div>
          )}
          {((contact.addresses && contact.addresses.length > 0) ||
            contact.address) && (
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-gray-400" />
              <div className="flex-1">
                <p className="text-sm text-gray-500 mb-1">
                  Address
                  {contact.addresses && contact.addresses.length > 1
                    ? 'es'
                    : ''}
                </p>
                <div className="space-y-1">
                  {contact.addresses && contact.addresses.length > 0
                    ? contact.addresses.map((address, index) => (
                        <div key={index}>
                          <div className="space-y-1">
                            {formatAddressForDisplay(
                              parseAddress(address.value || ''),
                            ).map((line, lineIndex) => (
                              <p key={lineIndex}>{line}</p>
                            ))}
                            {address.type && (
                              <p className="text-gray-500 text-xs">
                                ({address.type})
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    : (() => {
                        const structured = contact.address
                          ? parseAddress(contact.address)
                          : fallbackStructuredAddress
                        const lines = formatAddressForDisplay(structured)
                        return lines.length > 0 ? (
                          <div className="space-y-1">
                            {lines.map((line, lineIndex) => (
                              <p key={lineIndex}>{line}</p>
                            ))}
                          </div>
                        ) : null
                      })()}
                </div>
              </div>
            </div>
          )}
          {((contact.urls && contact.urls.length > 0) || contact.homepage) && (
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-gray-400" />
              <div className="flex-1">
                <p className="text-sm text-gray-500 mb-1">
                  URL{contact.urls && contact.urls.length > 1 ? 's' : ''}
                </p>
                <div className="space-y-1">
                  {contact.urls && contact.urls.length > 0
                    ? contact.urls.map((url, index) => (
                        <div key={index}>
                          <a
                            href={url.value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {url.value}
                            {url.type && (
                              <span className="text-gray-500 text-xs ml-2">
                                ({url.type})
                              </span>
                            )}
                          </a>
                        </div>
                      ))
                    : contact.homepage && (
                        <a
                          href={contact.homepage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {contact.homepage}
                        </a>
                      )}
                </div>
              </div>
            </div>
          )}
          {contact.notes && (
            <div>
              <p className="text-sm text-gray-500 mb-2">Notes</p>
              <p className="whitespace-pre-wrap">{contact.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              {contact.full_name || 'this contact'}? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
