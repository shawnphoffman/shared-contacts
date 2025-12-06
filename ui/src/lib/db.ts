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

export interface Contact {
  id: string
  vcard_id: string | null
  full_name: string | null
  first_name: string | null
  last_name: string | null
  middle_name: string | null
  nickname: string | null
  maiden_name: string | null
  email: string | null
  phone: string | null
  organization: string | null
  job_title: string | null
  address: string | null
  birthday: Date | null
  homepage: string | null
  notes: string | null
  vcard_data: string | null
  created_at: Date
  updated_at: Date
}

export async function getAllContacts(): Promise<Contact[]> {
  const pool = getPool()
  const result = await pool.query(
    'SELECT * FROM contacts ORDER BY full_name, created_at DESC',
  )
  return result.rows
}

export async function getContactById(id: string): Promise<Contact | null> {
  const pool = getPool()
  const result = await pool.query('SELECT * FROM contacts WHERE id = $1', [id])
  return result.rows[0] || null
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

/**
 * Merge contact data, preferring non-null values from new data
 */
function mergeContactData(
  existing: Contact,
  newData: Partial<Contact>,
): Partial<Contact> {
  return {
    // Keep existing ID and timestamps
    id: existing.id,
    created_at: existing.created_at,
    // Merge fields - prefer new data if it exists and is not null/empty
    full_name: newData.full_name || existing.full_name,
    first_name: newData.first_name || existing.first_name,
    last_name: newData.last_name || existing.last_name,
    middle_name: newData.middle_name || existing.middle_name,
    nickname: newData.nickname || existing.nickname,
    maiden_name: newData.maiden_name || existing.maiden_name,
    email: newData.email || existing.email,
    phone: newData.phone || existing.phone,
    organization: newData.organization || existing.organization,
    job_title: newData.job_title || existing.job_title,
    address: newData.address || existing.address,
    birthday: newData.birthday || existing.birthday,
    homepage: newData.homepage || existing.homepage,
    notes: newData.notes || existing.notes,
    // Always update vCard data
    vcard_data: newData.vcard_data || existing.vcard_data,
    vcard_id: newData.vcard_id || existing.vcard_id,
  }
}

export async function createContact(
  contact: Partial<Contact>,
): Promise<Contact> {
  const pool = getPool()
  const result = await pool.query(
    `INSERT INTO contacts (vcard_id, full_name, first_name, last_name, middle_name, nickname, maiden_name, email, phone, organization, job_title, address, birthday, homepage, notes, vcard_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
      contact.organization || null,
      contact.job_title || null,
      contact.address || null,
      contact.birthday || null,
      contact.homepage || null,
      contact.notes || null,
      contact.vcard_data || null,
    ],
  )
  return result.rows[0]
}

export async function updateContact(
  id: string,
  contact: Partial<Contact>,
): Promise<Contact> {
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
    'organization',
    'job_title',
    'address',
    'birthday',
    'homepage',
    'notes',
    'vcard_data',
  ]

  for (const field of fields) {
    if (contact[field] !== undefined) {
      updates.push(`${field} = $${paramIndex}`)
      values.push(contact[field])
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
  return result.rows[0]
}

export async function deleteContact(id: string): Promise<void> {
  const pool = getPool()
  await pool.query('DELETE FROM contacts WHERE id = $1', [id])
}
