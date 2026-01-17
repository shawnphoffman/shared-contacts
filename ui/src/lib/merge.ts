import type { Contact } from './db'

export interface DuplicateGroup {
	contacts: Array<Contact>
	matchType: 'email' | 'phone' | 'name' | 'fuzzy_name'
	matchReason: string
}

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
export function emailsMatch(email1: string | null, email2: string | null): boolean {
	const norm1 = normalizeEmail(email1)
	const norm2 = normalizeEmail(email2)

	if (!norm1 || !norm2) return false
	return norm1 === norm2
}

/**
 * Check if two phone numbers match (after normalization)
 */
export function phonesMatch(phone1: string | null, phone2: string | null): boolean {
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
export function mergeContacts(contacts: Array<Contact>): Partial<Contact> {
	if (contacts.length === 0) {
		throw new Error('Cannot merge empty contact list')
	}

	if (contacts.length === 1) {
		return contacts[0]
	}

	// Sort by created_at (oldest first)
	const sorted = [...contacts].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

	const primary = sorted[0]
	const others = sorted.slice(1)

	// Collect all emails and phones for deduplication
	const emails: Array<string> = []
	const phones: Array<string> = []

	// Collect emails (deduplicate by normalization)
	for (const contact of sorted) {
		if (contact.email) {
			const normalized = normalizeEmail(contact.email)
			if (normalized && !emails.some(e => normalizeEmail(e) === normalized)) {
				emails.push(contact.email)
			}
		}
	}

	// Collect phones (deduplicate by normalization)
	for (const contact of sorted) {
		if (contact.phone) {
			const normalized = normalizePhone(contact.phone)
			if (normalized && !phones.some(p => normalizePhone(p) === normalized)) {
				phones.push(contact.phone)
			}
		}
	}

	// Collect notes from all contacts
	const notesParts: Array<string> = []
	if (primary.notes) {
		notesParts.push(primary.notes)
	}
	for (const contact of others) {
		if (contact.notes) {
			const contactName = contact.full_name || contact.email || 'Unknown Contact'
			notesParts.push(`\n\n--- Merged from contact: ${contactName} ---\n\n${contact.notes}`)
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
		full_name: primary.full_name || sorted.find(c => c.full_name)?.full_name || null,
		first_name: primary.first_name || sorted.find(c => c.first_name)?.first_name || null,
		last_name: primary.last_name || sorted.find(c => c.last_name)?.last_name || null,
		middle_name: primary.middle_name || sorted.find(c => c.middle_name)?.middle_name || null,
		nickname: primary.nickname || sorted.find(c => c.nickname)?.nickname || null,
		maiden_name: primary.maiden_name || sorted.find(c => c.maiden_name)?.maiden_name || null,

		// Organization/Job Title: prefer primary, fallback to first non-null
		organization: primary.organization || sorted.find(c => c.organization)?.organization || null,
		job_title: primary.job_title || sorted.find(c => c.job_title)?.job_title || null,

		// Address: prefer primary, fallback to first non-null
		address: primary.address || sorted.find(c => c.address)?.address || null,

		// Birthday: prefer primary, fallback to first non-null
		birthday: primary.birthday || sorted.find(c => c.birthday)?.birthday || null,

		// Homepage: prefer primary, fallback to first non-null
		homepage: primary.homepage || sorted.find(c => c.homepage)?.homepage || null,

		// Notes: combine all notes
		notes: notesParts.length > 0 ? notesParts.join('') : null,

		// Photo: preserve primary photo
		photo_blob: primary.photo_blob || null,
		photo_mime: primary.photo_mime || null,
		photo_width: primary.photo_width || null,
		photo_height: primary.photo_height || null,
		photo_updated_at: primary.photo_updated_at || null,
		photo_hash: primary.photo_hash || null,

		// vCard fields will be regenerated
		vcard_id: primary.vcard_id,
	}

	return merged
}

/**
 * Normalize name for comparison
 * - Convert to lowercase
 * - Trim whitespace
 * - Remove extra spaces
 * - Remove common punctuation
 */
export function normalizeName(name: string | null): string | null {
	if (!name) return null
	return name
		.toLowerCase()
		.trim()
		.replace(/\s+/g, ' ') // Replace multiple spaces with single space
		.replace(/[.,]/g, '') // Remove periods and commas
}

/**
 * Get all emails from a contact (from both email field and emails array)
 */
export function getContactEmails(contact: Contact): Array<string> {
	const emails: Array<string> = []

	// Add single email field if present
	if (contact.email) {
		emails.push(contact.email)
	}

	// Add emails from array if present
	if (contact.emails && Array.isArray(contact.emails)) {
		for (const emailField of contact.emails) {
			if (emailField.value) {
				emails.push(emailField.value)
			}
		}
	}

	return emails
}

/**
 * Get all phones from a contact (from both phone field and phones array)
 */
export function getContactPhones(contact: Contact): Array<string> {
	const phones: Array<string> = []

	// Add single phone field if present
	if (contact.phone) {
		phones.push(contact.phone)
	}

	// Add phones from array if present
	if (contact.phones && Array.isArray(contact.phones)) {
		for (const phoneField of contact.phones) {
			if (phoneField.value) {
				phones.push(phoneField.value)
			}
		}
	}

	return phones
}

/**
 * Check if two names match exactly (after normalization)
 */
export function namesMatch(name1: string | null, name2: string | null): boolean {
	const norm1 = normalizeName(name1)
	const norm2 = normalizeName(name2)

	if (!norm1 || !norm2) return false
	return norm1 === norm2
}

/**
 * Common name variations mapping
 */
const NAME_VARIATIONS: Record<string, Array<string>> = {
	robert: ['bob', 'rob', 'robby'],
	william: ['bill', 'will', 'billy'],
	richard: ['rick', 'dick', 'rich'],
	james: ['jim', 'jimmy'],
	john: ['jack', 'johnny'],
	joseph: ['joe', 'joey'],
	michael: ['mike', 'mikey'],
	thomas: ['tom', 'tommy'],
	christopher: ['chris'],
	daniel: ['dan', 'danny'],
	matthew: ['matt'],
	anthony: ['tony'],
	andrew: ['andy', 'drew'],
	edward: ['ed', 'eddie'],
	elizabeth: ['liz', 'beth', 'lizzy'],
	jennifer: ['jen', 'jenny'],
	patricia: ['pat', 'patti'],
	margaret: ['maggie', 'peg'],
	susan: ['sue', 'suzie'],
}

/**
 * Check if two names match with fuzzy logic
 * Handles initials, common variations, and similar names
 */
export function namesFuzzyMatch(name1: string | null, name2: string | null): boolean {
	const norm1 = normalizeName(name1)
	const norm2 = normalizeName(name2)

	if (!norm1 || !norm2) return false

	// Exact match after normalization
	if (norm1 === norm2) return true

	// Split into words
	const words1 = norm1.split(/\s+/).filter(w => w.length > 0)
	const words2 = norm2.split(/\s+/).filter(w => w.length > 0)

	if (words1.length === 0 || words2.length === 0) return false

	// Check if all significant words match (ignoring single letters/initials)
	const significant1 = words1.filter(w => w.length > 1)
	const significant2 = words2.filter(w => w.length > 1)

	// If both have significant words, check if they match
	if (significant1.length > 0 && significant2.length > 0) {
		// Check if first and last names match (common pattern)
		if (significant1.length >= 2 && significant2.length >= 2) {
			const first1 = significant1[0]
			const last1 = significant1[significant1.length - 1]
			const first2 = significant2[0]
			const last2 = significant2[significant2.length - 1]

			// Check name variations
			const checkVariation = (n1: string, n2: string): boolean => {
				if (n1 === n2) return true
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				const variations = NAME_VARIATIONS[n1] || []
				if (variations.includes(n2)) return true
				// Check reverse
				for (const [key, values] of Object.entries(NAME_VARIATIONS)) {
					if (values.includes(n1) && key === n2) return true
				}
				return false
			}

			if (checkVariation(first1, first2) && last1 === last2) return true
			if (first1 === first2 && checkVariation(last1, last2)) return true
		}

		// Check if one name is a subset of the other (e.g., "John A. Smith" vs "John Smith")
		const allWords1 = new Set(words1)
		const allWords2 = new Set(words2)

		// Check if all significant words from one are in the other
		const allIn1 = significant2.every(w => {
			if (allWords1.has(w)) return true
			// Check variations
			for (const [key, values] of Object.entries(NAME_VARIATIONS)) {
				if (allWords1.has(key) && values.includes(w)) return true
				if (values.includes(w) && allWords1.has(key)) return true
			}
			return false
		})

		const allIn2 = significant1.every(w => {
			if (allWords2.has(w)) return true
			// Check variations
			for (const [key, values] of Object.entries(NAME_VARIATIONS)) {
				if (allWords2.has(key) && values.includes(w)) return true
				if (values.includes(w) && allWords2.has(key)) return true
			}
			return false
		})

		if (allIn1 || allIn2) return true
	}

	// Simple string similarity for other cases (Levenshtein-like check)
	// If names are very similar (differ by 1-2 characters), consider them matches
	if (Math.abs(norm1.length - norm2.length) <= 2) {
		let differences = 0
		const maxLen = Math.max(norm1.length, norm2.length)
		const minLen = Math.min(norm1.length, norm2.length)

		// Quick check: if length difference is small and most characters match
		if (minLen >= 3) {
			for (let i = 0; i < minLen; i++) {
				if (norm1[i] !== norm2[i]) differences++
			}
			// Allow up to 2 character differences for short names, or 10% for longer names
			const maxDiff = Math.max(2, Math.floor(maxLen * 0.1))
			if (differences <= maxDiff) return true
		}
	}

	return false
}

/**
 * Detect duplicate contacts and group them
 * Returns groups of contacts that are potential duplicates
 */
export function detectDuplicates(contacts: Array<Contact>): Array<DuplicateGroup> {
	const groups: Array<DuplicateGroup> = []
	const processed = new Set<string>() // Track contacts that have been grouped

	// 1. Group by email (case-insensitive)
	const emailGroups = new Map<string, Array<Contact>>()
	for (const contact of contacts) {
		const emails = getContactEmails(contact)
		for (const email of emails) {
			const normalized = normalizeEmail(email)
			if (normalized) {
				if (!emailGroups.has(normalized)) {
					emailGroups.set(normalized, [])
				}
				emailGroups.get(normalized)!.push(contact)
			}
		}
	}

	for (const [email, groupContacts] of emailGroups.entries()) {
		if (groupContacts.length > 1) {
			// Deduplicate contacts in group
			const uniqueContacts = Array.from(new Map(groupContacts.map(c => [c.id, c])).values())
			if (uniqueContacts.length > 1) {
				groups.push({
					contacts: uniqueContacts,
					matchType: 'email',
					matchReason: `Same email: ${email}`,
				})
				uniqueContacts.forEach(c => processed.add(c.id))
			}
		}
	}

	// 2. Group by phone (normalized)
	const phoneGroups = new Map<string, Array<Contact>>()
	for (const contact of contacts) {
		// Skip if already processed
		if (processed.has(contact.id)) continue

		const phones = getContactPhones(contact)
		for (const phone of phones) {
			const normalized = normalizePhone(phone)
			if (normalized) {
				if (!phoneGroups.has(normalized)) {
					phoneGroups.set(normalized, [])
				}
				phoneGroups.get(normalized)!.push(contact)
			}
		}
	}

	for (const [phone, groupContacts] of phoneGroups.entries()) {
		if (groupContacts.length > 1) {
			// Deduplicate contacts in group
			const uniqueContacts = Array.from(new Map(groupContacts.map(c => [c.id, c])).values())
			if (uniqueContacts.length > 1) {
				groups.push({
					contacts: uniqueContacts,
					matchType: 'phone',
					matchReason: `Same phone: ${phone}`,
				})
				uniqueContacts.forEach(c => processed.add(c.id))
			}
		}
	}

	// 3. Group by exact name match
	const nameGroups = new Map<string, Array<Contact>>()
	for (const contact of contacts) {
		// Skip if already processed
		if (processed.has(contact.id)) continue

		const name = contact.full_name || (contact.first_name && contact.last_name ? `${contact.first_name} ${contact.last_name}` : null)

		if (name) {
			const normalized = normalizeName(name)
			if (normalized) {
				if (!nameGroups.has(normalized)) {
					nameGroups.set(normalized, [])
				}
				nameGroups.get(normalized)!.push(contact)
			}
		}
	}

	for (const [name, groupContacts] of nameGroups.entries()) {
		if (groupContacts.length > 1) {
			// Deduplicate contacts in group
			const uniqueContacts = Array.from(new Map(groupContacts.map(c => [c.id, c])).values())
			if (uniqueContacts.length > 1) {
				groups.push({
					contacts: uniqueContacts,
					matchType: 'name',
					matchReason: `Same name: ${name}`,
				})
				uniqueContacts.forEach(c => processed.add(c.id))
			}
		}
	}

	// 4. Group by fuzzy name match
	const fuzzyGroups: Array<Array<Contact>> = []
	const fuzzyProcessed = new Set<string>()

	for (let i = 0; i < contacts.length; i++) {
		const contact1 = contacts[i]
		if (processed.has(contact1.id) || fuzzyProcessed.has(contact1.id)) continue

		const name1 = contact1.full_name || (contact1.first_name && contact1.last_name ? `${contact1.first_name} ${contact1.last_name}` : null)

		if (!name1) continue

		const fuzzyGroup = [contact1]

		for (let j = i + 1; j < contacts.length; j++) {
			const contact2 = contacts[j]
			if (processed.has(contact2.id) || fuzzyProcessed.has(contact2.id)) continue

			const name2 =
				contact2.full_name || (contact2.first_name && contact2.last_name ? `${contact2.first_name} ${contact2.last_name}` : null)

			if (!name2) continue

			if (namesFuzzyMatch(name1, name2)) {
				fuzzyGroup.push(contact2)
				fuzzyProcessed.add(contact2.id)
			}
		}

		if (fuzzyGroup.length > 1) {
			fuzzyGroups.push(fuzzyGroup)
			fuzzyGroup.forEach(c => fuzzyProcessed.add(c.id))
		}
	}

	for (const groupContacts of fuzzyGroups) {
		// Deduplicate contacts in group
		const uniqueContacts = Array.from(new Map(groupContacts.map(c => [c.id, c])).values())
		if (uniqueContacts.length > 1) {
			const name1 =
				uniqueContacts[0].full_name ||
				(uniqueContacts[0].first_name && uniqueContacts[0].last_name
					? `${uniqueContacts[0].first_name} ${uniqueContacts[0].last_name}`
					: 'Unknown')
			groups.push({
				contacts: uniqueContacts,
				matchType: 'fuzzy_name',
				matchReason: `Similar names: ${name1} and ${uniqueContacts.length - 1} other(s)`,
			})
		}
	}

	return groups
}
