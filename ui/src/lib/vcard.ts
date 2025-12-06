/**
 * Simple vCard generation utility for the UI
 * Full implementation is in sync-service
 */

function generateUID(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

export function generateVCard(contact: {
  vcard_id?: string | null
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  middle_name?: string | null
  nickname?: string | null
  maiden_name?: string | null
  email?: string | null
  phone?: string | null
  organization?: string | null
  job_title?: string | null
  address?: string | null
  birthday?: Date | string | null
  homepage?: string | null
  notes?: string | null
}): string {
  const uid = contact.vcard_id || generateUID()
  const fullName = contact.full_name || 'Unknown'
  const firstName = contact.first_name || ''
  const middleName = contact.middle_name || ''
  const lastName = contact.last_name || ''

  // vCard N format: Last;First;Middle;Prefix;Suffix
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:${uid}`,
    `FN:${fullName}`,
    `N:${lastName};${firstName};${middleName};;`,
  ]

  if (contact.nickname) {
    lines.push(`NICKNAME:${contact.nickname}`)
  }
  if (contact.email) {
    lines.push(`EMAIL;TYPE=INTERNET:${contact.email}`)
  }
  if (contact.phone) {
    lines.push(`TEL;TYPE=CELL:${contact.phone}`)
  }
  if (contact.organization) {
    lines.push(`ORG:${contact.organization}`)
  }
  if (contact.job_title) {
    lines.push(`TITLE:${contact.job_title}`)
  }
  if (contact.address) {
    lines.push(`ADR;TYPE=HOME:;;${contact.address};;;;`)
  }
  if (contact.birthday) {
    // vCard BDAY format: YYYYMMDD or YYYY-MM-DD
    let bdayStr: string
    if (contact.birthday instanceof Date) {
      const year = contact.birthday.getFullYear()
      const month = String(contact.birthday.getMonth() + 1).padStart(2, '0')
      const day = String(contact.birthday.getDate()).padStart(2, '0')
      bdayStr = `${year}${month}${day}`
    } else if (typeof contact.birthday === 'string') {
      // Handle string dates (YYYY-MM-DD format)
      bdayStr = contact.birthday.replace(/-/g, '')
    } else {
      bdayStr = String(contact.birthday)
    }
    lines.push(`BDAY:${bdayStr}`)
  }
  if (contact.homepage) {
    lines.push(`URL:${contact.homepage}`)
  }
  if (contact.maiden_name) {
    // Maiden name can be added to notes or as a custom field
    const existingNotes = contact.notes || ''
    const maidenNote = `Maiden name: ${contact.maiden_name}`
    lines.push(
      `NOTE:${existingNotes ? `${existingNotes}\n${maidenNote}` : maidenNote}`,
    )
  } else if (contact.notes) {
    lines.push(`NOTE:${contact.notes}`)
  }

  lines.push('END:VCARD')
  return lines.join('\r\n')
}

/**
 * Extract UID from vCard string
 */
export function extractUID(vcardString: string): string | null {
  const uidMatch = vcardString.match(/^UID:(.+)$/m)
  return uidMatch ? uidMatch[1].trim() : null
}
