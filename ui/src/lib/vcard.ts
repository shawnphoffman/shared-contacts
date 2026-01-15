/**
 * Simple vCard generation utility for the UI
 * Full implementation is in sync-service
 */

function generateUID(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

function foldVCardLine(line: string): string[] {
  const maxLength = 75
  const lines: string[] = []
  let remaining = line

  while (remaining.length > maxLength) {
    lines.push(remaining.slice(0, maxLength))
    remaining = ` ${remaining.slice(maxLength)}`
  }

  lines.push(remaining)
  return lines
}

function normalizePhotoBase64(
  photoBlob: Uint8Array | string | null | undefined,
): string | null {
  if (!photoBlob) return null
  const NodeBuffer = (globalThis as { Buffer?: any }).Buffer
  if (typeof photoBlob === 'string') {
    if (photoBlob.startsWith('\\x')) {
      const hex = photoBlob.slice(2)
      return NodeBuffer ? NodeBuffer.from(hex, 'hex').toString('base64') : null
    }
    return photoBlob
  }
  return NodeBuffer ? NodeBuffer.from(photoBlob).toString('base64') : null
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
  address_street?: string | null
  address_extended?: string | null
  address_city?: string | null
  address_state?: string | null
  address_postal?: string | null
  address_country?: string | null
  birthday?: Date | string | null
  homepage?: string | null
  urls?: Array<{ value: string; type?: string }> | null
  notes?: string | null
  photo_blob?: Uint8Array | string | null
  photo_mime?: string | null
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

  // Photo (base64)
  const photoBase64 = normalizePhotoBase64(contact.photo_blob)
  if (photoBase64) {
    const mime = contact.photo_mime || 'image/jpeg'
    const type = mime.toLowerCase().includes('png') ? 'PNG' : 'JPEG'
    const photoLine = `PHOTO;ENCODING=b;TYPE=${type}:${photoBase64}`
    lines.push(...foldVCardLine(photoLine))
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
  const formatStructuredAddress = () => {
    const street = [contact.address_street, contact.address_extended]
      .filter(Boolean)
      .join(', ')
    const parts = [
      '',
      '',
      street,
      contact.address_city || '',
      contact.address_state || '',
      contact.address_postal || '',
      contact.address_country || '',
    ]
    return parts.join(';')
  }

  const formatAddressValue = (value: string): string => {
    const trimmed = value.trim()
    if (!trimmed) return ''
    if (trimmed.includes(';')) {
      const parts = trimmed.split(';')
      const poBox = parts[0] || ''
      const extended = parts[1] || ''
      if (parts.length >= 8) {
        const street = [parts[2] || '', parts[3] || '']
          .filter(Boolean)
          .join(', ')
        const city = parts[4] || ''
        const state = parts[5] || ''
        const postal = parts[6] || ''
        const country = parts[7] || ''
        return [poBox, '', street, city, state, postal, country].join(';')
      }
      if (parts.length >= 7) {
        const street = [parts[2] || '', extended]
          .filter(Boolean)
          .join(', ')
        const city = parts[3] || ''
        const state = parts[4] || ''
        const postal = parts[5] || ''
        const country = parts[6] || ''
        return [poBox, '', street, city, state, postal, country].join(';')
      }
      return `;;${trimmed};;;;`
    }
    return `;;${trimmed};;;;`
  }

  const hasStructuredAddress =
    contact.address_street ||
    contact.address_extended ||
    contact.address_city ||
    contact.address_state ||
    contact.address_postal ||
    contact.address_country

  // Addresses - use arrays if available, fall back to single value
  if (contact.addresses && contact.addresses.length > 0) {
    for (const address of contact.addresses) {
      if (address.value) {
        const type = address.type || 'HOME'
        const formatted = formatAddressValue(address.value)
        if (formatted) {
          lines.push(`ADR;TYPE=${type}:${formatted}`)
        }
      }
    }
  } else if (hasStructuredAddress) {
    lines.push(`ADR;TYPE=HOME:${formatStructuredAddress()}`)
  } else if (contact.address) {
    const formatted = formatAddressValue(contact.address)
    if (formatted) {
      lines.push(`ADR;TYPE=HOME:${formatted}`)
    }
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
