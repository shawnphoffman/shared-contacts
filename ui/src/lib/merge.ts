import type { Contact } from './db'

/**
 * Normalize email for comparison
 * - Convert to lowercase
 * - Trim whitespace
 * - Keep as-is for now (could strip +tags in future)
 */
export function normalizeEmail(email: string | null): string | null {
  if (!email) return null
  return email.toLowerCase().trim()
}

/**
 * Normalize phone number for comparison
 * - Remove all non-digit characters
 * - Handle US numbers: if 11 digits starting with 1, remove leading 1
 * - Returns digits only for comparison
 */
export function normalizePhone(phone: string | null): string | null {
  if (!phone) return null
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '')
  
  if (!digits) return null
  
  // Handle US numbers: if 11 digits starting with 1, remove leading 1
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1)
  }
  
  return digits
}

/**
 * Check if two emails match (after normalization)
 */
export function emailsMatch(
  email1: string | null,
  email2: string | null,
): boolean {
  const norm1 = normalizeEmail(email1)
  const norm2 = normalizeEmail(email2)
  
  if (!norm1 || !norm2) return false
  return norm1 === norm2
}

/**
 * Check if two phone numbers match (after normalization)
 */
export function phonesMatch(
  phone1: string | null,
  phone2: string | null,
): boolean {
  const norm1 = normalizePhone(phone1)
  const norm2 = normalizePhone(phone2)
  
  if (!norm1 || !norm2) return false
  return norm1 === norm2
}

/**
 * Merge multiple contacts into one
 * - Sorts contacts by created_at (oldest first)
 * - Primary contact is the oldest
 * - Merges all properties with intelligent deduplication
 */
export function mergeContacts(contacts: Contact[]): Partial<Contact> {
  if (contacts.length === 0) {
    throw new Error('Cannot merge empty contact list')
  }
  
  if (contacts.length === 1) {
    return contacts[0]!
  }
  
  // Sort by created_at (oldest first)
  const sorted = [...contacts].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  
  const primary = sorted[0]!
  const others = sorted.slice(1)
  
  // Collect all emails and phones for deduplication
  const emails: string[] = []
  const phones: string[] = []
  
  // Collect emails (deduplicate by normalization)
  for (const contact of sorted) {
    if (contact.email) {
      const normalized = normalizeEmail(contact.email)
      if (normalized && !emails.some((e) => normalizeEmail(e) === normalized)) {
        emails.push(contact.email)
      }
    }
  }
  
  // Collect phones (deduplicate by normalization)
  for (const contact of sorted) {
    if (contact.phone) {
      const normalized = normalizePhone(contact.phone)
      if (normalized && !phones.some((p) => normalizePhone(p) === normalized)) {
        phones.push(contact.phone)
      }
    }
  }
  
  // Collect notes from all contacts
  const notesParts: string[] = []
  if (primary.notes) {
    notesParts.push(primary.notes)
  }
  for (const contact of others) {
    if (contact.notes) {
      const contactName = contact.full_name || contact.email || 'Unknown Contact'
      notesParts.push(
        `\n\n--- Merged from contact: ${contactName} ---\n\n${contact.notes}`,
      )
    }
  }
  
  // Build merged contact
  const merged: Partial<Contact> = {
    // Keep primary contact's ID and timestamps
    id: primary.id,
    created_at: primary.created_at,
    
    // Email: use first non-null (prefer primary)
    email: emails[0] || primary.email || null,
    
    // Phone: use first non-null (prefer primary)
    phone: phones[0] || primary.phone || null,
    
    // Name fields: prefer primary, fallback to first non-null
    full_name: primary.full_name || sorted.find((c) => c.full_name)?.full_name || null,
    first_name: primary.first_name || sorted.find((c) => c.first_name)?.first_name || null,
    last_name: primary.last_name || sorted.find((c) => c.last_name)?.last_name || null,
    middle_name: primary.middle_name || sorted.find((c) => c.middle_name)?.middle_name || null,
    nickname: primary.nickname || sorted.find((c) => c.nickname)?.nickname || null,
    maiden_name: primary.maiden_name || sorted.find((c) => c.maiden_name)?.maiden_name || null,
    
    // Organization/Job Title: prefer primary, fallback to first non-null
    organization: primary.organization || sorted.find((c) => c.organization)?.organization || null,
    job_title: primary.job_title || sorted.find((c) => c.job_title)?.job_title || null,
    
    // Address: prefer primary, fallback to first non-null
    address: primary.address || sorted.find((c) => c.address)?.address || null,
    
    // Birthday: prefer primary, fallback to first non-null
    birthday: primary.birthday || sorted.find((c) => c.birthday)?.birthday || null,
    
    // Homepage: prefer primary, fallback to first non-null
    homepage: primary.homepage || sorted.find((c) => c.homepage)?.homepage || null,
    
    // Notes: combine all notes
    notes: notesParts.length > 0 ? notesParts.join('') : null,
    
    // vCard fields will be regenerated
    vcard_id: primary.vcard_id,
  }
  
  return merged
}
