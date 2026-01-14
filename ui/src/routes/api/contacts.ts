import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import crypto from 'crypto'
import { getAllContacts, createContact, type Contact } from '../../lib/db'
import { generateVCard, extractUID } from '../../lib/vcard'

const NodeBuffer = (globalThis as { Buffer?: any }).Buffer

type PhotoPayload = {
  photo_data?: string
  photo_mime?: string
  photo_width?: number
  photo_height?: number
  photo_remove?: boolean
}

function sanitizeContact(contact: Contact): Omit<Contact, 'photo_blob'> {
  const { photo_blob, ...rest } = contact
  return rest
}

function decodePhotoPayload(payload: PhotoPayload): {
  photo_blob: Uint8Array | null
  photo_mime: string | null
  photo_width: number | null
  photo_height: number | null
  photo_hash: string | null
  photo_updated_at: Date | null
} {
  if (payload.photo_remove) {
    return {
      photo_blob: null,
      photo_mime: null,
      photo_width: null,
      photo_height: null,
      photo_hash: null,
      photo_updated_at: new Date(),
    }
  }

  if (!payload.photo_data) {
    return {
      photo_blob: null,
      photo_mime: null,
      photo_width: null,
      photo_height: null,
      photo_hash: null,
      photo_updated_at: null,
    }
  }

  const dataUrlMatch = payload.photo_data.match(/^data:(.+);base64,(.*)$/)
  const mime = payload.photo_mime || (dataUrlMatch ? dataUrlMatch[1] : null)
  const base64Data = dataUrlMatch ? dataUrlMatch[2] : payload.photo_data
  if (!NodeBuffer) {
    return {
      photo_blob: null,
      photo_mime: null,
      photo_width: null,
      photo_height: null,
      photo_hash: null,
      photo_updated_at: null,
    }
  }

  const buffer = NodeBuffer.from(base64Data, 'base64')
  const hash = crypto.createHash('sha256').update(buffer).digest('hex')

  return {
    photo_blob: buffer,
    photo_mime: mime,
    photo_width: payload.photo_width ?? null,
    photo_height: payload.photo_height ?? null,
    photo_hash: hash,
    photo_updated_at: new Date(),
  }
}

export const Route = createFileRoute('/api/contacts')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const contacts = await getAllContacts()
          return json(contacts.map(sanitizeContact))
        } catch (error) {
          console.error('Error fetching contacts:', error)
          return json({ error: 'Failed to fetch contacts' }, { status: 500 })
        }
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const photoPayload = body as PhotoPayload
          const photoFields = decodePhotoPayload(photoPayload)

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
            address_street: body.address_street,
            address_extended: body.address_extended,
            address_city: body.address_city,
            address_state: body.address_state,
            address_postal: body.address_postal,
            address_country: body.address_country,
            birthday: body.birthday ? new Date(body.birthday) : null,
            homepage: body.homepage,
            urls: body.urls,
            notes: body.notes,
            ...(photoFields.photo_updated_at
              ? photoFields
              : {
                  photo_blob: undefined,
                  photo_mime: undefined,
                  photo_width: undefined,
                  photo_height: undefined,
                  photo_hash: undefined,
                  photo_updated_at: undefined,
                }),
          }

          // Generate vCard data
          const vcardData = generateVCard(contactData)
          const vcardId = extractUID(vcardData) || undefined

          const contact = await createContact({
            ...contactData,
            vcard_id: vcardId,
            vcard_data: vcardData,
            sync_source: 'api',
            last_synced_to_radicale_at: null, // Force sync to Radicale
          })

          return json(sanitizeContact(contact), { status: 201 })
        } catch (error) {
          console.error('Error creating contact:', error)
          return json({ error: 'Failed to create contact' }, { status: 500 })
        }
      },
    },
  },
})
