import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  getPool,
  getAllContacts,
  updateContact,
  deleteContact,
} from '../../lib/db'
import { generateVCard, extractUID } from '../../lib/vcard'
import type { Contact } from '../../lib/db'

/**
 * Merge contact data, preferring non-null values
 */
function mergeContacts(primary: Contact, duplicate: Contact): Partial<Contact> {
  return {
    full_name: primary.full_name || duplicate.full_name,
    first_name: primary.first_name || duplicate.first_name,
    last_name: primary.last_name || duplicate.last_name,
    middle_name: primary.middle_name || duplicate.middle_name,
    nickname: primary.nickname || duplicate.nickname,
    maiden_name: primary.maiden_name || duplicate.maiden_name,
    email: primary.email || duplicate.email,
    phone: primary.phone || duplicate.phone,
    organization: primary.organization || duplicate.organization,
    job_title: primary.job_title || duplicate.job_title,
    address: primary.address || duplicate.address,
    birthday: primary.birthday || duplicate.birthday,
    homepage: primary.homepage || duplicate.homepage,
    notes: primary.notes || duplicate.notes,
  }
}

export const Route = createFileRoute('/api/contacts/deduplicate')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const pool = getPool()
          const allContacts = await getAllContacts()

          // Group contacts by email (case-insensitive)
          const emailGroups = new Map<string, Contact[]>()
          for (const contact of allContacts) {
            if (contact.email) {
              const emailKey = contact.email.toLowerCase().trim()
              if (!emailGroups.has(emailKey)) {
                emailGroups.set(emailKey, [])
              }
              emailGroups.get(emailKey)!.push(contact)
            }
          }

          // Group contacts by name + phone
          const namePhoneGroups = new Map<string, Contact[]>()
          for (const contact of allContacts) {
            if (contact.full_name && contact.phone) {
              const key = `${contact.full_name.toLowerCase().trim()}|${contact.phone.trim()}`
              if (!namePhoneGroups.has(key)) {
                namePhoneGroups.set(key, [])
              }
              namePhoneGroups.get(key)!.push(contact)
            }
          }

          const results = {
            merged: 0,
            deleted: 0,
            errors: [] as Array<{ contact: string; error: string }>,
          }

          // Process email duplicates
          for (const [email, contacts] of emailGroups.entries()) {
            if (contacts.length > 1) {
              // Sort by created_at - keep the oldest one
              contacts.sort(
                (a, b) =>
                  new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime(),
              )

              const primary = contacts[0]!
              const duplicates = contacts.slice(1)

              // Merge all duplicates into primary
              let mergedData = { ...primary }
              for (const duplicate of duplicates) {
                const merged = mergeContacts(mergedData, duplicate)
                mergedData = { ...mergedData, ...merged } as Contact
              }

              // Generate new vCard
              const vcardData = generateVCard(mergedData)
              const vcardId = extractUID(vcardData) || primary.vcard_id

              try {
                // Update primary with merged data
                await updateContact(primary.id, {
                  ...mergedData,
                  vcard_id: vcardId,
                  vcard_data: vcardData,
                })

                // Delete duplicates
                for (const duplicate of duplicates) {
                  await deleteContact(duplicate.id)
                  results.deleted++
                }

                results.merged += duplicates.length
              } catch (error) {
                results.errors.push({
                  contact: primary.full_name || primary.email || 'Unknown',
                  error:
                    error instanceof Error ? error.message : 'Unknown error',
                })
              }
            }
          }

          // Process name+phone duplicates (excluding those already processed by email)
          for (const [key, contacts] of namePhoneGroups.entries()) {
            if (contacts.length > 1) {
              // Filter out contacts that were already processed
              const unprocessed = contacts.filter(
                (c) =>
                  !c.email ||
                  !emailGroups.has(c.email.toLowerCase().trim()) ||
                  emailGroups.get(c.email.toLowerCase().trim())!.length === 1,
              )

              if (unprocessed.length > 1) {
                // Sort by created_at - keep the oldest one
                unprocessed.sort(
                  (a, b) =>
                    new Date(a.created_at).getTime() -
                    new Date(b.created_at).getTime(),
                )

                const primary = unprocessed[0]!
                const duplicates = unprocessed.slice(1)

                // Merge all duplicates into primary
                let mergedData = { ...primary }
                for (const duplicate of duplicates) {
                  const merged = mergeContacts(mergedData, duplicate)
                  mergedData = { ...mergedData, ...merged } as Contact
                }

                // Generate new vCard
                const vcardData = generateVCard(mergedData)
                const vcardId = extractUID(vcardData) || primary.vcard_id

                try {
                  // Update primary with merged data
                  await updateContact(primary.id, {
                    ...mergedData,
                    vcard_id: vcardId,
                    vcard_data: vcardData,
                  })

                  // Delete duplicates
                  for (const duplicate of duplicates) {
                    await deleteContact(duplicate.id)
                    results.deleted++
                  }

                  results.merged += duplicates.length
                } catch (error) {
                  results.errors.push({
                    contact: primary.full_name || 'Unknown',
                    error:
                      error instanceof Error ? error.message : 'Unknown error',
                  })
                }
              }
            }
          }

          return json({
            message: `Merged ${results.merged} duplicate contacts, deleted ${results.deleted} duplicates${results.errors.length > 0 ? `, ${results.errors.length} errors` : ''}`,
            ...results,
          })
        } catch (error) {
          console.error('Error deduplicating contacts:', error)
          return json(
            {
              error: 'Failed to deduplicate contacts',
              details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
