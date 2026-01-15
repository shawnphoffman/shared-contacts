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
    const useSSL =
      process.env.DATABASE_SSL === 'true' ||
      process.env.DATABASE_SSL === '1' ||
      urlHasSSL
    const sslConfig = useSSL
      ? {
          rejectUnauthorized:
            process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
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
  // Structured address fields for easier querying and display
  address_street: string | null
  address_extended: string | null // Deprecated: address line 2 not synced
  address_city: string | null
  address_state: string | null
  address_postal: string | null
  address_country: string | null
  birthday: Date | null
  homepage: string | null // Deprecated: use urls array
  urls: ContactField[] | null // Multiple URLs
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
}

export async function getAllContacts(): Promise<Contact[]> {
  const pool = getPool()
  const result = await pool.query(
    'SELECT * FROM contacts ORDER BY full_name, created_at DESC',
  )
  // Parse JSONB fields
  return result.rows.map((row) => {
    if (row.phones)
      row.phones =
        typeof row.phones === 'string' ? JSON.parse(row.phones) : row.phones
    if (row.emails)
      row.emails =
        typeof row.emails === 'string' ? JSON.parse(row.emails) : row.emails
    if (row.addresses)
      row.addresses =
        typeof row.addresses === 'string'
          ? JSON.parse(row.addresses)
          : row.addresses
    if (row.urls)
      row.urls = typeof row.urls === 'string' ? JSON.parse(row.urls) : row.urls
    return row
  })
}

export async function getContactById(id: string): Promise<Contact | null> {
  const pool = getPool()
  const result = await pool.query('SELECT * FROM contacts WHERE id = $1', [id])
  if (!result.rows[0]) return null
  // Parse JSONB fields
  const row = result.rows[0]
  if (row.phones)
    row.phones =
      typeof row.phones === 'string' ? JSON.parse(row.phones) : row.phones
  if (row.emails)
    row.emails =
      typeof row.emails === 'string' ? JSON.parse(row.emails) : row.emails
  if (row.addresses)
    row.addresses =
      typeof row.addresses === 'string'
        ? JSON.parse(row.addresses)
        : row.addresses
  if (row.urls)
    row.urls = typeof row.urls === 'string' ? JSON.parse(row.urls) : row.urls
  return row
}

export async function getContactByVcardId(
  vcardId: string,
): Promise<Contact | null> {
  const pool = getPool()
  const result = await pool.query(
    'SELECT * FROM contacts WHERE vcard_id = $1',
    [vcardId],
  )
  return result.rows[0] || null
}

/**
 * Find existing contact by email (case-insensitive)
 */
export async function getContactByEmail(
  email: string,
): Promise<Contact | null> {
  if (!email) return null
  const pool = getPool()
  const result = await pool.query(
    'SELECT * FROM contacts WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email],
  )
  return result.rows[0] || null
}

/**
 * Find existing contact by name and phone (for duplicate detection)
 */
export async function findDuplicateContact(
  fullName: string | null,
  email: string | null,
  phone: string | null,
): Promise<Contact | null> {
  const pool = getPool()

  // Try email first (most reliable)
  if (email) {
    const byEmail = await getContactByEmail(email)
    if (byEmail) return byEmail
  }

  // Try name + phone combination
  if (fullName && phone) {
    const result = await pool.query(
      'SELECT * FROM contacts WHERE LOWER(full_name) = LOWER($1) AND phone = $2 LIMIT 1',
      [fullName, phone],
    )
    if (result.rows[0]) return result.rows[0]
  }

  // Try just name (if it's a unique name)
  if (fullName && fullName !== 'Unnamed Contact') {
    const result = await pool.query(
      'SELECT * FROM contacts WHERE LOWER(full_name) = LOWER($1) LIMIT 1',
      [fullName],
    )
    if (result.rows[0]) return result.rows[0]
  }

  return null
}

export async function createContact(
  contact: Partial<Contact>,
): Promise<Contact> {
  const pool = getPool()

  // Check which columns exist in the database
  const columnCheck = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'contacts' AND table_schema = 'public'
  `)
  const existingColumns = new Set(
    columnCheck.rows.map((r: any) => r.column_name),
  )

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
    'address_street',
    'address_extended',
    'address_city',
    'address_state',
    'address_postal',
    'address_country',
    'birthday',
    'homepage',
    'urls',
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

  const columns: string[] = []
  const values: any[] = []
  const placeholders: string[] = []
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
          field === 'urls') &&
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
      field === 'urls'
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

  const result = await pool.query(
    `INSERT INTO contacts (${columns.join(', ')})
     VALUES (${placeholders.join(', ')})
     RETURNING *`,
    values,
  )
  // Parse JSONB fields
  const row = result.rows[0]
  if (row.phones)
    row.phones =
      typeof row.phones === 'string' ? JSON.parse(row.phones) : row.phones
  if (row.emails)
    row.emails =
      typeof row.emails === 'string' ? JSON.parse(row.emails) : row.emails
  if (row.addresses)
    row.addresses =
      typeof row.addresses === 'string'
        ? JSON.parse(row.addresses)
        : row.addresses
  if (row.urls)
    row.urls = typeof row.urls === 'string' ? JSON.parse(row.urls) : row.urls
  return row
}

export async function updateContact(
  id: string,
  contact: Partial<Contact>,
): Promise<Contact> {
  const pool = getPool()

  // Check which columns exist in the database
  const columnCheck = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'contacts' AND table_schema = 'public'
  `)
  const existingColumns = new Set(
    columnCheck.rows.map((r: any) => r.column_name),
  )

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
    'address_street',
    'address_extended',
    'address_city',
    'address_state',
    'address_postal',
    'address_country',
    'birthday',
    'homepage',
    'urls',
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
          field === 'urls') &&
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
  const result = await pool.query(
    `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values,
  )
  // Parse JSONB fields
  const row = result.rows[0]
  if (row.phones)
    row.phones =
      typeof row.phones === 'string' ? JSON.parse(row.phones) : row.phones
  if (row.emails)
    row.emails =
      typeof row.emails === 'string' ? JSON.parse(row.emails) : row.emails
  if (row.addresses)
    row.addresses =
      typeof row.addresses === 'string'
        ? JSON.parse(row.addresses)
        : row.addresses
  if (row.urls)
    row.urls = typeof row.urls === 'string' ? JSON.parse(row.urls) : row.urls
  return row
}

export async function deleteContact(id: string): Promise<void> {
  const pool = getPool()
  await pool.query('DELETE FROM contacts WHERE id = $1', [id])
}
