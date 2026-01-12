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
  phones?: Array<{ value: string; type?: string }> | null
  emails?: Array<{ value: string; type?: string }> | null
  organization?: string | null
  job_title?: string | null
  address?: string | null
  addresses?: Array<{ value: string; type?: string }> | null
  birthday?: Date | string | null
  homepage?: string | null
  urls?: Array<{ value: string; type?: string }> | null
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
  
  // Emails - use arrays if available, fall back to single value
  if (contact.emails && contact.emails.length > 0) {
    for (const email of contact.emails) {
      if (email.value) {
        const type = email.type || 'INTERNET'
        lines.push(`EMAIL;TYPE=${type}:${email.value}`)
      }
    }
  } else if (contact.email) {
    lines.push(`EMAIL;TYPE=INTERNET:${contact.email}`)
  }
  
  // Phones - use arrays if available, fall back to single value
  if (contact.phones && contact.phones.length > 0) {
    for (const phone of contact.phones) {
      if (phone.value) {
        const type = phone.type || 'CELL'
        lines.push(`TEL;TYPE=${type}:${phone.value}`)
      }
    }
  } else if (contact.phone) {
    lines.push(`TEL;TYPE=CELL:${contact.phone}`)
  }
  if (contact.organization) {
    lines.push(`ORG:${contact.organization}`)
  }
  if (contact.job_title) {
    lines.push(`TITLE:${contact.job_title}`)
  }
  // Addresses - use arrays if available, fall back to single value
  if (contact.addresses && contact.addresses.length > 0) {
    for (const address of contact.addresses) {
      if (address.value) {
        const type = address.type || 'HOME'
        lines.push(`ADR;TYPE=${type}:;;${address.value};;;;`)
      }
    }
  } else if (contact.address) {
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
  // URLs - use arrays if available, fall back to single value
  if (contact.urls && contact.urls.length > 0) {
    for (const url of contact.urls) {
      if (url.value) {
        const type = url.type || 'HOME'
        lines.push(`URL;TYPE=${type}:${url.value}`)
      }
    }
  } else if (contact.homepage) {
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
