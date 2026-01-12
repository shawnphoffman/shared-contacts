import { Pool, PoolClient } from 'pg'

let pool: Pool | null = null

export function getPool(): Pool {
	if (!pool) {
		const connectionString = process.env.DATABASE_URL
		if (!connectionString) {
			throw new Error('DATABASE_URL environment variable is not set')
		}
		pool = new Pool({
			connectionString,
			max: 20,
			idleTimeoutMillis: 30000,
			connectionTimeoutMillis: 2000,
		})
	}
	return pool
}

export interface ContactField {
	value: string
	type?: string
}

export interface Contact {
	id: string
	vcard_id: string | null
	full_name: string | null
	first_name: string | null
	last_name: string | null
	middle_name: string | null
	nickname: string | null
	maiden_name: string | null
	email: string | null // Deprecated: use emails array
	phone: string | null // Deprecated: use phones array
	phones: ContactField[] | null // Multiple phone numbers
	emails: ContactField[] | null // Multiple emails
	organization: string | null
	job_title: string | null
	address: string | null // Deprecated: use addresses array
	addresses: ContactField[] | null // Multiple addresses
	birthday: Date | null
	homepage: string | null // Deprecated: use urls array
	urls: ContactField[] | null // Multiple URLs
	notes: string | null
	vcard_data: string | null
	created_at: Date
	updated_at: Date
}

export async function getAllContacts(): Promise<Contact[]> {
	const pool = getPool()
	const result = await pool.query('SELECT * FROM contacts ORDER BY updated_at DESC')
	// Parse JSONB fields
	return result.rows.map(row => {
		if (row.phones) row.phones = typeof row.phones === 'string' ? JSON.parse(row.phones) : row.phones
		if (row.emails) row.emails = typeof row.emails === 'string' ? JSON.parse(row.emails) : row.emails
		if (row.addresses) row.addresses = typeof row.addresses === 'string' ? JSON.parse(row.addresses) : row.addresses
		if (row.urls) row.urls = typeof row.urls === 'string' ? JSON.parse(row.urls) : row.urls
		return row
	})
}

export async function getContactByVcardId(vcardId: string): Promise<Contact | null> {
	const pool = getPool()
	const result = await pool.query('SELECT * FROM contacts WHERE vcard_id = $1', [vcardId])
	if (!result.rows[0]) return null
	// Parse JSONB fields
	const row = result.rows[0]
	if (row.phones) row.phones = typeof row.phones === 'string' ? JSON.parse(row.phones) : row.phones
	if (row.emails) row.emails = typeof row.emails === 'string' ? JSON.parse(row.emails) : row.emails
	if (row.addresses) row.addresses = typeof row.addresses === 'string' ? JSON.parse(row.addresses) : row.addresses
	if (row.urls) row.urls = typeof row.urls === 'string' ? JSON.parse(row.urls) : row.urls
	return row
}

export async function createContact(contact: Partial<Contact>): Promise<Contact> {
	const pool = getPool()
	const result = await pool.query(
		`INSERT INTO contacts (vcard_id, full_name, first_name, last_name, middle_name, nickname, maiden_name, email, phone, phones, emails, organization, job_title, address, addresses, birthday, homepage, urls, notes, vcard_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     RETURNING *`,
		[
			contact.vcard_id || null,
			contact.full_name || null,
			contact.first_name || null,
			contact.last_name || null,
			contact.middle_name || null,
			contact.nickname || null,
			contact.maiden_name || null,
			contact.email || null,
			contact.phone || null,
			contact.phones ? JSON.stringify(contact.phones) : '[]',
			contact.emails ? JSON.stringify(contact.emails) : '[]',
			contact.organization || null,
			contact.job_title || null,
			contact.address || null,
			contact.addresses ? JSON.stringify(contact.addresses) : '[]',
			contact.birthday || null,
			contact.homepage || null,
			contact.urls ? JSON.stringify(contact.urls) : '[]',
			contact.notes || null,
			contact.vcard_data || null,
		]
	)
	// Parse JSONB fields
	const row = result.rows[0]
	if (row.phones) row.phones = typeof row.phones === 'string' ? JSON.parse(row.phones) : row.phones
	if (row.emails) row.emails = typeof row.emails === 'string' ? JSON.parse(row.emails) : row.emails
	if (row.addresses) row.addresses = typeof row.addresses === 'string' ? JSON.parse(row.addresses) : row.addresses
	if (row.urls) row.urls = typeof row.urls === 'string' ? JSON.parse(row.urls) : row.urls
	return row
}

export async function updateContact(id: string, contact: Partial<Contact>): Promise<Contact> {
	const pool = getPool()
	const updates: string[] = []
	const values: any[] = []
	let paramIndex = 1

	const fields: (keyof Contact)[] = [
		'vcard_id',
		'full_name',
		'first_name',
		'last_name',
		'middle_name',
		'nickname',
		'maiden_name',
		'email',
		'phone',
		'phones',
		'emails',
		'organization',
		'job_title',
		'address',
		'addresses',
		'birthday',
		'homepage',
		'urls',
		'notes',
		'vcard_data',
	]

	for (const field of fields) {
		if (contact[field] !== undefined) {
			updates.push(`${field} = $${paramIndex}`)
			// Convert arrays to JSON strings for JSONB columns
			if ((field === 'phones' || field === 'emails' || field === 'addresses' || field === 'urls') && Array.isArray(contact[field])) {
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
	const result = await pool.query(`UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`, values)
	// Parse JSONB fields
	const row = result.rows[0]
	if (row.phones) row.phones = typeof row.phones === 'string' ? JSON.parse(row.phones) : row.phones
	if (row.emails) row.emails = typeof row.emails === 'string' ? JSON.parse(row.emails) : row.emails
	if (row.addresses) row.addresses = typeof row.addresses === 'string' ? JSON.parse(row.addresses) : row.addresses
	if (row.urls) row.urls = typeof row.urls === 'string' ? JSON.parse(row.urls) : row.urls
	return row
}

export async function deleteContact(id: string): Promise<void> {
	const pool = getPool()
	await pool.query('DELETE FROM contacts WHERE id = $1', [id])
}

export async function closePool(): Promise<void> {
	if (pool) {
		await pool.end()
		pool = null
	}
}
