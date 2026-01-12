import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getAllContacts, createContact, type Contact } from '../../lib/db'
import { generateVCard, extractUID } from '../../lib/vcard'

export const Route = createFileRoute('/api/contacts')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const contacts = await getAllContacts()
          return json(contacts)
        } catch (error) {
          console.error('Error fetching contacts:', error)
          return json({ error: 'Failed to fetch contacts' }, { status: 500 })
        }
      },
      POST: async ({ request }) => {
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
          const vcardData = generateVCard(contactData)
          const vcardId = extractUID(vcardData) || undefined

          const contact = await createContact({
            ...contactData,
            vcard_id: vcardId,
            vcard_data: vcardData,
          })

          return json(contact, { status: 201 })
        } catch (error) {
          console.error('Error creating contact:', error)
          return json({ error: 'Failed to create contact' }, { status: 500 })
        }
      },
    },
  },
})
