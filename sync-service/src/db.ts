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
	name_prefix: string | null
	name_suffix: string | null
	nickname: string | null
	maiden_name: string | null
	email: string | null // Deprecated: use emails array
	phone: string | null // Deprecated: use phones array
	phones: ContactField[] | null // Multiple phone numbers
	emails: ContactField[] | null // Multiple emails
	organization: string | null
	org_units: string[] | null
	job_title: string | null
	role: string | null
	address: string | null // Deprecated: use addresses array
	addresses: ContactField[] | null // Multiple addresses
	birthday: Date | null
	homepage: string | null // Deprecated: use urls array
	urls: ContactField[] | null // Multiple URLs
	categories: string[] | null
	labels: ContactField[] | null
	logos: ContactField[] | null
	sounds: ContactField[] | null
	keys: ContactField[] | null
	mailer: string | null
	time_zone: string | null
	geo: string | null
	agent: string | null
	prod_id: string | null
	revision: string | null
	sort_string: string | null
	class: string | null
	custom_fields: Array<{ key: string; value: string; params?: string[] }> | null
	notes: string | null
	photo_blob: Buffer | null
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
		if (row.org_units) row.org_units = typeof row.org_units === 'string' ? JSON.parse(row.org_units) : row.org_units
		if (row.categories) row.categories = typeof row.categories === 'string' ? JSON.parse(row.categories) : row.categories
		if (row.labels) row.labels = typeof row.labels === 'string' ? JSON.parse(row.labels) : row.labels
		if (row.logos) row.logos = typeof row.logos === 'string' ? JSON.parse(row.logos) : row.logos
		if (row.sounds) row.sounds = typeof row.sounds === 'string' ? JSON.parse(row.sounds) : row.sounds
		if (row.keys) row.keys = typeof row.keys === 'string' ? JSON.parse(row.keys) : row.keys
		if (row.custom_fields) row.custom_fields = typeof row.custom_fields === 'string' ? JSON.parse(row.custom_fields) : row.custom_fields
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
	if (row.org_units) row.org_units = typeof row.org_units === 'string' ? JSON.parse(row.org_units) : row.org_units
	if (row.categories) row.categories = typeof row.categories === 'string' ? JSON.parse(row.categories) : row.categories
	if (row.labels) row.labels = typeof row.labels === 'string' ? JSON.parse(row.labels) : row.labels
	if (row.logos) row.logos = typeof row.logos === 'string' ? JSON.parse(row.logos) : row.logos
	if (row.sounds) row.sounds = typeof row.sounds === 'string' ? JSON.parse(row.sounds) : row.sounds
	if (row.keys) row.keys = typeof row.keys === 'string' ? JSON.parse(row.keys) : row.keys
	if (row.custom_fields) row.custom_fields = typeof row.custom_fields === 'string' ? JSON.parse(row.custom_fields) : row.custom_fields
	return row
}

export async function createContact(contact: Partial<Contact>): Promise<Contact> {
	const pool = getPool()
	const result = await pool.query(
		`INSERT INTO contacts (vcard_id, full_name, first_name, last_name, middle_name, name_prefix, name_suffix, nickname, maiden_name, email, phone, phones, emails, organization, org_units, job_title, role, address, addresses, birthday, homepage, urls, categories, labels, logos, sounds, keys, mailer, time_zone, geo, agent, prod_id, revision, sort_string, class, custom_fields, notes, photo_blob, photo_mime, photo_width, photo_height, photo_updated_at, photo_hash, vcard_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44)
     RETURNING *`,
		[
			contact.vcard_id || null,
			contact.full_name || null,
			contact.first_name || null,
			contact.last_name || null,
			contact.middle_name || null,
			contact.name_prefix || null,
			contact.name_suffix || null,
			contact.nickname || null,
			contact.maiden_name || null,
			contact.email || null,
			contact.phone || null,
			contact.phones ? JSON.stringify(contact.phones) : '[]',
			contact.emails ? JSON.stringify(contact.emails) : '[]',
			contact.organization || null,
			contact.org_units ? JSON.stringify(contact.org_units) : '[]',
			contact.job_title || null,
			contact.role || null,
			contact.address || null,
			contact.addresses ? JSON.stringify(contact.addresses) : '[]',
			contact.birthday || null,
			contact.homepage || null,
			contact.urls ? JSON.stringify(contact.urls) : '[]',
			contact.categories ? JSON.stringify(contact.categories) : '[]',
			contact.labels ? JSON.stringify(contact.labels) : '[]',
			contact.logos ? JSON.stringify(contact.logos) : '[]',
			contact.sounds ? JSON.stringify(contact.sounds) : '[]',
			contact.keys ? JSON.stringify(contact.keys) : '[]',
			contact.mailer || null,
			contact.time_zone || null,
			contact.geo || null,
			contact.agent || null,
			contact.prod_id || null,
			contact.revision || null,
			contact.sort_string || null,
			contact.class || null,
			contact.custom_fields ? JSON.stringify(contact.custom_fields) : '[]',
			contact.notes || null,
			contact.photo_blob || null,
			contact.photo_mime || null,
			contact.photo_width || null,
			contact.photo_height || null,
			contact.photo_updated_at || null,
			contact.photo_hash || null,
			contact.vcard_data || null,
		]
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
	]

	for (const field of fields) {
		if (contact[field] !== undefined) {
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
	const result = await pool.query(`UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`, values)
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
	const pool = getPool()
	await pool.query('DELETE FROM contacts WHERE id = $1', [id])
}

export interface SyncMetadata {
	last_synced_from_radicale_at?: Date | null
	last_synced_to_radicale_at?: Date | null
	vcard_hash?: string | null
	sync_source?: string | null
	radicale_file_mtime?: Date | null
}

/**
 * Update sync metadata for a contact
 */
export async function updateSyncMetadata(id: string, metadata: SyncMetadata): Promise<void> {
	const pool = getPool()
	const updates: string[] = []
	const values: any[] = []
	let paramIndex = 1

	if (metadata.last_synced_from_radicale_at !== undefined) {
		updates.push(`last_synced_from_radicale_at = $${paramIndex}`)
		values.push(metadata.last_synced_from_radicale_at)
		paramIndex++
	}

	if (metadata.last_synced_to_radicale_at !== undefined) {
		updates.push(`last_synced_to_radicale_at = $${paramIndex}`)
		values.push(metadata.last_synced_to_radicale_at)
		paramIndex++
	}

	if (metadata.vcard_hash !== undefined) {
		updates.push(`vcard_hash = $${paramIndex}`)
		values.push(metadata.vcard_hash)
		paramIndex++
	}

	if (metadata.sync_source !== undefined) {
		updates.push(`sync_source = $${paramIndex}`)
		values.push(metadata.sync_source)
		paramIndex++
	}

	if (metadata.radicale_file_mtime !== undefined) {
		updates.push(`radicale_file_mtime = $${paramIndex}`)
		values.push(metadata.radicale_file_mtime)
		paramIndex++
	}

	if (updates.length === 0) {
		return // No updates to make
	}

	values.push(id)
	await pool.query(`UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values)
}

/**
 * Get contacts that need to be synced to Radicale
 * A contact needs syncing if:
 * - updated_at > last_synced_to_radicale_at (DB was modified after last sync)
 * - OR sync_source != 'radicale' (change didn't come from Radicale)
 * - OR last_synced_to_radicale_at IS NULL (never synced)
 */
export async function getContactsNeedingRadicaleSync(): Promise<Contact[]> {
	const pool = getPool()
	const result = await pool.query(
		`SELECT * FROM contacts
		WHERE vcard_id IS NOT NULL
		AND (
			updated_at > COALESCE(last_synced_to_radicale_at, '1970-01-01'::timestamp)
			OR sync_source != 'radicale'
			OR last_synced_to_radicale_at IS NULL
		)
		ORDER BY updated_at DESC`
	)
	// Parse JSONB fields
	return result.rows.map(row => {
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
}

/**
 * Get sync metadata for a contact
 */
export async function getContactSyncMetadata(id: string): Promise<{
	last_synced_from_radicale_at: Date | null
	last_synced_to_radicale_at: Date | null
	vcard_hash: string | null
	sync_source: string | null
	radicale_file_mtime: Date | null
	updated_at: Date
} | null> {
	const pool = getPool()
	const result = await pool.query(
		`SELECT last_synced_from_radicale_at, last_synced_to_radicale_at, vcard_hash, sync_source, radicale_file_mtime, updated_at
		FROM contacts WHERE id = $1`,
		[id]
	)
	return result.rows[0] || null
}

export async function closePool(): Promise<void> {
	if (pool) {
		await pool.end()
		pool = null
	}
}
