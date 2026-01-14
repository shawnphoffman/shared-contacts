import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  getContactById,
  updateContact,
  deleteContact,
  type Contact,
} from '../../lib/db'
import { generateVCard, extractUID } from '../../lib/vcard'

export const Route = createFileRoute('/api/contacts/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const contact = await getContactById(params.id)
          if (!contact) {
            return json({ error: 'Contact not found' }, { status: 404 })
          }
          return json(contact)
        } catch (error) {
          console.error('Error fetching contact:', error)
          return json({ error: 'Failed to fetch contact' }, { status: 500 })
        }
      },
      PUT: async ({ params, request }) => {
        try {
          const body = await request.json()
          const contactData: Partial<Contact> = {
            full_name: body.full_name,
            first_name: body.first_name,
            last_name: body.last_name,
            middle_name: body.middle_name,
            nickname: body.nickname,
            maiden_name: body.maiden_name,
            email: body.email,
            phone: body.phone,
            phones: body.phones,
            emails: body.emails,
            organization: body.organization,
            job_title: body.job_title,
            address: body.address,
            addresses: body.addresses,
            birthday: body.birthday ? new Date(body.birthday) : null,
            homepage: body.homepage,
            urls: body.urls,
            notes: body.notes,
          }

          // Generate vCard data
          const existingContact = await getContactById(params.id)
          if (!existingContact) {
            return json({ error: 'Contact not found' }, { status: 404 })
          }

          const vcardData = generateVCard({
            ...existingContact,
            ...contactData,
            phones: contactData.phones || existingContact.phones,
            emails: contactData.emails || existingContact.emails,
            addresses: contactData.addresses || existingContact.addresses,
            urls: contactData.urls || existingContact.urls,
          })
          const vcardId = extractUID(vcardData) || existingContact.vcard_id

          const contact = await updateContact(params.id, {
            ...contactData,
            vcard_id: vcardId,
            vcard_data: vcardData,
            sync_source: 'api',
            last_synced_to_radicale_at: null, // Force sync to Radicale
          })

          return json(contact)
        } catch (error) {
          console.error('Error updating contact:', error)
          return json({ error: 'Failed to update contact' }, { status: 500 })
        }
      },
      DELETE: async ({ params }) => {
        try {
          const contact = await getContactById(params.id)
          if (!contact) {
            return json({ error: 'Contact not found' }, { status: 404 })
          }

          // Delete from database
          await deleteContact(params.id)

          // Note: The sync service will handle deleting the vCard file from Radicale
          // on the next sync cycle (every 5 seconds). For immediate deletion,
          // you could trigger a sync here, but the periodic sync should handle it.

          return json({ message: 'Contact deleted' })
        } catch (error) {
          console.error('Error deleting contact:', error)
          return json({ error: 'Failed to delete contact' }, { status: 500 })
        }
      },
    },
  },
})
