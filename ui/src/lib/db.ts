import { Pool } from 'pg'

let pool: Pool | null = null

export function getPool(): Pool {
	if (!pool) {
		const databaseUrl = process.env.DATABASE_URL
		if (!databaseUrl) {
			throw new Error('DATABASE_URL environment variable is not set')
		}

		// Determine SSL configuration
		// Disable SSL by default for Docker internal connections
		// Only enable if explicitly requested via DATABASE_SSL env var
		// or if the connection string contains sslmode parameter
		const urlHasSSL = databaseUrl.includes('sslmode=')
		const useSSL = process.env.DATABASE_SSL === 'true' || process.env.DATABASE_SSL === '1' || urlHasSSL
		const sslConfig = useSSL
			? {
					rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
				}
			: false

		pool = new Pool({
			connectionString: databaseUrl,
			ssl: sslConfig,
			connectionTimeoutMillis: 2000,
		})
	}
	return pool
}

export interface ContactField {
	value: string
	type?: string
}

export interface AddressBook {
	id: string
	name: string
	slug: string
	is_public: boolean
	created_at: Date
	updated_at: Date
}

export interface Contact {
	id: string
	vcard_id: string | null
	full_name: string | null
	first_name: string | null
	last_name: string | null
	middle_name: string | null
	name_prefix: string | null
	name_suffix: string | null
	nickname: string | null
	maiden_name: string | null
	email: string | null // Deprecated: use emails array
	phone: string | null // Deprecated: use phones array
	phones: Array<ContactField> | null // Multiple phone numbers
	emails: Array<ContactField> | null // Multiple emails
	organization: string | null
	org_units: Array<string> | null
	job_title: string | null
	role: string | null
	address: string | null // Deprecated: use addresses array
	addresses: Array<ContactField> | null // Multiple addresses
	// Structured address fields for easier querying and display
	address_street: string | null
	address_extended: string | null // Deprecated: address line 2 not synced
	address_city: string | null
	address_state: string | null
	address_postal: string | null
	address_country: string | null
	birthday: Date | null
	homepage: string | null // Deprecated: use urls array
	urls: Array<ContactField> | null // Multiple URLs
	categories: Array<string> | null
	labels: Array<ContactField> | null
	logos: Array<ContactField> | null
	sounds: Array<ContactField> | null
	keys: Array<ContactField> | null
	mailer: string | null
	time_zone: string | null
	geo: string | null
	agent: string | null
	prod_id: string | null
	revision: string | null
	sort_string: string | null
	class: string | null
	custom_fields: Array<{ key: string; value: string; params?: Array<string> }> | null
	notes: string | null
	photo_blob: Uint8Array | string | null
	photo_mime: string | null
	photo_width: number | null
	photo_height: number | null
	photo_updated_at: Date | null
	photo_hash: string | null
	vcard_data: string | null
	created_at: Date
	updated_at: Date
	// Sync tracking fields
	last_synced_from_radicale_at: Date | null
	last_synced_to_radicale_at: Date | null
	vcard_hash: string | null
	sync_source: string | null // 'db', 'radicale', 'api', or NULL
	radicale_file_mtime: Date | null
	address_books?: Array<AddressBook> | null
}

async function tableExists(tableName: string): Promise<boolean> {
	const dbPool = getPool()
	const result = await dbPool.query(
		`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = $1
  `,
		[tableName]
	)
	return result.rows.length > 0
}

async function attachAddressBooks(contacts: Array<Contact>): Promise<Array<Contact>> {
	if (contacts.length === 0) return contacts
	const hasAddressBooks = await tableExists('address_books')
	const hasContactAddressBooks = await tableExists('contact_address_books')
	if (!hasAddressBooks || !hasContactAddressBooks) {
		return contacts
	}

	const contactIds = contacts.map(contact => contact.id)
	const dbPool = getPool()
	const result = await dbPool.query(
		`
    SELECT cab.contact_id,
           ab.id,
           ab.name,
           ab.slug,
           ab.is_public,
           ab.created_at,
           ab.updated_at
    FROM contact_address_books cab
    JOIN address_books ab ON ab.id = cab.address_book_id
    WHERE cab.contact_id = ANY($1)
    ORDER BY ab.name
  `,
		[contactIds]
	)

	const byContact = new Map<string, Array<AddressBook>>()
	for (const row of result.rows) {
		const existing = byContact.get(row.contact_id) || []
		existing.push({
			id: row.id,
			name: row.name,
			slug: row.slug,
			is_public: row.is_public,
			created_at: row.created_at,
			updated_at: row.updated_at,
		})
		byContact.set(row.contact_id, existing)
	}

	return contacts.map(contact => ({
		...contact,
		address_books: byContact.get(contact.id) || [],
	}))
}

export async function getAddressBooks(): Promise<Array<AddressBook>> {
	const dbPool = getPool()
	const hasAddressBooks = await tableExists('address_books')
	if (!hasAddressBooks) return []
	const result = await dbPool.query('SELECT * FROM address_books ORDER BY name')
	return result.rows
}

export type AddressBookWithReadonly = AddressBook & { readonly_enabled: boolean }

export async function getAddressBooksWithReadonly(): Promise<Array<AddressBookWithReadonly>> {
	const dbPool = getPool()
	const hasAddressBooks = await tableExists('address_books')
	if (!hasAddressBooks) return []
	const hasReadonly = await tableExists('address_book_readonly')
	if (!hasReadonly) {
		const result = await dbPool.query('SELECT *, false AS readonly_enabled FROM address_books ORDER BY name')
		return result.rows
	}
	const result = await dbPool.query(
		`SELECT b.id, b.name, b.slug, b.is_public, b.created_at, b.updated_at,
    (abor.address_book_id IS NOT NULL) AS readonly_enabled
    FROM address_books b
    LEFT JOIN address_book_readonly abor ON abor.address_book_id = b.id
    ORDER BY b.name`
	)
	return result.rows
}

export async function getAddressBookBySlug(slug: string): Promise<AddressBook | null> {
	const dbPool = getPool()
	const hasAddressBooks = await tableExists('address_books')
	if (!hasAddressBooks) return null
	const result = await dbPool.query('SELECT * FROM address_books WHERE slug = $1', [slug])
	return result.rows[0] || null
}

export async function createAddressBook(addressBook: Pick<AddressBook, 'name' | 'slug' | 'is_public'>): Promise<AddressBook> {
	const dbPool = getPool()
	const result = await dbPool.query(
		`
    INSERT INTO address_books (name, slug, is_public)
    VALUES ($1, $2, $3)
    RETURNING *
  `,
		[addressBook.name, addressBook.slug, addressBook.is_public]
	)
	return result.rows[0]
}

export async function updateAddressBook(
	id: string,
	updates: Partial<Pick<AddressBook, 'name' | 'slug' | 'is_public'>>
): Promise<AddressBook> {
	const dbPool = getPool()
	const fields = ['name', 'slug', 'is_public'] as const
	const setClauses: Array<string> = []
	const values: Array<unknown> = []
	let paramIndex = 1

	for (const field of fields) {
		if (updates[field] !== undefined) {
			setClauses.push(`${field} = $${paramIndex}`)
			values.push(updates[field])
			paramIndex++
		}
	}

	if (setClauses.length === 0) {
		throw new Error('No address book fields to update')
	}

	values.push(id)
	const result = await dbPool.query(
		`UPDATE address_books SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
		values
	)
	return result.rows[0]
}

export async function getAddressBook(id: string): Promise<AddressBook | null> {
	const dbPool = getPool()
	const hasAddressBooks = await tableExists('address_books')
	if (!hasAddressBooks) return null
	const result = await dbPool.query('SELECT * FROM address_books WHERE id = $1', [id])
	return result.rows[0] || null
}

export async function getAddressBookReadonly(addressBookId: string): Promise<{ address_book_id: string; password_hash: string } | null> {
	const dbPool = getPool()
	if (!(await tableExists('address_book_readonly'))) return null
	const result = await dbPool.query('SELECT address_book_id, password_hash FROM address_book_readonly WHERE address_book_id = $1', [
		addressBookId,
	])
	return result.rows[0] || null
}

export async function setAddressBookReadonly(addressBookId: string, passwordHash: string | null): Promise<void> {
	const dbPool = getPool()
	if (!(await tableExists('address_book_readonly'))) return
	if (!passwordHash) {
		await dbPool.query('DELETE FROM address_book_readonly WHERE address_book_id = $1', [addressBookId])
		return
	}
	await dbPool.query(
		`
    INSERT INTO address_book_readonly (address_book_id, password_hash)
    VALUES ($1, $2)
    ON CONFLICT (address_book_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()
  `,
		[addressBookId, passwordHash]
	)
}

export async function getContactAddressBookIds(contactId: string): Promise<Array<string>> {
	const hasContactAddressBooks = await tableExists('contact_address_books')
	if (!hasContactAddressBooks) return []
	const dbPool = getPool()
	const result = await dbPool.query('SELECT address_book_id FROM contact_address_books WHERE contact_id = $1', [contactId])
	return result.rows.map(row => row.address_book_id)
}

export async function setContactAddressBooks(contactId: string, addressBookIds: Array<string> | null | undefined): Promise<void> {
	const hasContactAddressBooks = await tableExists('contact_address_books')
	if (!hasContactAddressBooks) return
	const dbPool = getPool()
	await dbPool.query('DELETE FROM contact_address_books WHERE contact_id = $1', [contactId])
	if (!addressBookIds || addressBookIds.length === 0) {
		return
	}
	await dbPool.query(
		`
    INSERT INTO contact_address_books (contact_id, address_book_id)
    SELECT $1, UNNEST($2::uuid[])
    ON CONFLICT DO NOTHING
  `,
		[contactId, addressBookIds]
	)
}

export async function getUserAddressBookIds(username: string): Promise<Array<string>> {
	const hasUserAddressBooks = await tableExists('user_address_books')
	if (!hasUserAddressBooks) return []
	const dbPool = getPool()
	const result = await dbPool.query('SELECT address_book_id FROM user_address_books WHERE username = $1', [username])
	return result.rows.map(row => row.address_book_id)
}

export async function setUserAddressBooks(username: string, addressBookIds: Array<string>): Promise<void> {
	const hasUserAddressBooks = await tableExists('user_address_books')
	if (!hasUserAddressBooks) return
	const dbPool = getPool()
	await dbPool.query('DELETE FROM user_address_books WHERE username = $1', [username])
	if (addressBookIds.length === 0) return
	await dbPool.query(
		`
    INSERT INTO user_address_books (username, address_book_id)
    SELECT $1, UNNEST($2::uuid[])
    ON CONFLICT DO NOTHING
  `,
		[username, addressBookIds]
	)
}

export async function getAllContacts(): Promise<Array<Contact>> {
	const dbPool = getPool()
	const result = await dbPool.query('SELECT * FROM contacts ORDER BY full_name, created_at DESC')
	// Parse JSONB fields
	const contacts = result.rows.map(row => {
		if (row.phones) row.phones = typeof row.phones === 'string' ? JSON.parse(row.phones) : row.phones
		if (row.emails) row.emails = typeof row.emails === 'string' ? JSON.parse(row.emails) : row.emails
		if (row.addresses) row.addresses = typeof row.addresses === 'string' ? JSON.parse(row.addresses) : row.addresses
		if (row.urls) row.urls = typeof row.urls === 'string' ? JSON.parse(row.urls) : row.urls
		if (row.org_units) row.org_units = typeof row.org_units === 'string' ? JSON.parse(row.org_units) : row.org_units
		if (row.categories) row.categories = typeof row.categories === 'string' ? JSON.parse(row.categories) : row.categories
		if (row.labels) row.labels = typeof row.labels === 'string' ? JSON.parse(row.labels) : row.labels
		if (row.logos) row.logos = typeof row.logos === 'string' ? JSON.parse(row.logos) : row.logos
		if (row.sounds) row.sounds = typeof row.sounds === 'string' ? JSON.parse(row.sounds) : row.sounds
		if (row.keys) row.keys = typeof row.keys === 'string' ? JSON.parse(row.keys) : row.keys
		if (row.custom_fields) row.custom_fields = typeof row.custom_fields === 'string' ? JSON.parse(row.custom_fields) : row.custom_fields
		return row
	})
	return attachAddressBooks(contacts)
}

export async function getContactById(id: string): Promise<Contact | null> {
	const dbPool = getPool()
	const result = await dbPool.query('SELECT * FROM contacts WHERE id = $1', [id])
	if (!result.rows[0]) return null
	// Parse JSONB fields
	const row = result.rows[0]
	if (row.phones) row.phones = typeof row.phones === 'string' ? JSON.parse(row.phones) : row.phones
	if (row.emails) row.emails = typeof row.emails === 'string' ? JSON.parse(row.emails) : row.emails
	if (row.addresses) row.addresses = typeof row.addresses === 'string' ? JSON.parse(row.addresses) : row.addresses
	if (row.urls) row.urls = typeof row.urls === 'string' ? JSON.parse(row.urls) : row.urls
	if (row.org_units) row.org_units = typeof row.org_units === 'string' ? JSON.parse(row.org_units) : row.org_units
	if (row.categories) row.categories = typeof row.categories === 'string' ? JSON.parse(row.categories) : row.categories
	if (row.labels) row.labels = typeof row.labels === 'string' ? JSON.parse(row.labels) : row.labels
	if (row.logos) row.logos = typeof row.logos === 'string' ? JSON.parse(row.logos) : row.logos
	if (row.sounds) row.sounds = typeof row.sounds === 'string' ? JSON.parse(row.sounds) : row.sounds
	if (row.keys) row.keys = typeof row.keys === 'string' ? JSON.parse(row.keys) : row.keys
	if (row.custom_fields) row.custom_fields = typeof row.custom_fields === 'string' ? JSON.parse(row.custom_fields) : row.custom_fields
	const [contactWithBooks] = await attachAddressBooks([row])
	return contactWithBooks
}

export async function getContactByVcardId(vcardId: string): Promise<Contact | null> {
	const dbPool = getPool()
	const result = await dbPool.query('SELECT * FROM contacts WHERE vcard_id = $1', [vcardId])
	if (!result.rows[0]) return null
	const [contactWithBooks] = await attachAddressBooks([result.rows[0]])
	return contactWithBooks
}

/**
 * Find existing contact by email (case-insensitive)
 */
export async function getContactByEmail(email: string): Promise<Contact | null> {
	if (!email) return null
	const dbPool = getPool()
	const result = await dbPool.query('SELECT * FROM contacts WHERE LOWER(email) = LOWER($1) LIMIT 1', [email])
	return result.rows[0] || null
}

/**
 * Find existing contact by name and phone (for duplicate detection)
 */
export async function findDuplicateContact(fullName: string | null, email: string | null, phone: string | null): Promise<Contact | null> {
	const dbPool = getPool()

	// Try email first (most reliable)
	if (email) {
		const byEmail = await getContactByEmail(email)
		if (byEmail) return byEmail
	}

	// Try name + phone combination
	if (fullName && phone) {
		const result = await dbPool.query('SELECT * FROM contacts WHERE LOWER(full_name) = LOWER($1) AND phone = $2 LIMIT 1', [fullName, phone])
		if (result.rows[0]) return result.rows[0]
	}

	// Try just name (if it's a unique name)
	if (fullName && fullName !== 'Unnamed Contact') {
		const result = await dbPool.query('SELECT * FROM contacts WHERE LOWER(full_name) = LOWER($1) LIMIT 1', [fullName])
		if (result.rows[0]) return result.rows[0]
	}

	return null
}

export async function createContact(contact: Partial<Contact>): Promise<Contact> {
	const dbPool = getPool()

	// Check which columns exist in the database
	const columnCheck = await dbPool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'contacts' AND table_schema = 'public'
  `)
	const existingColumns = new Set(columnCheck.rows.map((r: any) => r.column_name))

	const fields: Array<keyof Contact> = [
		'vcard_id',
		'full_name',
		'first_name',
		'last_name',
		'middle_name',
		'name_prefix',
		'name_suffix',
		'nickname',
		'maiden_name',
		'email',
		'phone',
		'phones',
		'emails',
		'organization',
		'org_units',
		'job_title',
		'role',
		'address',
		'addresses',
		'address_street',
		'address_extended',
		'address_city',
		'address_state',
		'address_postal',
		'address_country',
		'birthday',
		'homepage',
		'urls',
		'categories',
		'labels',
		'logos',
		'sounds',
		'keys',
		'mailer',
		'time_zone',
		'geo',
		'agent',
		'prod_id',
		'revision',
		'sort_string',
		'class',
		'custom_fields',
		'notes',
		'photo_blob',
		'photo_mime',
		'photo_width',
		'photo_height',
		'photo_updated_at',
		'photo_hash',
		'vcard_data',
		'sync_source',
		'last_synced_to_radicale_at',
	]

	const columns: Array<string> = []
	const values: Array<any> = []
	const placeholders: Array<string> = []
	let paramIndex = 1

	for (const field of fields) {
		// Skip fields that don't exist in the database
		if (!existingColumns.has(field)) {
			continue
		}

		// Only include field if it's provided in contact data or has a default
		const value = contact[field]
		if (value !== undefined) {
			columns.push(field)
			// Convert arrays to JSON strings for JSONB columns
			if (
				(field === 'phones' ||
					field === 'emails' ||
					field === 'addresses' ||
					field === 'urls' ||
					field === 'org_units' ||
					field === 'categories' ||
					field === 'labels' ||
					field === 'logos' ||
					field === 'sounds' ||
					field === 'keys' ||
					field === 'custom_fields') &&
				Array.isArray(value)
			) {
				values.push(JSON.stringify(value))
			} else {
				values.push(value || null)
			}
			placeholders.push(`$${paramIndex}`)
			paramIndex++
		} else if (
			// Include fields with null defaults if they exist
			field === 'phones' ||
			field === 'emails' ||
			field === 'addresses' ||
			field === 'urls' ||
			field === 'org_units' ||
			field === 'categories' ||
			field === 'labels' ||
			field === 'logos' ||
			field === 'sounds' ||
			field === 'keys' ||
			field === 'custom_fields'
		) {
			// Default empty arrays for JSONB fields
			columns.push(field)
			values.push('[]')
			placeholders.push(`$${paramIndex}`)
			paramIndex++
		}
	}

	if (columns.length === 0) {
		throw new Error('No valid columns to insert')
	}

	const result = await dbPool.query(
		`INSERT INTO contacts (${columns.join(', ')})
     VALUES (${placeholders.join(', ')})
     RETURNING *`,
		values
	)
	// Parse JSONB fields
	const row = result.rows[0]
	if (row.phones) row.phones = typeof row.phones === 'string' ? JSON.parse(row.phones) : row.phones
	if (row.emails) row.emails = typeof row.emails === 'string' ? JSON.parse(row.emails) : row.emails
	if (row.addresses) row.addresses = typeof row.addresses === 'string' ? JSON.parse(row.addresses) : row.addresses
	if (row.urls) row.urls = typeof row.urls === 'string' ? JSON.parse(row.urls) : row.urls
	if (row.org_units) row.org_units = typeof row.org_units === 'string' ? JSON.parse(row.org_units) : row.org_units
	if (row.categories) row.categories = typeof row.categories === 'string' ? JSON.parse(row.categories) : row.categories
	if (row.labels) row.labels = typeof row.labels === 'string' ? JSON.parse(row.labels) : row.labels
	if (row.logos) row.logos = typeof row.logos === 'string' ? JSON.parse(row.logos) : row.logos
	if (row.sounds) row.sounds = typeof row.sounds === 'string' ? JSON.parse(row.sounds) : row.sounds
	if (row.keys) row.keys = typeof row.keys === 'string' ? JSON.parse(row.keys) : row.keys
	if (row.custom_fields) row.custom_fields = typeof row.custom_fields === 'string' ? JSON.parse(row.custom_fields) : row.custom_fields
	return row
}

export async function updateContact(id: string, contact: Partial<Contact>): Promise<Contact> {
	const dbPool = getPool()

	// Check which columns exist in the database
	const columnCheck = await dbPool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'contacts' AND table_schema = 'public'
  `)
	const existingColumns = new Set(columnCheck.rows.map((r: any) => r.column_name))

	const updates: Array<string> = []
	const values: Array<any> = []
	let paramIndex = 1

	const fields: Array<keyof Contact> = [
		'vcard_id',
		'full_name',
		'first_name',
		'last_name',
		'middle_name',
		'name_prefix',
		'name_suffix',
		'nickname',
		'maiden_name',
		'email',
		'phone',
		'phones',
		'emails',
		'organization',
		'org_units',
		'job_title',
		'role',
		'address',
		'addresses',
		'address_street',
		'address_extended',
		'address_city',
		'address_state',
		'address_postal',
		'address_country',
		'birthday',
		'homepage',
		'urls',
		'categories',
		'labels',
		'logos',
		'sounds',
		'keys',
		'mailer',
		'time_zone',
		'geo',
		'agent',
		'prod_id',
		'revision',
		'sort_string',
		'class',
		'custom_fields',
		'notes',
		'photo_blob',
		'photo_mime',
		'photo_width',
		'photo_height',
		'photo_updated_at',
		'photo_hash',
		'vcard_data',
		'sync_source',
		'last_synced_to_radicale_at',
	]

	for (const field of fields) {
		if (contact[field] !== undefined) {
			// Skip fields that don't exist in the database
			if (!existingColumns.has(field)) {
				continue
			}
			updates.push(`${field} = $${paramIndex}`)
			// Convert arrays to JSON strings for JSONB columns
			if (
				(field === 'phones' ||
					field === 'emails' ||
					field === 'addresses' ||
					field === 'urls' ||
					field === 'org_units' ||
					field === 'categories' ||
					field === 'labels' ||
					field === 'logos' ||
					field === 'sounds' ||
					field === 'keys' ||
					field === 'custom_fields') &&
				Array.isArray(contact[field])
			) {
				values.push(JSON.stringify(contact[field]))
			} else {
				values.push(contact[field])
			}
			paramIndex++
		}
	}

	if (updates.length === 0) {
		throw new Error('No fields to update')
	}

	values.push(id)
	const result = await dbPool.query(`UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`, values)
	// Parse JSONB fields
	const row = result.rows[0]
	if (row.phones) row.phones = typeof row.phones === 'string' ? JSON.parse(row.phones) : row.phones
	if (row.emails) row.emails = typeof row.emails === 'string' ? JSON.parse(row.emails) : row.emails
	if (row.addresses) row.addresses = typeof row.addresses === 'string' ? JSON.parse(row.addresses) : row.addresses
	if (row.urls) row.urls = typeof row.urls === 'string' ? JSON.parse(row.urls) : row.urls
	if (row.org_units) row.org_units = typeof row.org_units === 'string' ? JSON.parse(row.org_units) : row.org_units
	if (row.categories) row.categories = typeof row.categories === 'string' ? JSON.parse(row.categories) : row.categories
	if (row.labels) row.labels = typeof row.labels === 'string' ? JSON.parse(row.labels) : row.labels
	if (row.logos) row.logos = typeof row.logos === 'string' ? JSON.parse(row.logos) : row.logos
	if (row.sounds) row.sounds = typeof row.sounds === 'string' ? JSON.parse(row.sounds) : row.sounds
	if (row.keys) row.keys = typeof row.keys === 'string' ? JSON.parse(row.keys) : row.keys
	if (row.custom_fields) row.custom_fields = typeof row.custom_fields === 'string' ? JSON.parse(row.custom_fields) : row.custom_fields
	return row
}

export async function deleteContact(id: string): Promise<void> {
	const dbPool = getPool()
	await dbPool.query('DELETE FROM contacts WHERE id = $1', [id])
}
