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

function normalizeVCardText(value: string): string {
	return value.replace(/\r\n|\r|\n/g, '\\n')
}

function normalizePhotoBase64(photoBlob: Uint8Array | string | null | undefined): string | null {
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
	name_prefix?: string | null
	name_suffix?: string | null
	nickname?: string | null
	maiden_name?: string | null
	email?: string | null
	phone?: string | null
	phones?: Array<{ value: string; type?: string }> | null
	emails?: Array<{ value: string; type?: string }> | null
	organization?: string | null
	org_units?: string[] | null
	job_title?: string | null
	role?: string | null
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
	categories?: string[] | null
	labels?: Array<{ value: string; type?: string }> | null
	logos?: Array<{ value: string; type?: string }> | null
	sounds?: Array<{ value: string; type?: string }> | null
	keys?: Array<{ value: string; type?: string }> | null
	mailer?: string | null
	time_zone?: string | null
	geo?: string | null
	agent?: string | null
	prod_id?: string | null
	revision?: string | null
	sort_string?: string | null
	class?: string | null
	custom_fields?: Array<{ key: string; value: string; params?: string[] }> | null
	notes?: string | null
	photo_blob?: Uint8Array | string | null
	photo_mime?: string | null
}): string {
	const uid = contact.vcard_id || generateUID()
	const fullName = contact.full_name || 'Unknown'
	const firstName = contact.first_name || ''
	const middleName = contact.middle_name || ''
	const lastName = contact.last_name || ''
	const namePrefix = contact.name_prefix || ''
	const nameSuffix = contact.name_suffix || ''

	// vCard N format: Last;First;Middle;Prefix;Suffix
	const lines: string[] = [
		'BEGIN:VCARD',
		'VERSION:3.0',
		`UID:${uid}`,
		`FN:${fullName}`,
		`N:${lastName};${firstName};${middleName};${namePrefix};${nameSuffix}`,
	]

	if (contact.nickname) {
		lines.push(`NICKNAME:${contact.nickname}`)
	}

	if (contact.sort_string) {
		lines.push(`SORT-STRING:${contact.sort_string}`)
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
	if (contact.organization || (contact.org_units && contact.org_units.length > 0)) {
		const units = contact.org_units?.filter(Boolean) || []
		const orgParts = [contact.organization || '', ...units]
		lines.push(`ORG:${orgParts.join(';')}`)
	}
	if (contact.job_title) {
		lines.push(`TITLE:${contact.job_title}`)
	}
	if (contact.role) {
		lines.push(`ROLE:${contact.role}`)
	}
	if (contact.mailer) {
		lines.push(`MAILER:${contact.mailer}`)
	}
	if (contact.time_zone) {
		lines.push(`TZ:${contact.time_zone}`)
	}
	if (contact.geo) {
		lines.push(`GEO:${contact.geo}`)
	}
	if (contact.agent) {
		lines.push(...foldVCardLine(`AGENT:${normalizeVCardText(contact.agent)}`))
	}
	if (contact.prod_id) {
		lines.push(`PRODID:${contact.prod_id}`)
	}
	if (contact.revision) {
		lines.push(`REV:${contact.revision}`)
	}
	if (contact.class) {
		lines.push(`CLASS:${contact.class}`)
	}
	const formatStructuredAddress = () => {
		const street = [contact.address_street, contact.address_extended].filter(Boolean).join(', ')
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
				const street = [parts[2] || '', parts[3] || ''].filter(Boolean).join(', ')
				const city = parts[4] || ''
				const state = parts[5] || ''
				const postal = parts[6] || ''
				const country = parts[7] || ''
				return [poBox, '', street, city, state, postal, country].join(';')
			}
			if (parts.length >= 7) {
				const street = [parts[2] || '', extended].filter(Boolean).join(', ')
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

	if (contact.categories && contact.categories.length > 0) {
		const categories = contact.categories.map(entry => entry.trim()).filter(Boolean)
		if (categories.length > 0) {
			lines.push(`CATEGORIES:${categories.join(',')}`)
		}
	}

	if (contact.labels && contact.labels.length > 0) {
		for (const label of contact.labels) {
			if (label.value) {
				const type = label.type ? `;TYPE=${label.type}` : ''
				lines.push(...foldVCardLine(`LABEL${type}:${normalizeVCardText(label.value)}`))
			}
		}
	}

	if (contact.logos && contact.logos.length > 0) {
		for (const logo of contact.logos) {
			if (logo.value) {
				const type = logo.type ? `;TYPE=${logo.type}` : ''
				lines.push(...foldVCardLine(`LOGO${type}:${normalizeVCardText(logo.value)}`))
			}
		}
	}

	if (contact.sounds && contact.sounds.length > 0) {
		for (const sound of contact.sounds) {
			if (sound.value) {
				const type = sound.type ? `;TYPE=${sound.type}` : ''
				lines.push(...foldVCardLine(`SOUND${type}:${normalizeVCardText(sound.value)}`))
			}
		}
	}

	if (contact.keys && contact.keys.length > 0) {
		for (const key of contact.keys) {
			if (key.value) {
				const type = key.type ? `;TYPE=${key.type}` : ''
				lines.push(...foldVCardLine(`KEY${type}:${normalizeVCardText(key.value)}`))
			}
		}
	}
	if (contact.maiden_name) {
		// Maiden name can be added to notes or as a custom field
		const existingNotes = contact.notes || ''
		const maidenNote = `Maiden name: ${contact.maiden_name}`
		const noteValue = existingNotes ? `${existingNotes}\n${maidenNote}` : maidenNote
		const normalizedNote = normalizeVCardText(noteValue)
		lines.push(...foldVCardLine(`NOTE:${normalizedNote}`))
	} else if (contact.notes) {
		const normalizedNote = normalizeVCardText(contact.notes)
		lines.push(...foldVCardLine(`NOTE:${normalizedNote}`))
	}

	if (contact.custom_fields && contact.custom_fields.length > 0) {
		for (const customField of contact.custom_fields) {
			if (!customField.key || !customField.value) continue
			const params = customField.params?.length ? `;${customField.params.join(';')}` : ''
			lines.push(...foldVCardLine(`${customField.key}${params}:${normalizeVCardText(customField.value)}`))
		}
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
